# Xink

Draw on top of anything on your screen. Made for recording videos: press a
hotkey, annotate over any program, press it again and keep using your computer
while the drawing stays visible.

Xink does **not** record video. Keep using OBS, Camtasia, Loom or the Snipping
Tool to record. 🇧🇷 [Português](#português) · 🇪🇸 [Español](#español)

## Download

Get the latest `Xink.exe` from **[Releases](https://github.com/skaleclub/xink/releases/latest)**. It keeps itself up to date: when a new version is out, the app offers it (in the tray menu) and swaps itself in place, keeping your settings. Every update is signed and checked before it is used.

## Run it

Double-click `Xink.exe`. No installer. It needs WebView2, which comes with
Windows 11. Settings live in `xink.json` next to the exe, so you can carry the
folder on a USB stick. Opening it a second time just brings the toolbar back.

Xink lives in the system tray (bottom-right, next to the clock):

- **Left click** the icon: show or hide the toolbar.
- **Right click** the icon: draw / mouse, clear, **Language** (English,
  Português, Español), settings, quit.

## Two modes

| Mode | What happens |
|---|---|
| **Drawing** | The mouse or pen draws on the screen. |
| **Mouse** | The drawing stays visible, but clicks go to the programs below. |

Switch with **Ctrl+Shift+D** (works from any program), the big button on the
toolbar, or **Esc** to go back to the mouse. Picking any tool also switches to
drawing. When you start drawing, Xink jumps to the monitor your mouse is on, and
each monitor keeps its own drawing.

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
- Buttons with a small corner triangle hold more options: the **shapes**
  button (arrow, line, rectangle, ellipse) and the **pointer** button (laser,
  spotlight) show the last one used. Click it to use that tool, click it again
  (or right-click) to pick another.
- **–** minimizes the bar into a bubble. Click the bubble to bring the bar back,
  drag it to move it.
- **…** switches between a horizontal and a **vertical** bar (handy on the side
  of a widescreen recording) and quits Xink.

## Recording tips

- In OBS use **Display Capture**, not Window Capture. The drawing is a layer on
  top of everything, so only a full-screen capture records it.
- The toolbar is **hidden from recordings and screenshots**: you see it, your
  viewers don't. To show it in the video, set `hideToolbarFromRecording` to
  `false`.

## Settings (`xink.json`)

Right-click the tray icon → Settings. Restart Xink after editing.

```json
{
  "language": "en",                  // en, pt or es
  "drawHotkey": "Ctrl+Shift+D",
  "toolbarHotkey": "Ctrl+Shift+H",
  "clearHotkey": "Ctrl+Shift+X",
  "colors": ["#FF3B30", "#FFCC00", "#34C759", "#0A84FF", "#FFFFFF", "#111111"],
  "width": 4,                        // starting pen width
  "laserSeconds": 1.5,               // how long the laser trail lasts
  "hideToolbarFromRecording": true,
  "toolbarOrientation": "horizontal", // or "vertical"
  "toolbarPosition": [552, 16]       // saved automatically when you quit
}
```

(The real file has no comments; JSON does not allow them.) If a hotkey is
already taken by another program, Xink skips it and the tray menu still works.

## Build from source

This is a Tauri v2 app (Rust + plain HTML/JS, no bundler).
Needs Rust, Node.js and the Visual C++ Build Tools.

```bash
npm install
npm run dev      # run while developing
npm run build    # src-tauri/target/release/xink.exe
```

- `src-tauri/src/main.rs`: windows, global hotkeys, tray, settings.
- `src/overlay.*`: the drawing layer (canvas, tools, undo).
- `src/toolbar.*`: the floating toolbar.
- `src/i18n.js`: toolbar texts in English, Portuguese and Spanish.
- `make-icon.ps1`: draws the app icon (Skale X family colors).

## Releasing a new version

```powershell
./scripts/release.ps1 0.2.0
```

It sets the version in `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` and `package.json`, commits, tags `v0.2.0` and pushes. GitHub Actions then builds the exe, signs it with the update key (the `TAURI_SIGNING_PRIVATE_KEY` secret) and publishes the release; installed copies offer it on their next start.

The private key lives outside the repository, in `%USERPROFILE%\.tauri\skale-x-updater.key`. Keep a backup: without it no new update can be signed.

---

## Português

**Download:** [Releases](https://github.com/skaleclub/xink/releases/latest). O app avisa quando há versão nova e se atualiza sozinho, mantendo as configurações.

Xink é para escrever na tela por cima de qualquer programa, feito para gravar
vídeo. Ele não grava: continue usando o OBS ou o gravador que já usa.

- Abra o `Xink.exe` (não precisa instalar). Ele fica no ícone ao lado do
  relógio.
- **Ctrl+Shift+D** alterna entre **desenhar** e **usar o mouse** (o desenho
  continua na tela e os cliques passam para os programas). **Esc** volta ao
  mouse.
- Para mudar o idioma: botão direito no ícone → **Language** → Português.
- Teclas: P caneta, M marca-texto, A seta, L linha, R retângulo, O elipse,
  T texto, E borracha, X laser, F holofote, 1 a 6 cores, roda do mouse
  espessura, Shift deixa reto, W/K quadro branco/preto, C limpar,
  Ctrl+Z/Ctrl+Y desfazer/refazer.
- No OBS use **Captura de Tela**, não Captura de Janela. A barra não aparece
  na gravação, só os riscos.

## Español

**Descarga:** [Releases](https://github.com/skaleclub/xink/releases/latest). La app avisa cuando hay una versión nueva y se actualiza sola, conservando la configuración.

Xink sirve para escribir en la pantalla encima de cualquier programa, pensado
para grabar videos. No graba: sigue usando OBS o tu grabador de siempre.

- Abre `Xink.exe` (no necesita instalación). Vive en el icono junto al reloj.
- **Ctrl+Shift+D** alterna entre **dibujar** y **usar el ratón** (el dibujo
  sigue en pantalla y los clics pasan a los programas). **Esc** vuelve al
  ratón.
- Para cambiar el idioma: clic derecho en el icono → **Language** → Español.
- Teclas: P lápiz, M resaltador, A flecha, L línea, R rectángulo, O elipse,
  T texto, E borrador, X láser, F foco, 1 a 6 colores, rueda del ratón grosor,
  Shift endereza, W/K pizarra blanca/negra, C borrar, Ctrl+Z/Ctrl+Y
  deshacer/rehacer.
- En OBS usa **Captura de pantalla**, no Captura de ventana. La barra no sale
  en la grabación, solo los trazos.
