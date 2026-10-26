# Draws icon-source.png (1024 px) in the Skale X family style: the two-tone
# "X" on the near-black tile shared by Xink, Xpecs, Xcare and Xnote, with this
# app's own symbol top right (a pencil).
# Then run:  npx tauri icon icon-source.png -o src-tauri/icons
param([string]$Out = (Join-Path $PSScriptRoot 'icon-source.png'))
Add-Type -AssemblyName System.Drawing
$size = 1024
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.Clear([System.Drawing.Color]::Transparent)

$r = 230; $m = 32; $w = $size - 2 * $m
$tile = New-Object System.Drawing.Drawing2D.GraphicsPath
$tile.AddArc($m, $m, $r, $r, 180, 90)
$tile.AddArc($m + $w - $r, $m, $r, $r, 270, 90)
$tile.AddArc($m + $w - $r, $m + $w - $r, $r, $r, 0, 90)
$tile.AddArc($m, $m + $w - $r, $r, $r, 90, 90)
$tile.CloseFigure()
$g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 12, 13, 18))), $tile)

$soft = [System.Drawing.Color]::FromArgb(255, 143, 169, 238)
$brand = [System.Drawing.Color]::FromArgb(255, 81, 115, 214)
$softBrush = New-Object System.Drawing.SolidBrush $soft

function RoundPen($color, $width) {
  $pen = New-Object System.Drawing.Pen $color, $width
  $pen.StartCap = 'Round'; $pen.EndCap = 'Round'; $pen.LineJoin = 'Round'
  $pen
}

# The shared "X": soft stroke under the CTA-blue stroke.
$g.DrawLine((RoundPen $soft 132), 690, 330, 270, 790)
$g.DrawLine((RoundPen $brand 132), 270, 330, 690, 790)

# ---------- this app's symbol, top right ----------
# A pencil: body and sharpened tip, pointing down toward the X.
$g.DrawLine((RoundPen $soft 84), 930, 130, 835, 225)
$tip = [System.Drawing.PointF[]]@(
  (New-Object System.Drawing.PointF 820, 300), (New-Object System.Drawing.PointF 760, 240),
  (New-Object System.Drawing.PointF 735, 325))
$g.FillPolygon($softBrush, $tip)

$g.Dispose()
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
"saved $Out"