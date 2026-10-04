param(
  [string]$ExcelPath = ".\source.xlsx"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$python = "python"

if (-not (Test-Path -LiteralPath $ExcelPath)) {
  throw "Excel file was not found: $ExcelPath"
}

$extension = [System.IO.Path]::GetExtension($ExcelPath).ToLowerInvariant()
if ($extension -ne ".xlsx") {
  throw "Please save the Excel file as source.xlsx, then run the updater again."
}

& $python (Join-Path $PSScriptRoot "import-vendors-xlsx.py") `
  --input $ExcelPath `
  --json (Join-Path $root "vendors.json") `
  --js (Join-Path $root "vendors-data.js")

if ($LASTEXITCODE -ne 0) {
  throw "Excel import failed."
}

Write-Host "vendors.json and vendors-data.js updated."
