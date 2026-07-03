// Evita la console su Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    ilc_flow_validator_lib::run()
}
