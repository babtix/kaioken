mod commands;
mod daemon;
mod term;

use std::sync::Mutex;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .manage(daemon::DaemonState {
            info: tokio::sync::watch::Sender::new(None),
            child: Mutex::new(None),
        })
        .manage(term::TermState::default())
        .invoke_handler(tauri::generate_handler![
            commands::daemon_info,
            commands::pick_folder,
            commands::reveal_path,
            commands::open_external,
            term::term_create,
            term::term_write,
            term::term_resize,
            term::term_ack,
            term::term_kill
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                supervise(handle).await;
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error building Kaioken")
        .run(|handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                term::kill_all(handle);
                daemon::stop(handle);
            }
        });
}

/// Spawns the daemon and keeps it alive: on a crash *after* a successful
/// handshake, retries up to 3 times with 1 s / 3 s / 9 s backoff (docs/09
/// -risks.md R6, docs/01-architecture.md §1.6). The window is shown after
/// the first handshake attempt settles either way, so a failing sidecar
/// shows an error screen instead of a blank window forever.
async fn supervise(handle: tauri::AppHandle) {
    let mut attempt = 0u32;
    const MAX_ATTEMPTS: u32 = 3;

    loop {
        match daemon::start(&handle).await {
            Ok((info, died_rx)) => {
                handle.state::<daemon::DaemonState>().info.send_replace(Some(info.clone()));
                let _ = handle.emit("daemon://up", info);
                show_main_window(&handle);

                attempt = 0; // a clean run resets the backoff counter
                let _ = died_rx.await;
                // Clear it so a `daemon_info` call made during the restart
                // window correctly waits for the *next* handshake instead of
                // returning the dead instance's now-stale info.
                handle.state::<daemon::DaemonState>().info.send_replace(None);
                let _ = handle.emit("daemon://down", ());
            }
            Err(e) => {
                show_main_window(&handle); // surface the error screen, not a blank window
                let _ = handle.emit("daemon://attempt-failed", e.to_string());
            }
        }

        attempt += 1;
        if attempt > MAX_ATTEMPTS {
            let _ = handle.emit("daemon://dead", format!("daemon failed after {MAX_ATTEMPTS} attempts"));
            return;
        }
        let backoff_secs = match attempt {
            1 => 1,
            2 => 3,
            _ => 9,
        };
        tokio::time::sleep(std::time::Duration::from_secs(backoff_secs)).await;
    }
}

fn show_main_window(handle: &tauri::AppHandle) {
    if let Some(w) = handle.get_webview_window("main") {
        let _ = w.show();
    }
}
