use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

#[derive(Clone, serde::Serialize)]
pub struct DaemonInfo {
    pub port: u16,
    pub token: String,
    pub version: String,
}

pub struct DaemonState {
    // A watch channel (not a plain Mutex) so `daemon_info` can *wait* for the
    // handshake to finish instead of racing it: the WebView's JS runs the
    // instant the window is created, well before `visible:false`'s window is
    // shown, and typically well before the sidecar has finished handshaking.
    pub info: tokio::sync::watch::Sender<Option<DaemonInfo>>,
    pub child: Mutex<Option<CommandChild>>,
}

/// Spawn the sidecar and wait for its one-line JSON handshake. The returned
/// receiver resolves once the daemon terminates *after* a successful
/// handshake, so the caller can tell a clean run from one that never
/// started — that distinction is what drives the restart-with-backoff policy
/// in lib.rs.
///
/// The token is generated here and written to the child's stdin rather than
/// passed on the command line, so it never appears in a process listing. The
/// same stdin pipe doubles as the child's death-watch: when this process
/// exits, the pipe closes, the daemon reads EOF and shuts itself down.
pub async fn start(
    app: &AppHandle,
) -> anyhow::Result<(DaemonInfo, tokio::sync::oneshot::Receiver<()>)> {
    let token: String = {
        use rand::Rng;
        let bytes: [u8; 32] = rand::thread_rng().gen();
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    };

    let (mut rx, mut child) = app
        .shell()
        .sidecar("kaioken-daemon")?
        .args(["daemon", "--port", "0", "--token-stdin"])
        .spawn()?;

    child.write(format!("{token}\n").as_bytes())?;

    // Handshake with a 10 s ceiling. Anything on stderr in that window is
    // captured so a failure can be shown to the user verbatim.
    let mut stderr_tail = String::new();
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(10);

    loop {
        let ev = tokio::time::timeout_at(deadline, rx.recv()).await;
        match ev {
            Err(_) => anyhow::bail!("daemon did not report a port within 10s\n{stderr_tail}"),
            Ok(None) => anyhow::bail!("daemon exited during startup\n{stderr_tail}"),
            Ok(Some(CommandEvent::Stdout(line))) => {
                let text = String::from_utf8_lossy(&line);
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(text.trim()) {
                    if v.get("kaioken_daemon").is_some() {
                        let info = DaemonInfo {
                            port: v["port"].as_u64().unwrap_or(0) as u16,
                            token: token.clone(),
                            version: v["version"].as_str().unwrap_or("?").to_string(),
                        };
                        log::info!(
                            "daemon handshake ok: port={} version={}",
                            info.port,
                            info.version
                        );
                        // Keep draining stdout/stderr into the log; a full
                        // pipe would otherwise block the daemon mid-run.
                        // The oneshot fires exactly when Terminated arrives,
                        // signalling the supervisor to restart.
                        let (died_tx, died_rx) = tokio::sync::oneshot::channel();
                        tauri::async_runtime::spawn(async move {
                            while let Some(ev) = rx.recv().await {
                                match ev {
                                    CommandEvent::Stderr(b) => {
                                        log::info!("daemon: {}", String::from_utf8_lossy(&b))
                                    }
                                    CommandEvent::Terminated(t) => {
                                        log::warn!("daemon exited: {t:?}");
                                        let _ = died_tx.send(());
                                        break;
                                    }
                                    _ => {}
                                }
                            }
                        });
                        app.state::<DaemonState>()
                            .child
                            .lock()
                            .unwrap()
                            .replace(child);
                        return Ok((info, died_rx));
                    }
                }
            }
            Ok(Some(CommandEvent::Stderr(b))) => {
                stderr_tail.push_str(&String::from_utf8_lossy(&b));
                if stderr_tail.len() > 4000 {
                    stderr_tail.drain(..2000);
                }
            }
            Ok(Some(CommandEvent::Terminated(t))) => {
                anyhow::bail!("daemon exited with {t:?}\n{stderr_tail}")
            }
            _ => {}
        }
    }
}

pub fn stop(app: &AppHandle) {
    if let Some(child) = app.state::<DaemonState>().child.lock().unwrap().take() {
        let _ = child.kill();
    }
}
