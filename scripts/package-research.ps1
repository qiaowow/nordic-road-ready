param(
  [string]$OutputPath = "deliverables/research-archive-2026-08-18.zip"
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$deliverablesRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot "deliverables"))
$resolvedOutput = [IO.Path]::GetFullPath((Join-Path $projectRoot $OutputPath))

if (-not $resolvedOutput.StartsWith($deliverablesRoot + [IO.Path]::DirectorySeparatorChar)) {
  throw "OutputPath must stay inside the project deliverables directory."
}

$items = @(
  "research",
  "source-archive",
  "data",
  "public/assets",
  "README.md"
) | ForEach-Object { Join-Path $projectRoot $_ }

New-Item -ItemType Directory -Force -Path $deliverablesRoot | Out-Null
Compress-Archive -LiteralPath $items -DestinationPath $resolvedOutput -CompressionLevel Optimal -Force

$archive = Get-Item -LiteralPath $resolvedOutput
$hash = Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedOutput
$sidecarPath = "$resolvedOutput.sha256"
[IO.File]::WriteAllText($sidecarPath, "$($hash.Hash.ToLowerInvariant()) *$($archive.Name)`n", [Text.UTF8Encoding]::new($false))
[pscustomobject]@{
  Path = $archive.FullName
  SizeMB = [math]::Round($archive.Length / 1MB, 2)
  SHA256 = $hash.Hash
  HashFile = $sidecarPath
}
