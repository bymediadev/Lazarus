param(
  [Parameter(Mandatory = $true)][string]$SourceDir,
  [Parameter(Mandatory = $true)][string]$DestZip
)
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path $DestZip) {
  Remove-Item $DestZip -Force
}
$destDir = Split-Path -Parent $DestZip
if (-not (Test-Path $destDir)) {
  New-Item -ItemType Directory -Path $destDir | Out-Null
}
[System.IO.Compression.ZipFile]::CreateFromDirectory($SourceDir, $DestZip)
