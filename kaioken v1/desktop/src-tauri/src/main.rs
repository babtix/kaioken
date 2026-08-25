// Omitting the windows_subsystem attribute would open a console window behind
// the app on every release build on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    kaioken_desktop_lib::run()
}
