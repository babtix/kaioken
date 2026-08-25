use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::daemon::{DaemonInfo, DaemonState};

/// Waits for the daemon handshake rather than racing it: the WebView starts
/// executing JS the instant the window is created, which is usually well
/// before the sidecar has finished starting. The 10 s ceiling mirrors the
/// handshake timeout in daemon.rs — if that gives up, this should too.
#[tauri::command]
pub async fn daemon_info(state: tauri::State<'_, DaemonState>) -> Result<DaemonInfo, String> {
    let mut rx = state.info.subscribe();
    if let Some(info) = rx.borrow().clone() {
        return Ok(info);
    }
    let wait = async {
        loop {
            if rx.changed().await.is_err() {
                return Err("daemon state channel closed".to_string());
            }
            if let Some(info) = rx.borrow().clone() {
                return Ok(info);
            }
        }
    };
    tokio::time::timeout(std::time::Duration::from_secs(10), wait)
        .await
        .unwrap_or_else(|_| Err("daemon not ready".to_string()))
}

/// Native folder picker for "Open repository".
#[tauri::command]
pub async fn pick_folder(app: AppHandle, title: String) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title(title)
        .pick_folder(move |result| {
            let _ = tx.send(result);
        });
    match rx.await {
        Ok(picked) => Ok(picked.map(|p| p.to_string())),
        Err(_) => Err("folder picker closed unexpectedly".to_string()),
    }
}

/// Reveal a file in Explorer / Finder / the desktop file manager.
#[tauri::command]
pub fn reveal_path(app: AppHandle, path: String) -> Result<(), String> {
    app.opener()
        .reveal_items_in_dir([path])
        .map_err(|e| e.to_string())
}

/// Only ordinary http(s) links may be opened externally. Everything else —
/// `file://`, `javascript:`, a custom scheme — is rejected: a generated wiki
/// document is model output and therefore untrusted input.
fn is_allowed_external_url(url: &str) -> bool {
    url.starts_with("http://") || url.starts_with("https://")
}

/// Open a URL in the user's real browser, never in the WebView.
#[tauri::command]
pub fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    if !is_allowed_external_url(&url) {
        return Err(format!("refusing to open non-http(s) URL: {url}"));
    }
    app.opener()
        .open_url(url, None::<String>)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_file_scheme() {
        assert!(!is_allowed_external_url("file:///etc/passwd"));
    }

    #[test]
    fn rejects_javascript_scheme() {
        assert!(!is_allowed_external_url("javascript:alert(1)"));
    }

    #[test]
    fn rejects_custom_scheme() {
        assert!(!is_allowed_external_url("myapp://do-something"));
    }

    #[test]
    fn allows_http_and_https() {
        assert!(is_allowed_external_url("http://example.com"));
        assert!(is_allowed_external_url("https://example.com/wiki/Doc.md"));
    }
}
