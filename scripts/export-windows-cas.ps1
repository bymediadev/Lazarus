# Export Windows trusted root CAs so Node/npm can verify HTTPS on this machine.
# Run once if npm install fails with UNABLE_TO_VERIFY_LEAF_SIGNATURE.
# Requires: corporate proxy, VPN SSL inspection, or antivirus HTTPS scanning.

$pem = Join-Path $PSScriptRoot "..\windows-extra-cas.pem"
$sb = New-Object System.Text.StringBuilder

Get-ChildItem Cert:\CurrentUser\Root, Cert:\LocalMachine\Root | ForEach-Object {
    $b64 = [Convert]::ToBase64String($_.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert))
    [void]$sb.AppendLine("-----BEGIN CERTIFICATE-----")
    for ($i = 0; $i -lt $b64.Length; $i += 64) {
        [void]$sb.AppendLine($b64.Substring($i, [Math]::Min(64, $b64.Length - $i)))
    }
    [void]$sb.AppendLine("-----END CERTIFICATE-----")
}

Set-Content -Path $pem -Value $sb.ToString() -Encoding ascii
Write-Host "Exported Windows CAs to $pem"
Write-Host ""
Write-Host "For this session:"
Write-Host '  $env:NODE_EXTRA_CA_CERTS="' + $pem + '"'
Write-Host ""
Write-Host "Permanent (recommended):"
Write-Host '  npm config set cafile "' + $pem + '"'
