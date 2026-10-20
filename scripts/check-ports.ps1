$ports = @(9000, 8089, 8090, 8091)
foreach ($p in $ports) {
  try {
    $r = Invoke-WebRequest ("http://127.0.0.1:{0}/health" -f $p) -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
    Write-Host ("{0} OK {1}" -f $p, $r.StatusCode)
  } catch {
    $msg = $_.Exception.Message -replace "`r?`n", " "
    if ($msg.Length -gt 80) { $msg = $msg.Substring(0, 80) + "..." }
    Write-Host ("{0} DOWN {1}" -f $p, $msg)
  }
}