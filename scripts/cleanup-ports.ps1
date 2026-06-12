# Kill stale Node dev servers on Windows (ports 3001, 5173-5176)
$ports = 3001, 5173, 5174, 5175, 5176
$pids = @()

foreach ($port in $ports) {
  $matches = netstat -ano | Select-String ":$port\s"
  foreach ($line in $matches) {
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

foreach ($pid in $unique) {
  $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
  if ($proc -and $proc.ProcessName -eq "node") {
    Write-Host "Stopping node.exe PID $pid"
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "Done. Run: npm run dev"
