# Teams outline.png: 32x32 white glyph, fully transparent background.
param(
  [Parameter(Mandatory = $true)][string]$SourcePng,
  [Parameter(Mandatory = $true)][string]$DestPng
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Bitmap]::FromFile($SourcePng)
try {
  $bgR = 5; $bgG = 10; $bgB = 48
  $threshold = 40
  $minX = $src.Width; $minY = $src.Height; $maxX = -1; $maxY = -1
  for ($y = 0; $y -lt $src.Height; $y++) {
    for ($x = 0; $x -lt $src.Width; $x++) {
      $c = $src.GetPixel($x, $y)
      $dist = [Math]::Abs([int]$c.R - $bgR) + [Math]::Abs([int]$c.G - $bgG) + [Math]::Abs([int]$c.B - $bgB)
      if ($dist -gt $threshold) {
        # Bird only — skip wordmark below the glyph.
        if ($y -gt 260) { continue }
        if ($x -lt $minX) { $minX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }
  if ($maxX -lt 0) { throw "No glyph pixels found in $SourcePng" }

  $pad = 6
  $cropX = [Math]::Max(0, $minX - $pad)
  $cropY = [Math]::Max(0, $minY - $pad)
  $cropW = [Math]::Min($src.Width - $cropX, $maxX - $minX + 1 + (2 * $pad))
  $cropH = [Math]::Min($src.Height - $cropY, $maxY - $minY + 1 + (2 * $pad))

  $glyph = New-Object System.Drawing.Bitmap $cropW, $cropH, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  for ($y = 0; $y -lt $cropH; $y++) {
    for ($x = 0; $x -lt $cropW; $x++) {
      $c = $src.GetPixel($cropX + $x, $cropY + $y)
      $dist = [Math]::Abs([int]$c.R - $bgR) + [Math]::Abs([int]$c.G - $bgG) + [Math]::Abs([int]$c.B - $bgB)
      if ($dist -le $threshold) {
        $glyph.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
      } else {
        $glyph.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, 255, 255, 255))
      }
    }
  }

  # One-pixel dilate so the mark survives 32x32.
  $thick = New-Object System.Drawing.Bitmap $cropW, $cropH, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  for ($y = 0; $y -lt $cropH; $y++) {
    for ($x = 0; $x -lt $cropW; $x++) {
      $maxA = 0
      for ($dy = -1; $dy -le 1; $dy++) {
        for ($dx = -1; $dx -le 1; $dx++) {
          $nx = $x + $dx; $ny = $y + $dy
          if ($nx -ge 0 -and $ny -ge 0 -and $nx -lt $cropW -and $ny -lt $cropH) {
            $a = $glyph.GetPixel($nx, $ny).A
            if ($a -gt $maxA) { $maxA = $a }
          }
        }
      }
      if ($maxA -ge 128) {
        $thick.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, 255, 255, 255))
      } else {
        $thick.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
      }
    }
  }
  $glyph.Dispose()

  $out = New-Object System.Drawing.Bitmap 32, 32, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($out)
  $g.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
  $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighSpeed
  $inner = 26
  $scale = [Math]::Min($inner / $cropW, $inner / $cropH)
  $dw = [int][Math]::Round($cropW * $scale)
  $dh = [int][Math]::Round($cropH * $scale)
  $dx = [int][Math]::Floor((32 - $dw) / 2)
  $dy = [int][Math]::Floor((32 - $dh) / 2)
  $g.DrawImage($thick, $dx, $dy, $dw, $dh)
  $g.Dispose()
  $thick.Dispose()

  $white = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)
  $clear = [System.Drawing.Color]::FromArgb(0, 0, 0, 0)
  for ($y = 0; $y -lt 32; $y++) {
    for ($x = 0; $x -lt 32; $x++) {
      $c = $out.GetPixel($x, $y)
      if ($c.A -ge 128 -and $c.R -ge 128 -and $c.G -ge 128 -and $c.B -ge 128) {
        $out.SetPixel($x, $y, $white)
      } else {
        $out.SetPixel($x, $y, $clear)
      }
    }
  }

  $dir = Split-Path -Parent $DestPng
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  $out.Save($DestPng, [System.Drawing.Imaging.ImageFormat]::Png)
  $out.Dispose()
}
finally {
  $src.Dispose()
}
