# Draws icon-source.png (1024 px): a hand-drawn "X" in the two Skale blues,
# on the near-black rounded square used by the other Skale X apps.
# Then run:  npx tauri icon icon-source.png -o src-tauri/icons
param([string]$Out = (Join-Path $PSScriptRoot 'icon-source.png'))
Add-Type -AssemblyName System.Drawing
$size = 1024
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.Clear([System.Drawing.Color]::Transparent)

$r = 230; $m = 32; $w = $size - 2 * $m
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc($m, $m, $r, $r, 180, 90)
$path.AddArc($m + $w - $r, $m, $r, $r, 270, 90)
$path.AddArc($m + $w - $r, $m + $w - $r, $r, $r, 0, 90)
$path.AddArc($m, $m + $w - $r, $r, $r, 90, 90)
$path.CloseFigure()
$bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 12, 13, 18))
$g.FillPath($bg, $path)

function Stroke($argb, $x1, $y1, $cx1, $cy1, $cx2, $cy2, $x2, $y2) {
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb($argb)), 150
  $pen.StartCap = 'Round'; $pen.EndCap = 'Round'
  $g.DrawBezier($pen, $x1, $y1, $cx1, $cy1, $cx2, $cy2, $x2, $y2)
}
# Soft blue stroke first, CTA blue on top: same layering as the Xtimator mark.
Stroke 0xFF8FA9EE 742 262 640 380 450 600 282 762
Stroke 0xFF5173D6 282 262 420 400 600 580 742 762

$g.Dispose()
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
"saved $Out"
