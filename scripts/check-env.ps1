# Verifies the local toolchain needed to develop this project on Windows.
# Usage (PowerShell, from the repo root):  .\scripts\check-env.ps1
# Exits with code 1 if any required tool is missing or too old.

$ErrorActionPreference = 'Continue'
$failed = $false

function Test-Tool {
    param(
        [string]$Name,
        [scriptblock]$GetVersion,
        [version]$Minimum,
        [bool]$Required = $true
    )
    try {
        $raw = (& $GetVersion 2>$null | Out-String).Trim()
        if (-not $raw) { throw 'no output' }
        $match = [regex]::Match($raw, '\d+\.\d+(\.\d+)?')
        $ver = [version]$match.Value
        if ($ver -lt $Minimum) {
            Write-Host ("[FAIL] {0,-16} {1} (need >= {2})" -f $Name, $ver, $Minimum) -ForegroundColor Red
            if ($Required) { $script:failed = $true }
        } else {
            Write-Host ("[ OK ] {0,-16} {1}" -f $Name, $ver) -ForegroundColor Green
        }
    } catch {
        $tag = if ($Required) { '[FAIL]' } else { '[WARN]' }
        $color = if ($Required) { 'Red' } else { 'Yellow' }
        Write-Host ("{0} {1,-16} not found" -f $tag, $Name) -ForegroundColor $color
        if ($Required) { $script:failed = $true }
    }
}

Test-Tool 'Git'            { git --version }                    ([version]'2.40')
Test-Tool 'Docker'         { docker --version }                 ([version]'24.0')
Test-Tool 'Docker Compose' { docker compose version }           ([version]'2.20')
Test-Tool 'Node.js'        { node --version }                   ([version]'20.19')
Test-Tool 'npm'            { npm --version }                    ([version]'10.0')
# Python on the host is optional: Spark jobs run inside containers.
Test-Tool 'Python'         { python --version }                 ([version]'3.10') -Required $false

docker info --format '{{.ServerVersion}}' 1>$null 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host '[ OK ] Docker daemon    running' -ForegroundColor Green
} else {
    Write-Host '[FAIL] Docker daemon    not running (start Docker Desktop)' -ForegroundColor Red
    $failed = $true
}

if ($failed) {
    Write-Host "`nEnvironment check FAILED." -ForegroundColor Red
    exit 1
}
Write-Host "`nEnvironment check passed." -ForegroundColor Green
exit 0
