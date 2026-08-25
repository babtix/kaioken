//! Integrated terminal sessions: one ConPTY-backed PowerShell (or `$SHELL`)
//! per Editor terminal tab, streamed to the WebView as raw bytes over a
//! point-to-point IPC channel. xterm.js owns UTF-8 decoding, so nothing here
//! ever interprets the byte stream — a multibyte character split across two
//! reads must survive the trip intact.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU32, AtomicUsize, Ordering};
use std::sync::mpsc::{sync_channel, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Emitter, Manager};

/// Size bounds mirror cli/internal/termpty/termpty.go — a 0×0 resize from a
/// collapsed panel must never reach ConPTY.
const MIN_COLS: u16 = 1;
const MAX_COLS: u16 = 500;
const MIN_ROWS: u16 = 1;
const MAX_ROWS: u16 = 300;

/// Flow control (the VS Code pattern): pause PTY reads once this many bytes
/// are in flight without an ack from xterm, resume below the low mark. The
/// blocked ConPTY pipe then throttles the child process itself.
const UNACKED_HIGH: usize = 512 * 1024;
const UNACKED_LOW: usize = 256 * 1024;
/// A dead WebView never acks; give up waiting after this long and let the
/// failing channel send tear the session down instead.
const ACK_STALL_LIMIT: Duration = Duration::from_secs(5);

/// Output coalescing: flush a batch when it has been sitting this long or
/// grows past this size, whichever comes first. The first chunk after idle
/// still flushes within one window, keeping keystroke echo under ~10 ms.
const FLUSH_WINDOW: Duration = Duration::from_millis(8);
const FLUSH_MAX: usize = 128 * 1024;

pub struct TermSession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
    unacked: Arc<AtomicUsize>,
}

#[derive(Default)]
pub struct TermState {
    sessions: Mutex<HashMap<u32, TermSession>>,
    next_id: AtomicU32,
}

#[derive(Clone, Serialize)]
struct TermExit {
    id: u32,
    exit_code: Option<u32>,
}

/// Prefer PowerShell 7 when it is on PATH, mirroring `DefaultShell` in
/// cli/internal/termpty/termpty_windows.go; Windows PowerShell 5.1 ships with
/// the OS and is the fallback. Elsewhere the login shell wins.
fn default_shell() -> (String, Vec<String>) {
    if cfg!(windows) {
        let shell = if on_path("pwsh.exe") { "pwsh.exe" } else { "powershell.exe" };
        (shell.to_string(), vec!["-NoLogo".to_string()])
    } else {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
        (shell, vec![])
    }
}

fn on_path(exe: &str) -> bool {
    let Some(path) = std::env::var_os("PATH") else { return false };
    std::env::split_paths(&path).any(|dir| dir.join(exe).is_file())
}

fn clamp_size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        cols: cols.clamp(MIN_COLS, MAX_COLS),
        rows: rows.clamp(MIN_ROWS, MAX_ROWS),
        pixel_width: 0,
        pixel_height: 0,
    }
}

#[tauri::command]
pub fn term_create(
    app: AppHandle,
    state: tauri::State<'_, TermState>,
    cwd: String,
    cols: u16,
    rows: u16,
    on_data: Channel<InvokeResponseBody>,
) -> Result<u32, String> {
    let pty = native_pty_system()
        .openpty(clamp_size(cols, rows))
        .map_err(|e| format!("open pty: {e}"))?;

    let (shell, args) = default_shell();
    let mut cmd = CommandBuilder::new(&shell);
    cmd.args(&args);
    if !cwd.is_empty() && std::path::Path::new(&cwd).is_dir() {
        cmd.cwd(&cwd);
    }
    if !cfg!(windows) {
        cmd.env("TERM", "xterm-256color");
    }

    let child = pty
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("spawn {shell}: {e}"))?;
    // The slave's handles are the child's now; holding ours open would keep
    // the reader from ever seeing EOF.
    drop(pty.slave);

    let killer = child.clone_killer();
    let reader = pty
        .master
        .try_clone_reader()
        .map_err(|e| format!("clone reader: {e}"))?;
    let writer = pty
        .master
        .take_writer()
        .map_err(|e| format!("take writer: {e}"))?;

    let id = state.next_id.fetch_add(1, Ordering::Relaxed) + 1;
    let unacked = Arc::new(AtomicUsize::new(0));
    state.sessions.lock().unwrap().insert(
        id,
        TermSession { writer, master: pty.master, killer, unacked: unacked.clone() },
    );

    // Waiter thread: the ONLY reliable exit signal on Windows. A ConPTY
    // reader does not see EOF when the shell exits — the output pipe stays
    // open until the pseudoconsole itself is closed — so blocking on
    // child.wait() here, then dropping the session (which closes the master
    // and unblocks the reader), is what turns "shell ran `exit`" into a
    // closed tab instead of a frozen one.
    let waiter_app = app.clone();
    std::thread::Builder::new()
        .name(format!("term-wait-{id}"))
        .spawn(move || {
            let mut child = child;
            let exit_code = child.wait().ok().map(|status| status.exit_code());
            let state = waiter_app.state::<TermState>();
            drop(state.sessions.lock().unwrap().remove(&id));
            log::info!("term {id}: exited with {exit_code:?}");
            let _ = waiter_app.emit("term://exit", TermExit { id, exit_code });
        })
        .map_err(|e| format!("spawn waiter: {e}"))?;

    // Reader thread: blocking PTY reads (never on the async pool) into a
    // bounded queue, so a stalled pump backpressures straight to the pipe.
    let (tx, rx) = sync_channel::<Vec<u8>>(16);
    std::thread::Builder::new()
        .name(format!("term-read-{id}"))
        .spawn(move || {
            let mut reader = reader;
            let mut buf = vec![0u8; 16 * 1024];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break, // EOF: shell exited or master dropped
                    Ok(n) => {
                        if tx.send(buf[..n].to_vec()).is_err() {
                            break; // pump gone: frontend disappeared
                        }
                    }
                }
            }
        })
        .map_err(|e| format!("spawn reader: {e}"))?;

    // Pump thread: coalesce chunks into ≤8 ms / ≤128 KiB batches, honour ack
    // flow control. Exit reporting belongs to the waiter thread; this one
    // only makes sure the child dies if the channel goes away first (webview
    // reload) — the waiter then observes that death and cleans up.
    std::thread::Builder::new()
        .name(format!("term-pump-{id}"))
        .spawn(move || {
            'pump: loop {
                // Wait out the high-water mark before pulling more output.
                let stall_start = Instant::now();
                while unacked.load(Ordering::Acquire) > UNACKED_HIGH {
                    if stall_start.elapsed() > ACK_STALL_LIMIT {
                        log::warn!("term {id}: ack stall > {ACK_STALL_LIMIT:?}, forcing a send");
                        break; // acks stopped coming; let send() decide below
                    }
                    std::thread::sleep(Duration::from_millis(5));
                    if unacked.load(Ordering::Acquire) < UNACKED_LOW {
                        break;
                    }
                }

                let Ok(first) = rx.recv() else {
                    log::info!("term {id}: reader closed (shell EOF)");
                    break 'pump;
                };
                let mut batch = first;
                let deadline = Instant::now() + FLUSH_WINDOW;
                while batch.len() < FLUSH_MAX {
                    let now = Instant::now();
                    if now >= deadline {
                        break;
                    }
                    match rx.recv_timeout(deadline - now) {
                        Ok(chunk) => batch.extend_from_slice(&chunk),
                        Err(RecvTimeoutError::Timeout) => break,
                        Err(RecvTimeoutError::Disconnected) => {
                            // Flush what we have, then exit on the next recv.
                            break;
                        }
                    }
                }

                unacked.fetch_add(batch.len(), Ordering::AcqRel);
                if let Err(e) = on_data.send(InvokeResponseBody::Raw(batch)) {
                    log::info!("term {id}: channel send failed ({e}), tearing down");
                    break 'pump; // channel dead (webview reloaded/closed)
                }
            }

            // The channel died or the reader saw EOF: make sure the shell is
            // gone. The waiter thread notices the death and does the rest.
            let state = app.state::<TermState>();
            let session = state.sessions.lock().unwrap().remove(&id);
            if let Some(mut s) = session {
                let _ = s.killer.kill();
                drop(s); // closes ConPTY, which detaches the console tree
            }
        })
        .map_err(|e| format!("spawn pump: {e}"))?;

    Ok(id)
}

#[tauri::command]
pub fn term_write(state: tauri::State<'_, TermState>, id: u32, data: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    let s = sessions.get_mut(&id).ok_or_else(|| format!("no terminal {id}"))?;
    s.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    s.writer.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn term_resize(
    state: tauri::State<'_, TermState>,
    id: u32,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    let s = sessions.get(&id).ok_or_else(|| format!("no terminal {id}"))?;
    s.master.resize(clamp_size(cols, rows)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn term_ack(state: tauri::State<'_, TermState>, id: u32, bytes: usize) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    if let Some(s) = sessions.get(&id) {
        let _ = s
            .unacked
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |v| Some(v.saturating_sub(bytes)));
    }
    Ok(())
}

#[tauri::command]
pub fn term_kill(state: tauri::State<'_, TermState>, id: u32) -> Result<(), String> {
    // Dropping the session closes the ConPTY/master, so the reader hits EOF
    // and the pump thread reaps the child and emits term://exit.
    let session = state.sessions.lock().unwrap().remove(&id);
    if let Some(mut s) = session {
        let _ = s.killer.kill();
    }
    Ok(())
}

/// App-exit sweep, called from the ExitRequested handler beside daemon::stop —
/// no PowerShell may outlive its window.
pub fn kill_all(handle: &AppHandle) {
    let state = handle.state::<TermState>();
    let mut sessions = state.sessions.lock().unwrap();
    for s in sessions.values_mut() {
        let _ = s.killer.kill();
    }
    sessions.clear();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamps_zero_size() {
        let s = clamp_size(0, 0);
        assert_eq!((s.cols, s.rows), (MIN_COLS, MIN_ROWS));
    }

    #[test]
    fn clamps_oversized() {
        let s = clamp_size(10_000, 10_000);
        assert_eq!((s.cols, s.rows), (MAX_COLS, MAX_ROWS));
    }

    #[test]
    fn passes_normal_size_through() {
        let s = clamp_size(120, 30);
        assert_eq!((s.cols, s.rows), (120, 30));
    }

    #[cfg(windows)]
    #[test]
    fn windows_shell_is_powershell() {
        let (shell, args) = default_shell();
        assert!(shell == "pwsh.exe" || shell == "powershell.exe");
        assert_eq!(args, vec!["-NoLogo".to_string()]);
    }
}
