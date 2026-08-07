use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager};

/// Shrink and reposition the main window so a size restored from a previous
/// launch (the window-state plugin saves it verbatim) still fits the monitor the
/// app opens on — otherwise a window sized on a large external display stays huge
/// on a laptop, spilling off-screen. A maximized window already fits its monitor,
/// so it is left alone; only an oversized *free* window is clamped, to 90% of the
/// monitor and back inside its bounds. Best-effort: any failure leaves the window
/// as the plugin restored it.
fn clamp_window_to_monitor(win: &tauri::WebviewWindow) -> tauri::Result<()> {
    if win.is_maximized()? {
        return Ok(());
    }
    let Some(monitor) = win.current_monitor()? else {
        return Ok(());
    };
    let mon = monitor.size(); // physical px, same space as outer_size/position
    let mon_pos = monitor.position();

    // Never let the window exceed 90% of the monitor — leaves room for the OS
    // menu bar / dock and gives an on-switch window visible breathing room.
    let max_w = (mon.width as f64 * 0.9) as u32;
    let max_h = (mon.height as f64 * 0.9) as u32;
    let size = win.outer_size()?;
    let new_w = size.width.min(max_w).max(1);
    let new_h = size.height.min(max_h).max(1);
    if new_w != size.width || new_h != size.height {
        win.set_size(tauri::PhysicalSize::new(new_w, new_h))?;
    }

    // Pull the window back onto this monitor if the restored position spills off.
    let size = win.outer_size()?;
    let pos = win.outer_position()?;
    let right = mon_pos.x + mon.width as i32;
    let bottom = mon_pos.y + mon.height as i32;
    let x = pos
        .x
        .max(mon_pos.x)
        .min((right - size.width as i32).max(mon_pos.x));
    let y = pos
        .y
        .max(mon_pos.y)
        .min((bottom - size.height as i32).max(mon_pos.y));
    if x != pos.x || y != pos.y {
        win.set_position(tauri::PhysicalPosition::new(x, y))?;
    }
    Ok(())
}

/// Open the OS print panel for the calling window. The frontend renders the
/// note into an offscreen `#pdf-print-root` and flips it visible under
/// `@media print`, so the panel prints just the note (with "Save as PDF").
/// The webview's own `window.print()` is a no-op in WKWebView, so this native
/// path is the only way to reach the print dialog on macOS.
#[tauri::command]
fn print_page(window: tauri::WebviewWindow) -> Result<(), String> {
    window.print().map_err(|e| e.to_string())
}

/// Absolute path to the bundled `pi` sidecar, for handing to the CLI as
/// `--pi-bin` (the CLI spawns pi for local conversations). Tauri places external
/// binaries next to the app executable and strips the target-triple suffix, so
/// resolve it relative to `current_exe`. Errs when absent — dev without
/// `build:pi-sidecar`, where the caller falls back to the user's PATH `pi`.
#[tauri::command]
fn pi_bin_path() -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().ok_or("no parent dir for current_exe")?;
    let pi = dir.join(if cfg!(windows) { "pi.exe" } else { "pi" });
    if pi.exists() {
        Ok(pi.to_string_lossy().into_owned())
    } else {
        Err(format!("bundled pi not found at {}", pi.display()))
    }
}

/// Absolute path to the bundled `ideaspaces` CLI sidecar, to hand pi as
/// `IS_CLI_PATH`. The bundled pi-is-space extension shells the CLI (for
/// `status`/`navigate`) via that env var; without it, a packaged app would find
/// neither a `node_modules` copy nor a PATH `ideaspaces`. Resolved next to
/// `current_exe`, like `pi_bin_path`. Errs when absent — dev, where the CLI is
/// found via node_modules instead.
#[tauri::command]
fn cli_bin_path() -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().ok_or("no parent dir for current_exe")?;
    let cli = dir.join(if cfg!(windows) {
        "ideaspaces.exe"
    } else {
        "ideaspaces"
    });
    if cli.exists() {
        Ok(cli.to_string_lossy().into_owned())
    } else {
        Err(format!(
            "bundled ideaspaces CLI not found at {}",
            cli.display()
        ))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            print_page,
            pi_bin_path,
            cli_bin_path
        ])
        // Native macOS menu bar. We set a custom menu to add "Check for
        // Updates…" under the app menu — so we MUST re-add the standard Edit
        // roles (copy/paste/undo) the editor relies on, plus Window. The
        // check-updates item emits an event the frontend's updater listens for.
        .menu(|handle| {
            let check_updates =
                MenuItemBuilder::with_id("check-updates", "Check for Updates…").build(handle)?;
            let app_menu = SubmenuBuilder::new(handle, "IdeaSpaces")
                .about(None)
                .item(&check_updates)
                .separator()
                .services()
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;
            let edit_menu = SubmenuBuilder::new(handle, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;
            let window_menu = SubmenuBuilder::new(handle, "Window")
                .minimize()
                .separator()
                .close_window()
                .build()?;
            MenuBuilder::new(handle)
                .items(&[&app_menu, &edit_menu, &window_menu])
                .build()
        })
        .on_menu_event(|app, event| {
            if event.id() == "check-updates" {
                // The updater state lives in the frontend — nudge it to check.
                let _ = app.emit("menu://check-updates", ());
            }
        })
        .plugin(tauri_plugin_opener::init())
        // The bundled @ideaspaces/cli sidecar is the desktop's backend for
        // login/clone/sync. It is invoked from the frontend via the shell
        // plugin, scoped in capabilities/default.json.
        .plugin(tauri_plugin_shell::init())
        // Native folder picker for choosing where to clone a space.
        .plugin(tauri_plugin_dialog::init())
        // Durable settings (the workspace dir preference).
        .plugin(tauri_plugin_store::Builder::default().build())
        // Raw read/write of a local clone's note files for the editor. Git
        // (commit/push) stays in the CLI sidecar; the webview only touches
        // file *content*. Scoped to the home tree in capabilities; macOS TCC
        // gates protected folders (Documents/Desktop/Downloads/Dropbox) on top.
        .plugin(tauri_plugin_fs::init())
        // Copy a doc/path to the clipboard (the copy-path buttons).
        .plugin(tauri_plugin_clipboard_manager::init())
        // Remember the window's size + position across launches (auto-saves on
        // exit, restores on start) — the config width/height is just the first-run
        // default. No JS/capability needed; the plugin works off window events.
        .plugin(tauri_plugin_window_state::Builder::default().build())
        // Auto-update — the frontend calls `check()`, downloads + verifies the
        // signed update, and relaunches via the process plugin. Endpoint +
        // public key live in tauri.conf.json; signing happens in CI.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // After the window-state plugin restores geometry, clamp the main window
        // to the monitor it opened on so a size saved on a bigger display doesn't
        // stay oversized on a laptop.
        .setup(|app| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = clamp_window_to_monitor(&win);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
