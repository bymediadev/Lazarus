# Kill stale Node dev servers on Windows (ports 3001, 5173-5176)
$ports = 3001, 5173, 5174, 5175, 5176
$pids = @()

foreach ($port in $ports) {
  $portLines = netstat -ano | Select-String ":$port\s"
  foreach ($line in $portLines) {
    if ($line -match '\s(\d+)\s*$') {
      $pids += [int]$Matches[1]
    }
  }
}

$unique = $pids | Sort-Object -Unique
if (-not $unique.Count) {
  Write-Host "No stale dev processes found on ports 3001, 5173-5176."
  exit 0
}

foreach ($processId in $unique) {
  $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if ($proc -and $proc.ProcessName -eq "node") {
    Write-Host "Stopping node.exe PID $processId"
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "Done. Run: npm run dev"
