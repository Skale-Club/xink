//! What Xink offers over MCP (`Xink.exe --mcp`): whether it is running and
//! its settings. The drawing itself lives in the running window, so there is
//! nothing more to read from here.

use crate::mcp::{self, Tool};
use serde_json::json;

const INSTRUCTIONS: &str = "Xink draws over the screen for screen recordings: a hotkey switches between \
drawing and using the PC, another shows the toolbar, another clears. status says whether Xink is \
running and gives its settings (hotkeys, pen colors and width, laser fade, toolbar). Nothing is changed.";

#[link(name = "kernel32")]
extern "system" {
    fn OpenMutexW(access: u32, inherit: i32, name: *const u16) -> isize;
    fn CloseHandle(handle: isize) -> i32;
}

/// The window holds the single-instance plugin's mutex ("<identifier>-sim");
/// other MCP servers don't, so they don't count.
fn running() -> bool {
    const SYNCHRONIZE: u32 = 0x0010_0000;
    let name: Vec<u16> = "club.skale.xink-sim".encode_utf16().chain(Some(0)).collect();
    let handle = unsafe { OpenMutexW(SYNCHRONIZE, 0, name.as_ptr()) };
    if handle != 0 {
        unsafe { CloseHandle(handle) };
    }
    handle != 0
}

pub fn serve() {
    let tools = vec![Tool::new(
        "status",
        "Whether Xink is running now, and its settings with defaults filled in: hotkeys (draw, toolbar, \
         clear), pen colors, pen width, laser fade in seconds, toolbar orientation and position, and \
         whether the toolbar is hidden from screen recordings.",
        mcp::no_input(),
        |_| Ok(json!({ "running": running(), "settings": crate::load_config() })),
    )];
    mcp::serve("Xink", "xink.json", INSTRUCTIONS, tools);
}
