# Xink

Draw on top of anything on your screen. Made for recording videos: press a hotkey, annotate over any
program, press it again and keep using your computer while the drawing stays visible.

Xink does **not** record video. Keep using OBS, Camtasia, Loom or the Snipping Tool to record. 🇧🇷
[Português](#português) · 🇪🇸 [Español](#español)

Made by **[Skale Club](https://skale.club)**.

## Availability

**Status checked October 27, 2026:** source version 0.1.1. No GitHub Release or
publicly downloadable executable has been published. Build from source using the
[development guide](docs/DEVELOPMENT.md). Future release binaries belong in
[Releases](https://github.com/Skale-Club/xink/releases).

The app can offer signed updates when a newer release contains both an executable and its signature.
Updates require internet access and are installed when you select the update action; your `Data`
folder is retained.

## Run it

Double-click `Xink.exe`. No installer. It requires Microsoft Edge WebView2 Runtime. Settings live in
`Data\xink.json` next to the exe, so you can carry the folder on a USB stick. Keep the executable in
a writable folder. The app creates `Data` beside it. PortableApps-style metadata is optional; the
build and release workflow do not create a PortableApps package. Opening it a second time just
brings the toolbar back.

Xink lives in the system tray (bottom-right, next to the clock):

- **Left click** the icon: show or hide the toolbar.
- **Right click** the icon: draw / mouse, clear, **Language** (English,   Português, Español),
  settings, quit.

## Two modes

| Mode | What happens |
|---|---|
| **Drawing** | The mouse or pen draws on the screen. |
| **Mouse** | The drawing stays visible, but clicks go to the programs below. |

Switch with **Ctrl+Shift+D** (works from any program), the big button on the toolbar, or **Esc** to
go back to the mouse. Picking any tool also switches to drawing. When you start drawing, Xink jumps
to the monitor your mouse is on, and each monitor keeps its own drawing during the session. Drawings
are not saved across app restarts.

## Shortcuts

Global (work from any program):

| Keys | Action |
|---|---|
| Ctrl+Shift+D | Drawing / mouse |
| Ctrl+Shift+H | Show / hide toolbar |
| Ctrl+Shift+X | Clear screen |

While drawing:

| Key | Action |
|---|---|
| P | Pen (pressure-sensitive with a pen tablet) |
| M | Highlighter |
| A | Arrow |
| L | Line |
| R | Rectangle |
| O | Ellipse |
| T | Text (Enter confirms, Shift+Enter new line, Esc cancels) |
| E | Eraser (removes whole strokes) |
| X | Laser pointer: the stroke fades away by itself |
| F | Spotlight: darkens everything except a circle around the mouse |
| 1 to 6 | Colors |
| Mouse wheel, `[` `]` | Width (spotlight size when using the spotlight) |
| Shift while drawing | Straight angles, perfect squares and circles |
| W / K | Whiteboard / blackboard (press again to hide) |
| C | Clear all |
| Ctrl+Z / Ctrl+Y | Undo / redo |
| Esc | Back to the mouse |

## Toolbar

- Drag it by the dotted handle. Xink remembers where you left it.
- Each tool shows its key in the corner.
- Buttons with a small corner triangle hold more options: the **shapes**   button (arrow, line,
  rectangle, ellipse) and the **pointer** button (laser,   spotlight) show the last one used. Click
  it to use that tool, click it again   (or right-click) to pick another.
- **–** minimizes the bar into a bubble. Click the bubble to bring the bar back,   drag it to move
  it.
- **…** switches between a horizontal and a **vertical** bar (handy on the side   of a widescreen
  recording) and quits Xink.

## Recording tips

- In OBS use **Display Capture**, not Window Capture. The drawing is a layer on   top of everything,
  so only a full-screen capture records it.
- The toolbar requests Windows capture protection by default. Whether a   recorder excludes it
  depends on its capture method; make a short test recording   before presenting. The drawing
  overlay is separate and remains available to   screen capture. To include the toolbar, set
  `hideToolbarFromRecording` to `false`.

## Settings

Right-click the tray icon → Settings to open `Data/xink.json`. Restart Xink after editing.

```json
{
  "language": "en",
  "drawHotkey": "Ctrl+Shift+D",
  "toolbarHotkey": "Ctrl+Shift+H",
  "clearHotkey": "Ctrl+Shift+X",
  "colors": ["#FF3B30", "#FFCC00", "#34C759", "#0A84FF", "#FFFFFF", "#111111"],
  "width": 4,
  "laserSeconds": 1.5,
  "hideToolbarFromRecording": true,
  "toolbarOrientation": "horizontal",
  "toolbarPosition": [552, 16]
}
```

The example uses English (`en`); `pt` and `es` select Portuguese and Spanish. `width` sets the pen
size, `laserSeconds` the trail duration, and `toolbarOrientation` accepts `horizontal` or
`vertical`. Position is saved on exit. If a hotkey is already taken by another program, Xink skips
it and the tray menu still works.

## Use with Claude Code and Codex

`Xink.exe --mcp` runs Xink as a local [MCP](https://modelcontextprotocol.io) server, with no window,
so AI assistants such as Claude Code and Codex can use its engine on this PC. Xink itself sends
nothing over the network; what the assistant reads goes to its AI provider, as with anything else
you share with it. It only reads. The drawing lives in the running window, so there is little to
read from outside.

Claude Code (available in every project):

```bash
claude mcp add --scope user xink -- "C:\Apps\Xink\Xink.exe" --mcp
```

Codex, in `%USERPROFILE%\.codex\config.toml`:

```toml
[mcp_servers.xink]
command = 'C:\Apps\Xink\Xink.exe'
args = ["--mcp"]
```

Use the path where your `Xink.exe` is. Tools:

- `app_info`: version, where the exe and `Data` folder are, and the saved settings.
- `status`: whether Xink is running, and its hotkeys, pen colors and width, laser fade and toolbar
  settings.

## Development

Tauri 2, Rust and plain HTML/CSS/JavaScript. See the [development and release
guide](docs/DEVELOPMENT.md) for prerequisites, clone, build, tests and signed-release instructions.
A push to `main` alone does not publish an executable.

---

## Português

**Disponibilidade:** em 27/10/2026, ainda não há release nem executável publicado. Consulte
[Releases](https://github.com/Skale-Club/xink/releases) ou as [instruções de
compilação](docs/DEVELOPMENT.md). As atualizações dependem de uma release assinada e da ação do
usuário.

Xink é para escrever na tela por cima de qualquer programa, feito para gravar vídeo. Ele não grava:
continue usando o OBS ou o gravador que já usa.

- Abra o `Xink.exe` (não precisa instalar). Ele fica no ícone ao lado do   relógio.
- **Ctrl+Shift+D** alterna entre **desenhar** e **usar o mouse** (o desenho   continua na tela e os
  cliques passam para os programas). **Esc** volta ao   mouse.
- Para mudar o idioma: botão direito no ícone → **Language** → Português.
- Teclas: P caneta, M marca-texto, A seta, L linha, R retângulo, O elipse,   T texto, E borracha, X
  laser, F holofote, 1 a 6 cores, roda do mouse   espessura, Shift deixa reto, W/K quadro
  branco/preto, C limpar,   Ctrl+Z/Ctrl+Y desfazer/refazer.
- No OBS use **Captura de Tela**, não Captura de Janela. A barra solicita proteção de captura, mas o
  resultado depende do gravador; teste antes. Os desenhos não são salvos ao fechar o app.
- **Claude Code e Codex**: `Xink.exe --mcp` roda o Xink como servidor MCP local, sem janela, para
  assistentes de IA usarem o estado e as configurações (só leitura). Veja [Use with Claude Code and
  Codex](#use-with-claude-code-and-codex).

## Español

**Disponibilidad:** al 27/10/2026, aún no hay release ni ejecutable publicado. Consulte
[Releases](https://github.com/Skale-Club/xink/releases) o las [instrucciones de
compilación](docs/DEVELOPMENT.md). Las actualizaciones requieren una release firmada y la acción del
usuario.

Xink sirve para escribir en la pantalla encima de cualquier programa, pensado para grabar videos. No
graba: sigue usando OBS o tu grabador de siempre.

- Abre `Xink.exe` (no necesita instalación). Vive en el icono junto al reloj.
- **Ctrl+Shift+D** alterna entre **dibujar** y **usar el ratón** (el dibujo   sigue en pantalla y
  los clics pasan a los programas). **Esc** vuelve al   ratón.
- Para cambiar el idioma: clic derecho en el icono → **Language** → Español.
- Teclas: P lápiz, M resaltador, A flecha, L línea, R rectángulo, O elipse,   T texto, E borrador, X
  láser, F foco, 1 a 6 colores, rueda del ratón grosor,   Shift endereza, W/K pizarra blanca/negra,
  C borrar, Ctrl+Z/Ctrl+Y   deshacer/rehacer.
- En OBS usa **Captura de pantalla**, no Captura de ventana. La barra solicita protección de
  captura; el resultado depende del grabador. Haga una prueba. Los dibujos no se guardan al cerrar
  la app.
- **Claude Code y Codex**: `Xink.exe --mcp` ejecuta Xink como servidor MCP local, sin ventana, para
  que asistentes de IA usen el estado y la configuración (solo lectura). Consulta [Use with Claude
  Code and Codex](#use-with-claude-code-and-codex).

## Skale Club apps

These Windows apps belong to the [Skale-Club organization](https://github.com/Skale-Club).
They share navy interfaces, blue accents, transparent product symbols, and English,
Portuguese and Spanish UI text. Each app has its own executable and portable Data folder.

| App | Purpose |
| --- | --- |
| [Xpace](https://github.com/Skale-Club/xpace) | Care for the PC (disk space, cleaning, drivers, startup, apps) and inspect hardware, live sensors and benchmarks |
| [Xink](https://github.com/Skale-Club/xink) | Draw over the screen during presentations or recordings |
| [Xnote](https://github.com/Skale-Club/xnote) | Transcribe meetings and turn notes into summaries and tasks |
| [Xvert](https://github.com/Skale-Club/xvert) | Convert videos, music and pictures between formats |

Repository access may be required depending on project visibility. Report problems through the
relevant repository, including app version, Windows version and reproduction steps. Remove
personal information from reports and transcripts before sharing.


---

© 2026 [Skale Club](https://skale.club)
