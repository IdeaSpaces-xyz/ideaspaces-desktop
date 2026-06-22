use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
