#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // The bundled @ideaspaces/cli sidecar is the desktop's backend for
        // login/clone/sync. It is invoked from the frontend via the shell
        // plugin, scoped in capabilities/default.json.
        .plugin(tauri_plugin_shell::init())
        // Native folder picker for choosing where to clone a space.
        .plugin(tauri_plugin_dialog::init())
        // Durable settings (the workspace dir preference).
        .plugin(tauri_plugin_store::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
