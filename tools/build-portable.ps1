# build-portable.ps1
# Builds a self-contained Scoreboard zip that the server exposes at /downloads/.
# Run by hand or via POST /api/rebuild.

param(
  [string]$OutputPath = "$PSScriptRoot\..\public\downloads\scoreboard-portable.zip"
)

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = (Resolve-Path "$PSScriptRoot\..").Path
$out  = $OutputPath

$outDir = Split-Path $out -Parent
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }

if (Test-Path $out) { Remove-Item -LiteralPath $out -Force }

# Skip VCS metadata, runtime data, secrets, build scripts and noisy artefacts.
$excludeDirs  = @('.git','data','.claude','.chrome-kiosk','infobeamer-scoreboard-main','TP LINK','tools')
$excludeFiles = @('PI_CREDENTIALS.md','GITHUB sync token.txt','.npmrc','npm-debug.log')
$excludeExt   = @('.log','.patch','.bundle','.zip','.tmp')

$rootLen = $root.Length + 1
$files = Get-ChildItem -LiteralPath $root -Recurse -File -Force | Where-Object {
  $rel = $_.FullName.Substring($rootLen)
  # Exclude the downloads directory (the zip itself lives there).
  if ($rel -like 'public\downloads\*') { return $false }
  $segs = $rel.Split('\')
  foreach ($s in $segs) { if ($excludeDirs -contains $s) { return $false } }
  if ($excludeFiles -contains $_.Name)      { return $false }
  if ($excludeExt   -contains $_.Extension) { return $false }
  return $true
}

$zip = [System.IO.Compression.ZipFile]::Open($out, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($f in $files) {
    $entry = $f.FullName.Substring($rootLen).Replace('\','/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $zip, $f.FullName, $entry, [System.IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
  }
} finally { $zip.Dispose() }

$info = Get-Item -LiteralPath $out
"Built {0} - {1:N0} KB, {2} files" -f $info.FullName, ($info.Length/1KB), $files.Count
