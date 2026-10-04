@echo off
cd /d "%~dp0"

echo ========================================
echo  Return Rule Finder - Update Data
echo ========================================
echo.
echo Before updating:
echo 1. Save the latest Excel file as source.xlsx.
echo 2. Put source.xlsx in this folder.
echo 3. Then run this file.
echo.

if exist "source.xlsx" (
  set "EXCEL_FILE=%~dp0source.xlsx"
) else (
  echo source.xlsx was not found.
  echo.
  echo Please open the latest Excel file,
  echo choose Save As,
  echo save it in this folder as source.xlsx,
  echo then run this file again.
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\update-vendors.ps1" -ExcelPath "%EXCEL_FILE%"

if errorlevel 1 (
  echo.
  echo Update failed.
  echo.
  echo Please check:
  echo 1. source.xlsx exists in this folder.
  echo 2. source.xlsx can be opened normally.
  echo 3. Run this file again.
  echo.
  pause
  exit /b 1
)

echo.
echo Update completed.
echo.
echo PC users:
echo Reopen or refresh index.html.
echo.
echo Phone users:
echo Use the updated return-rule-finder-mobile.zip,
echo unzip it on the phone, then open return-rule-finder.html.
echo.
pause
