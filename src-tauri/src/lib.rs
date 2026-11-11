//! Tauri v2 宿主壳（Phase 3 / P3-T1）
//!
//! 三个原生能力，全部通过 `invoke` 暴露给共享的 Web 视图代码：
//!   · `update_tray_ticker { text }` —— 系统托盘/菜单栏标题实时报价条；
//!   · `set_always_on_top { enabled }` —— 画中画窗口置顶切换；
//!   · `CmdOrCtrl+Shift+K` 全局快捷键 —— 唤醒/聚焦主窗口。
//!
//! 前端 `desktop-bridge.js` 在非 Tauri 环境不会调用任何命令，所以这里可以
//! 只关心桌面侧，不需要为浏览器做兼容分支。

use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewWindow,
};

/// 更新系统托盘标题（macOS 菜单栏实时报价条）。
#[tauri::command]
fn update_tray_ticker(app: AppHandle, text: String) -> Result<(), String> {
    // 空文本不覆盖标题：避免采集空窗期把菜单栏刷成一片空白。
    if text.trim().is_empty() {
        return Ok(());
    }
    if let Some(tray) = app.tray_by_id("main") {
        tray.set_title(Some(&text)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 画中画窗口置顶切换：与 `documentElement.dataset.pip` 同步。
#[tauri::command]
fn set_always_on_top(app: AppHandle, enabled: bool) -> Result<(), String> {
    let window: WebviewWindow = app
        .get_webview_window("pip")
        .or_else(|| app.get_webview_window("main"))
        .ok_or_else(|| "找不到可置顶的窗口".to_string())?;
    window.set_always_on_top(enabled).map_err(|e| e.to_string())
}

/// 显示/隐藏画中画窗口（供前端画中画按钮进一步调用）。
#[tauri::command]
fn show_pip_window(app: AppHandle, visible: bool) -> Result<(), String> {
    let window: WebviewWindow = app
        .get_webview_window("pip")
        .ok_or_else(|| "找不到 pip 窗口".to_string())?;
    if visible {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    } else {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn focus_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();

            // 托盘菜单：打开主窗口 / 画中画 / 退出
            let open = MenuItem::with_id(app, "open", "打开 TickerWall", true, None::<&str>)
                .map_err(|e| e.to_string())?;
            let pip_item = MenuItem::with_id(app, "pip", "画中画盯盘", true, None::<&str>)
                .map_err(|e| e.to_string())?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)
                .map_err(|e| e.to_string())?;
            let menu = Menu::with_items(app, &[&open, &pip_item, &quit])
                .map_err(|e| e.to_string())?;

            let mut tray_builder = TrayIconBuilder::with_id("main")
                .menu(&menu)
                .show_menu_on_left_click(false);
            if let Some(icon) = app.default_window_icon().cloned() {
                tray_builder = tray_builder.icon(icon);
            }
            tray_builder
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { .. } = event {
                        focus_main(tray.app_handle());
                    }
                })
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => focus_main(app),
                    "pip" => {
                        if let Some(w) = app.get_webview_window("pip") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)
                .map_err(|e| e.to_string())?;

            // 全局快捷键：CmdOrCtrl+Shift+K 唤醒/聚焦主窗口
            // macOS 用 Super(⌘)，Windows/Linux 用 Control。
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
                let mods = if cfg!(target_os = "macos") {
                    Modifiers::SUPER | Modifiers::SHIFT
                } else {
                    Modifiers::CONTROL | Modifiers::SHIFT
                };
                let shortcut = Shortcut::new(Some(mods), Code::KeyK);
                let h = handle.clone();
                app.global_shortcut()
                    .on_shortcut(shortcut, move |_app, _sc, event| {
                        if event.state == ShortcutState::Pressed {
                            focus_main(&h);
                        }
                    })
                    .map_err(|e| e.to_string())?;
            }
            let _ = handle; // 保留句柄供未来扩展（如原生通知回执）

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            update_tray_ticker,
            set_always_on_top,
            show_pip_window
        ])
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用失败");
}
