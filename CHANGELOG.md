# Changelog

## Unreleased

- Move the toolbar to the Skale Club family design (skale.css v2) with Xink's highlighter-yellow
  signal: family navy surfaces, active tools and drawing mode filled with the signal in dark ink,
  mono shortcut letters and a visible keyboard focus ring. Hotkeys and toolbar behaviour unchanged.
- Replace the nib-and-ink-stroke symbol with the family mark (yellow tile, pen nib) in the toolbar
  grip, the minimized bubble and the Windows executable. `make-icon.ps1` renders it with the shared
  `render-mark.ps1`, without npm.

## 0.2.0 — 2026-11-04

- Internal signed downloads and updates through a stable per-app manifest endpoint.
- Missing feeds report an error; staged packages are verified again before replacement.
- Release automation publishes the executable, signature and latest.json together.

- `Xink.exe --mcp` runs a local MCP server (no window) for Claude Code, Codex and other MCP clients:
  whether Xink is running and its settings; read-only.

## 0.1.1 — 2026-10-27

- Transparent product symbols without navy background tiles or decorative outer rims.
- Build inputs track the ICO/PNG artwork, and every npm build checks embedded Windows icons.
- English documentation now lists the complete five-app Skale Club family.
- The floating launcher shows the pen symbol without its former circular background.
