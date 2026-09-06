param(
  [Parameter(Mandatory = $true)][string]$SourcePng,
  [Parameter(Mandatory = $true)][string]$OutDir
)
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($SourcePng)
foreach ($size in @(16, 32, 48, 128, 192, 512)) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.Clear([System.Drawing.Color]::FromArgb(11, 31, 51))
  $g.DrawImage($img, 0, 0, $size, $size)
  $path = Join-Path $OutDir ("icon-$size.png")
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}
$img.Dispose()
