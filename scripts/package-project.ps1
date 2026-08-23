param(
  [string]$OutputPath = "deliverables/nordic-road-ready-source.zip"
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$deliverablesRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot "deliverables"))
$resolvedOutput = [IO.Path]::GetFullPath((Join-Path $projectRoot $OutputPath))

if (-not $resolvedOutput.StartsWith($deliverablesRoot + [IO.Path]::DirectorySeparatorChar)) {
  throw "OutputPath must stay inside the project deliverables directory."
}

$items = @(
  ".openai",
  "app",
  "data",
  "db",
  "drizzle",
  "public",
  "scripts",
  "src",
  "tests",
  "tools",
  "worker",
  ".gitignore",
  "drizzle.config.ts",
  "eslint.config.mjs",
  "next-env.d.ts",
  "next.config.ts",
  "package-lock.json",
  "package.json",
  "postcss.config.mjs",
  "README.md",
  "tsconfig.json",
  "vite.config.ts"
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
