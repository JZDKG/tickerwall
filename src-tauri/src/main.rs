// Tauri v2 桌面壳入口。
// 业务逻辑全部在 lib.rs；这里只保留最小 main，保证 `cargo build` 与 Tauri CLI
// 都能找到入口（Windows 上不弹额外控制台窗口）。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tickerwall_lib::run();
}
