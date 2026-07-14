# ----------------------------------------------------------------------
# prepare-python -- embedded Python runtime for Windows packaging (-> out/python)
#
# Derived from start-prod.ps1, adapted for the packaging pipeline:
#   1. No get-pip: requires a full host Python 3.12 (same minor as the
#      embeddable, guarantees cp312 wheels), used for pip install --target
#   2. Dependency pinning: server/src/libs/requirements-lock.txt is used
#      when present; otherwise requirements.txt is used and the resolved
#      versions are written to out/python/installed-packages.txt --
#      commit that file as requirements-lock.txt after the first build
#   3. VC++ runtime app-local deployment: target machines may lack the
#      VC++ Redist and onnxruntime would fail with "DLL load failed";
#      bundling vc_redist.exe is not an option for perUser installs
#      (needs admin), so CRT DLLs are copied next to python.exe
#   4. fail-fast + import smoke test
#
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 misreads
# BOM-less UTF-8 sources, non-ASCII literals would break silently.
#
# Usage: powershell -ExecutionPolicy Bypass -File desktop/scripts/prepare-python.ps1
# ----------------------------------------------------------------------

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$DESKTOP = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$REPO    = Split-Path -Parent $DESKTOP
$OUT     = Join-Path $DESKTOP 'out\python'
$VENDOR  = Join-Path $DESKTOP 'vendor\python'

$PY_VER  = '3.12.10'
$PY_ZIP  = "python-$PY_VER-embed-amd64.zip"
$PY_URLS = @(
    "https://mirrors.huaweicloud.com/python/$PY_VER/$PY_ZIP",
    "https://cdn.npmmirror.com/binaries/python/$PY_VER/$PY_ZIP",
    "https://www.python.org/ftp/python/$PY_VER/$PY_ZIP"
)

$REQ_LOCK = Join-Path $REPO 'server\src\libs\requirements-lock.txt'
$REQ_MAIN = Join-Path $REPO 'server\src\libs\requirements.txt'

function Write-Step { param($msg) Write-Host "[prepare-python] $msg" -ForegroundColor Cyan }
function Write-Ok   { param($msg) Write-Host "[prepare-python] OK: $msg" -ForegroundColor Green }
function Fail       { param($msg) Write-Host "[prepare-python] FAIL: $msg" -ForegroundColor Red; exit 1 }

# -- Step 1: locate a host Python 3.12 (used for pip --target) --
# The embeddable is cp312, so the interpreter that resolves the wheels must be 3.12
# too. A bare "python" may be an activated virtualenv of another minor (e.g. a 3.11
# venv), so resolve 3.12 explicitly and use its full path for every pip call below.
function Get-Py312 {
    # 1) py launcher (ignores any activated venv)
    if (Get-Command py -ErrorAction SilentlyContinue) {
        $exe = & py -3.12 -c "import sys; print(sys.executable)" 2>$null
        if ($LASTEXITCODE -eq 0 -and $exe -and (Test-Path $exe)) { return $exe }
    }
    # 2) bare python, only if it already reports 3.12
    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) {
        $ver = & python -c "import sys; print('%d.%d' % sys.version_info[:2])" 2>$null
        if ($ver -eq '3.12') { return $python.Source }
    }
    # 3) well-known per-user / per-machine install locations
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'),
        'C:\Program Files\Python312\python.exe',
        'C:\Python312\python.exe'
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) {
            $ver = & $c -c "import sys; print('%d.%d' % sys.version_info[:2])" 2>$null
            if ($ver -eq '3.12') { return $c }
        }
    }
    return $null
}
$PY = Get-Py312
if (-not $PY) { Fail 'host Python 3.12 not found. Install it ("winget install Python.Python.3.12"); an activated non-3.12 virtualenv will NOT be used' }
$hostVer = & $PY -c "import sys; print('%d.%d.%d' % sys.version_info[:3])"
Write-Ok "host python $hostVer -> $PY"

# -- Step 2: download / cache the embeddable zip --
if (-not (Test-Path $VENDOR)) { New-Item -ItemType Directory -Path $VENDOR -Force | Out-Null }
$zipPath = Join-Path $VENDOR $PY_ZIP
if (-not (Test-Path $zipPath)) {
    $got = $false
    foreach ($url in $PY_URLS) {
        Write-Step "downloading $url"
        try {
            Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
            $bytes = [System.IO.File]::ReadAllBytes($zipPath)
            if ($bytes.Length -ge 4 -and $bytes[0] -eq 0x50 -and $bytes[1] -eq 0x4B) { $got = $true; break }
            Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
        } catch {
            if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
        }
    }
    if (-not $got) { Fail 'all python mirrors failed' }
}
Write-Ok "embeddable zip cached: $zipPath"

# -- Step 3: extract + configure _pth --
if (Test-Path $OUT) { Remove-Item $OUT -Recurse -Force }
Expand-Archive -Path $zipPath -DestinationPath $OUT -Force
@"
import site

python312.zip
.
Lib\site-packages
"@ | Set-Content -Path (Join-Path $OUT 'python312._pth') -Encoding ASCII
Write-Ok 'embeddable extracted + _pth configured'

# -- Step 4: pip install --target (binary wheels only) --
$sitePackages = Join-Path $OUT 'Lib\site-packages'
$reqFile = if (Test-Path $REQ_LOCK) { $REQ_LOCK } else { $REQ_MAIN }
Write-Step "installing deps from $(Split-Path -Leaf $reqFile)"
& $PY -m pip install --target $sitePackages --only-binary=:all: `
    -r $reqFile --no-warn-script-location --quiet `
    -i https://pypi.tuna.tsinghua.edu.cn/simple
if ($LASTEXITCODE -ne 0) {
    Write-Step 'tsinghua mirror failed, retrying pypi.org'
    & $PY -m pip install --target $sitePackages --only-binary=:all: `
        -r $reqFile --no-warn-script-location --quiet
    if ($LASTEXITCODE -ne 0) { Fail 'pip install failed' }
}
# Record resolved versions (source for requirements-lock.txt when built from floating spec)
& $PY -m pip freeze --path $sitePackages | Set-Content -Path (Join-Path $OUT 'installed-packages.txt')
Write-Ok 'python deps installed'
if ($reqFile -eq $REQ_MAIN) {
    Write-Host '[prepare-python] NOTE: built from floating requirements.txt' -ForegroundColor Yellow
    Write-Host '  To pin: commit out/python/installed-packages.txt as server/src/libs/requirements-lock.txt' -ForegroundColor Yellow
}

# -- Step 5: VC++ runtime app-local deployment --
$crtDlls = @('msvcp140.dll', 'msvcp140_1.dll', 'msvcp140_2.dll', 'vcruntime140.dll', 'vcruntime140_1.dll', 'concrt140.dll')
$redistRoots = @()
foreach ($vsEdition in @('Enterprise', 'Professional', 'Community', 'BuildTools')) {
    $p = "C:\Program Files\Microsoft Visual Studio\2022\$vsEdition\VC\Redist\MSVC"
    if (Test-Path $p) { $redistRoots += $p }
}
$crtDir = $null
foreach ($root in $redistRoots) {
    $found = Get-ChildItem -Path $root -Recurse -Directory -Filter '*.CRT' -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match '\\x64\\' } | Select-Object -First 1
    if ($found) { $crtDir = $found.FullName; break }
}
$copied = 0
foreach ($dll in $crtDlls) {
    $src = $null
    if ($crtDir -and (Test-Path (Join-Path $crtDir $dll))) { $src = Join-Path $crtDir $dll }
    elseif (Test-Path (Join-Path $env:SystemRoot "System32\$dll")) { $src = Join-Path $env:SystemRoot "System32\$dll" }
    if ($src) { Copy-Item $src -Destination $OUT -Force; $copied++ }
}
if ($copied -lt 3) {
    Write-Host "[prepare-python] WARN: only $copied VC++ CRT DLLs found; onnxruntime may fail on clean machines" -ForegroundColor Yellow
} else {
    Write-Ok "VC++ CRT DLLs deployed ($copied)"
}

# -- Step 6: import smoke test --
Write-Step 'import smoke test'
& (Join-Path $OUT 'python.exe') -c "import cv2, onnxruntime, rapidocr_onnxruntime; print('imports ok')"
if ($LASTEXITCODE -ne 0) { Fail 'import smoke test failed' }
Write-Ok "done -> $OUT"
