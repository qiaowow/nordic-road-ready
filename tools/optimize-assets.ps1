$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$assetsPath = Join-Path $workspace 'data\assets.json'
$imageManifestPath = Join-Path $workspace 'research\image-manifest.json'
$assets = Get-Content -Raw -LiteralPath $assetsPath | ConvertFrom-Json
$imageManifest = Get-Content -Raw -LiteralPath $imageManifestPath | ConvertFrom-Json
$photoRoot = (Join-Path $workspace 'public\assets\photos')
$archiveRoot = Join-Path $workspace 'research\original-assets'
$optimized = 0

foreach ($asset in $assets) {
  if ($asset.grade -ne 'B' -or -not $asset.localPath) { continue }
  if ($asset.originalArchivePath -and $asset.optimizedSha256 -and $asset.localPath.EndsWith('.webp')) { continue }
  $relativePath = $asset.localPath -replace '/', '\'
  $sourcePath = [IO.Path]::GetFullPath((Join-Path $workspace $relativePath))
  if (-not $sourcePath.StartsWith($photoRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Photo target leaves public photo directory: $sourcePath"
  }
  if (-not (Test-Path -LiteralPath $sourcePath)) { throw "Missing source image: $sourcePath" }

  $archiveRelative = $relativePath -replace '^public\\assets\\', ''
  $archivePath = Join-Path $archiveRoot $archiveRelative
  New-Item -ItemType Directory -Force -Path (Split-Path $archivePath) | Out-Null
  Copy-Item -LiteralPath $sourcePath -Destination $archivePath -Force
  $sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $sourcePath).Hash
  $archiveHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath).Hash
  if ($sourceHash -ne $archiveHash) { throw "Archive hash mismatch: $sourcePath" }

  $webpPath = [IO.Path]::ChangeExtension($sourcePath, '.webp')
  & ffmpeg -y -loglevel error -i $sourcePath -vf "scale='min(1920,iw)':-2" -c:v libwebp -quality 78 $webpPath
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $webpPath)) { throw "WebP conversion failed: $sourcePath" }
  $webpInfo = Get-Item -LiteralPath $webpPath
  if ($webpInfo.Length -le 0) { throw "Empty WebP output: $webpPath" }

  $webpRelative = [IO.Path]::GetRelativePath($workspace, $webpPath) -replace '\\', '/'
  $archiveRelativeOut = [IO.Path]::GetRelativePath($workspace, $archivePath) -replace '\\', '/'
  $webpHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $webpPath).Hash
  $asset.localPath = $webpRelative
  $asset | Add-Member -NotePropertyName originalArchivePath -NotePropertyValue $archiveRelativeOut -Force
  $asset | Add-Member -NotePropertyName optimizedSha256 -NotePropertyValue $webpHash -Force
  $asset | Add-Member -NotePropertyName optimizedBytes -NotePropertyValue $webpInfo.Length -Force

  $researchAsset = $imageManifest.assets | Where-Object id -eq $asset.id | Select-Object -First 1
  if ($researchAsset) {
    $researchAsset.localPath = $archiveRelativeOut
    $researchAsset | Add-Member -NotePropertyName originalArchivePath -NotePropertyValue $archiveRelativeOut -Force
    $researchAsset | Add-Member -NotePropertyName optimizedLocalPath -NotePropertyValue $webpRelative -Force
    $researchAsset | Add-Member -NotePropertyName optimizedSHA256 -NotePropertyValue $webpHash -Force
    $researchAsset | Add-Member -NotePropertyName optimizedBytes -NotePropertyValue $webpInfo.Length -Force
  }

  if ($sourcePath -ne $webpPath) { Remove-Item -LiteralPath $sourcePath -Force }
  $optimized++
}

$assets | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $assetsPath -Encoding utf8
$imageManifest | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $imageManifestPath -Encoding utf8
Write-Output "ASSETS_OPTIMIZED: photos=$optimized"
