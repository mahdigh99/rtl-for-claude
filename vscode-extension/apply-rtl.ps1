# apply-rtl.ps1 - Patch Claude Code VS Code webview for Persian RTL + font (Windows PowerShell)

[CmdletBinding()]
param (
    [switch]$Remove,
    [switch]$List
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$StylesSrc = Join-Path $ScriptDir "assets\styles.css"
# rtl-math.js is injected into index.js BEFORE driver.js (the driver reads the
# RTLXMath global and no-ops math isolation without it).
$MathSrc = Join-Path $ScriptDir "assets\rtl-math.js"
$DriverSrc = Join-Path $ScriptDir "assets\driver.js"
$FontSrc = Join-Path $ScriptDir "assets\Vazirmatn-Regular.woff2"
$FontDestName = "vazirmatn.woff2"

$BeginMark = "/* ==== RTL-PATCH (begin) ==== */"
$EndMark = "/* ==== RTL-PATCH (end) ==== */"

# Verify source files
if (-not $Remove -and -not $List) {
    foreach ($f in @($StylesSrc, $MathSrc, $DriverSrc, $FontSrc)) {
        if (-not (Test-Path $f)) {
            Write-Error "ERROR: Required source file not found: $f"
            exit 1
        }
    }
}

function Get-Targets {
    $roots = @(
        "$Home\.antigravity-ide\extensions",
        "$Home\.vscode\extensions",
        "$Home\.vscode-insiders\extensions",
        "$Home\.cursor\extensions",
        "$Home\.windsurf\extensions"
    )
    $targets = @()
    foreach ($r in $roots) {
        if (Test-Path $r) {
            $found = Get-ChildItem -Path $r -Filter "index.css" -Recurse -ErrorAction SilentlyContinue |
                Where-StylePath
            # An empty pipeline yields $null; appending it would add a null
            # element and defeat the "no targets found" check below.
            if ($found) { $targets += @($found) }
        }
    }
    return $targets
}

filter Where-StylePath {
    if ($_.FullName -match "anthropic\.claude-code.*[\\/]webview[\\/]index\.css$") {
        $_
    }
}

function Strip-Content ($content) {
    # Remove our marked block (always appended at end-of-file) from a string.
    $escapedBegin = [regex]::Escape($BeginMark)
    $escapedEnd = [regex]::Escape($EndMark)
    $pattern = "(?s)\r?\n?" + $escapedBegin + ".*?" + $escapedEnd + "\s*$"
    return [regex]::Replace($content, $pattern, "")
}

function Strip-Patch ($filePath) {
    if (-not (Test-Path $filePath)) { return }
    $content = [System.IO.File]::ReadAllText($filePath)
    [System.IO.File]::WriteAllText($filePath, (Strip-Content $content))
}

function Append-Block ($targetPath, $srcPaths) {
    # $srcPaths: one path or an array of paths, concatenated in order inside a
    # single marked block (rtl-math.js must precede driver.js in index.js).
    if (-not (Test-Path $targetPath)) { return }
    $bak = $targetPath + ".rtl-backup"
    if (-not (Test-Path $bak)) {
        Copy-Item -Path $targetPath -Destination $bak -Force
    }
    # Strip any previous version of our block in memory (idempotent re-apply);
    # the target file itself is only replaced whole, via the Move-Item below.
    $targetContent = Strip-Content ([System.IO.File]::ReadAllText($targetPath))
    if ($targetContent.Length -gt 0 -and -not $targetContent.EndsWith("`n")) {
        $targetContent += "`n"
    }
    $addition = ""
    foreach ($src in @($srcPaths)) {
        $addition += [System.IO.File]::ReadAllText($src) + "`n"
    }
    $newContent = $targetContent + $BeginMark + "`n" + $addition + $EndMark + "`n"
    # Size guard: injection only ADDS bytes on top of the pristine original, so
    # a result smaller than the backup means the current file is torn/truncated
    # (e.g. by a crashed patcher). Keep the good backup, skip this file.
    $newBytes = [System.Text.Encoding]::UTF8.GetByteCount($newContent)
    $bakBytes = (Get-Item $bak).Length
    if ($newBytes -lt $bakBytes) {
        Write-Warning "skipped $targetPath - result ($newBytes B) smaller than its pristine backup ($bakBytes B): the file looks torn. Restore it from $bak, then re-run."
        return
    }
    $tmp = "$targetPath.tmp.$PID"
    [System.IO.File]::WriteAllText($tmp, $newContent)
    Move-Item -Path $tmp -Destination $targetPath -Force
}

function Patch-One ($cssPath) {
    $dir = Split-Path -Parent $cssPath
    $jsPath = Join-Path $dir "index.js"
    
    Append-Block $cssPath $StylesSrc
    Copy-Item -Path $FontSrc -Destination (Join-Path $dir $FontDestName) -Force
    if (Test-Path $jsPath) {
        Append-Block $jsPath @($MathSrc, $DriverSrc)
        Write-Host "  patched: $dir (index.css + index.js)" -ForegroundColor Green
    } else {
        Write-Host "  patched CSS only (index.js not found): $cssPath" -ForegroundColor Yellow
    }
}

function Unpatch-One ($cssPath) {
    $dir = Split-Path -Parent $cssPath
    $jsPath = Join-Path $dir "index.js"
    $fontPath = Join-Path $dir $FontDestName
    
    # Restore backups if present, else strip
    $restored = $false
    foreach ($file in @($cssPath, $jsPath)) {
        $bak = $file + ".rtl-backup"
        if (Test-Path $bak) {
            Copy-Item -Path $bak -Destination $file -Force
            Remove-Item -Path $bak -Force
            $restored = $true
        } else {
            Strip-Patch $file
        }
    }
    if (Test-Path $fontPath) {
        Remove-Item -Path $fontPath -Force
    }
    Write-Host "  unpatched: $dir" -ForegroundColor Cyan
}

$targets = Get-Targets
if ($targets.Count -eq 0) {
    Write-Host "No Claude Code extension found in standard paths." -ForegroundColor Yellow
    exit 1
}

if ($List) {
    Write-Host "$($targets.Count) target folder(s) found:"
    foreach ($t in $targets) {
        Write-Host "  $(Split-Path -Parent $t.FullName)"
    }
} elseif ($Remove) {
    Write-Host "Removing patch..."
    foreach ($t in $targets) {
        Unpatch-One $t.FullName
    }
    Write-Host "Removed. Reload your VS Code window to apply." -ForegroundColor Green
} else {
    Write-Host "Applying patch..."
    foreach ($t in $targets) {
        Patch-One $t.FullName
    }
    Write-Host "Done. Run 'Developer: Reload Window' in VS Code to apply." -ForegroundColor Green
}
