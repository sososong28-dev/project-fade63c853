# 启动 Windows 真实鼠标过滑块简化服务
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$VenvPython = Join-Path $Root ".venv\Scripts\python.exe"
$EnvFile = Join-Path $Root ".env"

if (-not (Test-Path $VenvPython)) {
    Write-Host "缺少虚拟环境，请先运行: .\setup.ps1"
    exit 1
}

if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) { return }
        $parts = $line.Split("=", 2)
        if ($parts.Count -eq 2) {
            [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), "Process")
        }
    }
}

if (-not $env:WIN_CAPTCHA_SECRET) {
    Write-Host "请在 .env 中设置 WIN_CAPTCHA_SECRET"
    exit 1
}

if (-not $env:WIN_CAPTCHA_PORT) { $env:WIN_CAPTCHA_PORT = "18900" }

Write-Host "启动真实鼠标过滑块服务 端口=$($env:WIN_CAPTCHA_PORT)"
Write-Host "过滑块期间请勿操作鼠标键盘（约数秒）"
& $VenvPython (Join-Path $Root "server.py")
