# ─────────────────────────────────────────────
# prepare-python — Windows 打包用嵌入式 Python 运行时（→ out/python）
#
# 从 start-prod.ps1 提炼，面向打包管线的差异：
#   1. 不用 get-pip：要求本机/runner 已装完整 Python 3.12（与 embeddable
#      同 minor，保证选中 cp312 wheel），用它 pip install --target
#   2. 依赖锁定：server/src/libs/requirements-lock.txt 存在则优先使用；
#      否则用 requirements.txt 安装，并把 pip freeze 结果写入
#      out/python/installed-packages.txt——首次构建后应将其固化为 lock 提交
#   3. VC++ runtime app-local 部署：目标机可能没装 VC++ Redist，
#      onnxruntime 会 DLL load failed；perUser 安装不能带 vc_redist.exe
#      （需要管理员权限），故直接把 CRT DLL 拷到 python.exe 同目录
#   4. fail-fast + import 冒烟
#
# 用法：powershell -ExecutionPolicy Bypass -File desktop/scripts/prepare-python.ps1
# ─────────────────────────────────────────────

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

# ── Step 1: 宿主 Python 3.12（用于 pip --target） ──
$hostPy = Get-Command python -ErrorAction SilentlyContinue
if (-not $hostPy) { Fail 'host python not found (CI: use actions/setup-python 3.12)' }
$hostVer = & python -c "import sys; print('%d.%d' % sys.version_info[:2])"
if ($hostVer -ne '3.12') { Fail "host python must be 3.12 (matches embeddable, got $hostVer)" }
Write-Ok "host python $hostVer"

# ── Step 2: 下载/缓存 embeddable zip ──
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

# ── Step 3: 解压 + 配置 _pth ──
if (Test-Path $OUT) { Remove-Item $OUT -Recurse -Force }
Expand-Archive -Path $zipPath -DestinationPath $OUT -Force
@"
import site

python312.zip
.
Lib\site-packages
"@ | Set-Content -Path (Join-Path $OUT 'python312._pth') -Encoding ASCII
Write-Ok 'embeddable extracted + _pth configured'

# ── Step 4: pip install --target（只允许二进制 wheel） ──
$sitePackages = Join-Path $OUT 'Lib\site-packages'
$reqFile = if (Test-Path $REQ_LOCK) { $REQ_LOCK } else { $REQ_MAIN }
Write-Step "installing deps from $(Split-Path -Leaf $reqFile)"
& python -m pip install --target $sitePackages --only-binary=:all: `
    -r $reqFile --no-warn-script-location --quiet `
    -i https://pypi.tuna.tsinghua.edu.cn/simple
if ($LASTEXITCODE -ne 0) {
    Write-Step 'tsinghua mirror failed, retrying pypi.org'
    & python -m pip install --target $sitePackages --only-binary=:all: `
        -r $reqFile --no-warn-script-location --quiet
    if ($LASTEXITCODE -ne 0) { Fail 'pip install failed' }
}
# 记录实际安装版本（未用 lock 时据此固化 requirements-lock.txt）
& python -m pip freeze --path $sitePackages | Set-Content -Path (Join-Path $OUT 'installed-packages.txt')
Write-Ok 'python deps installed'
if ($reqFile -eq $REQ_MAIN) {
    Write-Host "[prepare-python] NOTE: built from floating requirements.txt;" -ForegroundColor Yellow
    Write-Host "  固化版本：把 out/python/installed-packages.txt 内容提交为 server/src/libs/requirements-lock.txt" -ForegroundColor Yellow
}

# ── Step 5: VC++ runtime app-local 部署 ──
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

# ── Step 6: import 冒烟 ──
Write-Step 'import smoke test'
& (Join-Path $OUT 'python.exe') -c "import cv2, onnxruntime, rapidocr_onnxruntime; print('imports ok')"
if ($LASTEXITCODE -ne 0) { Fail 'import smoke test failed' }
Write-Ok "done → $OUT"
