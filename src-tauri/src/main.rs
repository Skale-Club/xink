// Xink: a transparent always-on-top layer for drawing over the screen.
//
// Two windows:
// - "overlay": covers one monitor. In draw mode it takes the mouse; in
//   pass-through mode clicks go to the programs below, but the drawing stays.
// - "toolbar": small floating bar owned by the overlay (so it always stays
//   above it) and, by default, hidden from screen capture.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod mcp;
mod mcp_tools;
mod portable;
mod updater;

use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, process::Command, sync::Mutex};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, LogicalSize, Manager, Monitor, PhysicalPosition, RunEvent, State,
    WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

const LANGUAGES: [(&str, &str); 3] = [("en", "English"), ("pt", "Português"), ("es", "Español")];

/// Settings kept in Data/xink.json beside the executable.
#[derive(Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct Config {
    language: String,
    draw_hotkey: String,
    toolbar_hotkey: String,
    clear_hotkey: String,
    colors: Vec<String>,
    width: f64,
    laser_seconds: f64,
    hide_toolbar_from_recording: bool,
    /// "horizontal" or "vertical".
    toolbar_orientation: String,
    /// Top-left corner of the toolbar in physical pixels, saved on exit.
    toolbar_position: Option<[i32; 2]>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            language: "en".into(),
            draw_hotkey: "Ctrl+Shift+D".into(),
            toolbar_hotkey: "Ctrl+Shift+H".into(),
            clear_hotkey: "Ctrl+Shift+X".into(),
            colors: ["#FF3B30", "#FFCC00", "#34C759", "#0A84FF", "#FFFFFF", "#111111"]
                .map(String::from)
                .to_vec(),
            width: 4.0,
            laser_seconds: 1.5,
            hide_toolbar_from_recording: true,
            toolbar_orientation: "horizontal".into(),
            toolbar_position: None,
        }
    }
}

/// Tray menu texts. The toolbar has its own table in i18n.js.
struct Labels {
    draw: &'static str,
    toolbar: &'static str,
    clear: &'static str,
    language: &'static str,
    settings: &'static str,
    quit: &'static str,
    tooltip: &'static str,
    update: &'static str,
}

fn labels(language: &str) -> Labels {
    match language {
        "pt" => Labels {
            draw: "Desenhar / mouse",
            toolbar: "Mostrar / esconder barra",
            clear: "Limpar tela",
            language: "Idioma",
            settings: "Configurações (xink.json)",
            quit: "Sair do Xink",
            tooltip: "Xink, da Skale Club: clique para mostrar ou esconder a barra",
            update: "Atualizar para a versão",
        },
        "es" => Labels {
            draw: "Dibujar / ratón",
            toolbar: "Mostrar / ocultar barra",
            clear: "Limpiar pantalla",
            language: "Idioma",
            settings: "Configuración (xink.json)",
            quit: "Salir de Xink",
            tooltip: "Xink, de Skale Club: haz clic para mostrar u ocultar la barra",
            update: "Actualizar a la versión",
        },
        _ => Labels {
            draw: "Draw / mouse",
            toolbar: "Show / hide toolbar",
            clear: "Clear screen",
            language: "Language",
            settings: "Settings (xink.json)",
            quit: "Quit Xink",
            tooltip: "Xink by Skale Club: click to show or hide the toolbar",
            update: "Update to version",
        },
    }
}

struct AppState {
    config: Mutex<Config>,
    drawing: Mutex<bool>,
    /// Name of the monitor the overlay currently covers.
    monitor: Mutex<String>,
    toolbar_placed: Mutex<bool>,
    /// A newer release found on GitHub; offered in the tray menu.
    update: Mutex<Option<updater::Update>>,
}

fn config_path() -> PathBuf {
    portable::data_dir().join("xink.json")
}

fn save_config(config: &Config) {
    if let Ok(text) = serde_json::to_string_pretty(config) {
        let _ = fs::write(config_path(), text);
    }
}

/// Reads xink.json, writing the defaults on first run. A broken file is left
/// untouched (so the user's edits are not lost) and the defaults are used.
fn load_config() -> Config {
    match fs::read_to_string(config_path()) {
        // Some editors save UTF-8 with a BOM, which serde_json rejects.
        Ok(text) => serde_json::from_str(text.trim_start_matches('\u{feff}')).unwrap_or_default(),
        Err(_) => {
            let config = Config::default();
            save_config(&config);
            config
        }
    }
}

fn monitor_key(monitor: &Monitor) -> String {
    monitor.name().cloned().unwrap_or_else(|| {
        let p = monitor.position();
        format!("{},{}", p.x, p.y)
    })
}

/// Moves the overlay onto the monitor under the mouse cursor. Each monitor
/// keeps its own drawing, so the page is told when the monitor changes.
fn fit_overlay(app: &AppHandle, overlay: &WebviewWindow) {
    let monitors = overlay.available_monitors().unwrap_or_default();
    let target = overlay
        .cursor_position()
        .ok()
        .and_then(|c| {
            monitors
                .iter()
                .find(|m| {
                    let (p, s) = (m.position(), m.size());
                    c.x >= p.x as f64
                        && c.y >= p.y as f64
                        && c.x < p.x as f64 + s.width as f64
                        && c.y < p.y as f64 + s.height as f64
                })
                .cloned()
        })
        .or_else(|| overlay.primary_monitor().ok().flatten());
    let Some(monitor) = target else { return };

    let key = monitor_key(&monitor);
    let (position, size) = (*monitor.position(), *monitor.size());
    let state = app.state::<AppState>();
    let mut current = state.monitor.lock().unwrap();
    let same_bounds = overlay.outer_position().ok() == Some(position)
        && overlay.outer_size().ok() == Some(size);
    if *current == key && same_bounds {
        return;
    }
    // Position first: crossing to a monitor with another DPI rescales the window.
    let _ = overlay.set_position(position);
    let _ = overlay.set_size(size);
    if *current != key {
        *current = key.clone();
        let _ = app.emit("monitor", key);
    }
}

fn set_mode(app: &AppHandle, drawing: bool) {
    *app.state::<AppState>().drawing.lock().unwrap() = drawing;
    if let Some(overlay) = app.get_webview_window("overlay") {
        if drawing {
            fit_overlay(app, &overlay);
        }
        let _ = overlay.set_ignore_cursor_events(!drawing);
        if drawing {
            let _ = overlay.set_focus();
        }
    }
    let _ = app.emit("mode", drawing);
}

fn toggle_mode(app: &AppHandle) {
    let drawing = *app.state::<AppState>().drawing.lock().unwrap();
    set_mode(app, !drawing);
}

fn toggle_toolbar(app: &AppHandle) {
    if let Some(toolbar) = app.get_webview_window("toolbar") {
        if toolbar.is_visible().unwrap_or(false) {
            let _ = toolbar.hide();
        } else {
            let _ = toolbar.show();
        }
    }
}

/// Switches the interface language, saves it and refreshes tray and toolbar.
fn set_language(app: &AppHandle, language: &str) {
    if !LANGUAGES.iter().any(|(code, _)| *code == language) {
        return;
    }
    let config = {
        let state = app.state::<AppState>();
        let mut config = state.config.lock().unwrap();
        config.language = language.into();
        save_config(&config);
        config.clone()
    };
    refresh_tray(app, &config);
    let _ = app.emit("language", language);
}

/// Rebuilds the tray menu and tooltip (language changed, update found).
fn refresh_tray(app: &AppHandle, config: &Config) {
    let Some(tray) = app.tray_by_id("xink") else { return };
    if let Ok(menu) = build_menu(app, config) {
        let _ = tray.set_menu(Some(menu));
    }
    let _ = tray.set_tooltip(Some(tooltip(app, config)));
}

fn tooltip(app: &AppHandle, config: &Config) -> String {
    let t = labels(&config.language);
    match &*app.state::<AppState>().update.lock().unwrap() {
        Some(update) => format!("{}\n{} {}", t.tooltip, t.update, update.version),
        None => t.tooltip.to_string(),
    }
}

/// Checks GitHub once at startup; a newer version shows up in the tray menu.
fn check_update(app: AppHandle) {
    std::thread::spawn(move || {
        let Ok(Some(update)) = updater::check() else { return };
        *app.state::<AppState>().update.lock().unwrap() = Some(update);
        let config = app.state::<AppState>().config.lock().unwrap().clone();
        refresh_tray(&app, &config);
    });
}

/// Downloads, verifies and swaps the exe, then exits so the new copy runs.
fn install_update(app: &AppHandle) {
    let Some(update) = app.state::<AppState>().update.lock().unwrap().clone() else { return };
    let app = app.clone();
    std::thread::spawn(move || {
        if updater::install(&update).is_ok() {
            app.exit(0);
        }
    });
}

#[tauri::command]
fn get_config(state: State<AppState>) -> Config {
    state.config.lock().unwrap().clone()
}

#[tauri::command]
fn get_mode(state: State<AppState>) -> bool {
    *state.drawing.lock().unwrap()
}

#[tauri::command]
fn overlay_monitor(state: State<AppState>) -> String {
    state.monitor.lock().unwrap().clone()
}

#[tauri::command]
fn set_drawing(app: AppHandle, drawing: bool) {
    set_mode(&app, drawing);
}

/// The toolbar page measures itself and asks for a fitting window. The first
/// time, the bar is also placed (where it was last time, if that spot is still
/// on a monitor, else centred at the top) and shown.
#[tauri::command]
fn set_toolbar_size(app: AppHandle, state: State<AppState>, width: f64, height: f64) {
    let Some(toolbar) = app.get_webview_window("toolbar") else { return };
    let _ = toolbar.set_size(LogicalSize::new(width, height));
    let mut placed = state.toolbar_placed.lock().unwrap();
    if *placed {
        return;
    }
    *placed = true;

    let saved = state.config.lock().unwrap().toolbar_position;
    let monitors = toolbar.available_monitors().unwrap_or_default();
    let on_screen = |x: i32, y: i32| {
        monitors.iter().any(|m| {
            let (p, s) = (m.position(), m.size());
            x >= p.x && y >= p.y && x < p.x + s.width as i32 && y < p.y + s.height as i32
        })
    };
    match saved {
        Some([x, y]) if on_screen(x + 24, y + 24) => {
            let _ = toolbar.set_position(PhysicalPosition::new(x, y));
        }
        _ => {
            if let Ok(Some(monitor)) = toolbar.current_monitor() {
                let scale = monitor.scale_factor();
                let (p, s) = (monitor.position(), monitor.size());
                let w = (width * scale) as i32;
                let _ = toolbar.set_position(PhysicalPosition::new(
                    p.x + (s.width as i32 - w) / 2,
                    p.y + (16.0 * scale) as i32,
                ));
            }
        }
    }
    let _ = toolbar.show();
}

#[tauri::command]
fn set_toolbar_orientation(state: State<AppState>, orientation: String) {
    let mut config = state.config.lock().unwrap();
    config.toolbar_orientation = orientation;
    save_config(&config);
}

#[tauri::command]
fn open_config() {
    let _ = Command::new("notepad.exe").arg(config_path()).spawn();
}

/// Opens the Skale Club website in the default browser.
#[tauri::command]
fn open_site() {
    let _ = Command::new("explorer.exe").arg("https://skale.club").spawn();
}
#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

fn create_windows(app: &AppHandle, config: &Config) -> tauri::Result<()> {
    let overlay = WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("overlay.html".into()))
        .title("Xink")
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .visible(false)
        .build()?;
    fit_overlay(app, &overlay);
    overlay.set_ignore_cursor_events(true)?;
    overlay.show()?;

    // Shown by set_toolbar_size once the page has measured itself.
    WebviewWindowBuilder::new(app, "toolbar", WebviewUrl::App("toolbar.html".into()))
        .title("Xink")
        .parent(&overlay)?
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .content_protected(config.hide_toolbar_from_recording)
        .inner_size(900.0, 64.0)
        .position(0.0, 0.0)
        .visible(false)
        .build()?;
    Ok(())
}

fn register_shortcuts(app: &AppHandle, config: &Config) -> tauri::Result<()> {
    let parse = |text: &str, fallback: &str| {
        text.parse::<Shortcut>()
            .or_else(|_| fallback.parse::<Shortcut>())
            .ok()
    };
    let draw = parse(&config.draw_hotkey, "Ctrl+Shift+D");
    let bar = parse(&config.toolbar_hotkey, "Ctrl+Shift+H");
    let clear = parse(&config.clear_hotkey, "Ctrl+Shift+X");

    app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |app, shortcut, event| {
                if event.state() != ShortcutState::Pressed {
                    return;
                }
                let shortcut = Some(*shortcut);
                if shortcut == draw {
                    toggle_mode(app);
                } else if shortcut == bar {
                    toggle_toolbar(app);
                } else if shortcut == clear {
                    let _ = app.emit("clear", ());
                }
            })
            .build(),
    )?;
    // A shortcut taken by another program is skipped; the tray still works.
    for shortcut in [draw, bar, clear].into_iter().flatten() {
        let _ = app.global_shortcut().register(shortcut);
    }
    Ok(())
}

fn build_menu(app: &AppHandle, config: &Config) -> tauri::Result<Menu<tauri::Wry>> {
    let t = labels(&config.language);
    let item = |id: &str, text: String| MenuItem::with_id(app, id, text, true, None::<&str>);
    let toggle = item("toggle", format!("{}\t{}", t.draw, config.draw_hotkey))?;
    let toolbar = item("toolbar", format!("{}\t{}", t.toolbar, config.toolbar_hotkey))?;
    let clear = item("clear", format!("{}\t{}", t.clear, config.clear_hotkey))?;
    let settings = item("settings", t.settings.into())?;
    let site = item("site", "Skale Club · skale.club".into())?;
    let quit = item("quit", t.quit.into())?;
    let separator = PredefinedMenuItem::separator(app)?;

    let choices = LANGUAGES
        .iter()
        .map(|(code, name)| {
            CheckMenuItem::with_id(
                app,
                format!("lang:{code}"),
                *name,
                true,
                config.language == *code,
                None::<&str>,
            )
        })
        .collect::<tauri::Result<Vec<_>>>()?;
    let choice_refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> =
        choices.iter().map(|c| c as &dyn tauri::menu::IsMenuItem<tauri::Wry>).collect();
    let language = Submenu::with_id_and_items(app, "language", t.language, true, &choice_refs)?;

    let pending = app.state::<AppState>().update.lock().unwrap().as_ref().map(|u| u.version.clone());
    let update = match pending {
        Some(version) => Some(item("update", format!("{} {version}", t.update))?),
        None => None,
    };
    let update_separator = PredefinedMenuItem::separator(app)?;
    let mut items: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = Vec::new();
    if let Some(update) = &update {
        items.push(update);
        items.push(&update_separator);
    }
    items.extend([
        &toggle as &dyn tauri::menu::IsMenuItem<tauri::Wry>,
        &toolbar,
        &clear,
        &separator,
        &language,
        &settings,
        &site,
        &quit,
    ]);
    Menu::with_items(app, &items)
}

fn create_tray(app: &AppHandle, config: &Config) -> tauri::Result<()> {
    let mut tray = TrayIconBuilder::with_id("xink")
        .tooltip(tooltip(app, config))
        .menu(&build_menu(app, config)?)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "toggle" => toggle_mode(app),
            "toolbar" => toggle_toolbar(app),
            "clear" => {
                let _ = app.emit("clear", ());
            }
            "settings" => open_config(),
            "site" => open_site(),
            "update" => install_update(app),
            "quit" => app.exit(0),
            id => {
                if let Some(language) = id.strip_prefix("lang:") {
                    set_language(app, language);
                }
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_toolbar(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

fn main() {
    // Before the single-instance check, so a just-updated copy doesn't see the
    // old one still running and quit.
    updater::finish_previous();
    portable::migrate(&["xink.json"]);
    portable::sync_appinfo();
    if mcp::requested() {
        return mcp_tools::serve();
    }
    let config = load_config();
    tauri::Builder::default()
        // Opening Xink again just brings the toolbar back.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(toolbar) = app.get_webview_window("toolbar") {
                let _ = toolbar.show();
            }
        }))
        .manage(AppState {
            config: Mutex::new(config.clone()),
            drawing: Mutex::new(false),
            monitor: Mutex::new(String::new()),
            toolbar_placed: Mutex::new(false),
            update: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            get_mode,
            overlay_monitor,
            set_drawing,
            set_toolbar_size,
            set_toolbar_orientation,
            open_config,
            open_site,
            quit
        ])
        .on_window_event(|window, event| {
            if let (WindowEvent::Moved(position), "toolbar") = (event, window.label()) {
                let state = window.state::<AppState>();
                state.config.lock().unwrap().toolbar_position = Some([position.x, position.y]);
            }
        })
        .setup(move |app| {
            let handle = app.handle().clone();
            create_windows(&handle, &config)?;
            register_shortcuts(&handle, &config)?;
            create_tray(&handle, &config)?;
            check_update(handle);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to start Xink")
        .run(|app, event| {
            if let RunEvent::ExitRequested { .. } = event {
                save_config(&app.state::<AppState>().config.lock().unwrap());
            }
        });
}
