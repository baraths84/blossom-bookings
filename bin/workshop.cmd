@echo off
setlocal
cd /d "%~dp0.." || exit /b 1
rem The WorkSpaces image installs Node privately. A regular Windows laptop uses PATH.
if exist "%ProgramFiles%\Blossom Workshop\node-v24.21.0-win-x64\node.exe" set "PATH=%ProgramFiles%\Blossom Workshop\node-v24.21.0-win-x64;%PATH%"
node.exe -e "process.exit(process.version === 'v24.21.0' ? 0 : 1)" 2>nul
if errorlevel 1 (
  echo Blossom requires Node 24.21.0 with npm. Check your Node installation. 1>&2
  exit /b 1
)
if "%~1"=="app-setup" goto app_setup
if "%~1"=="foundation-setup" goto foundation_setup
if "%~1"=="node-version" goto node_version
if "%~1"=="preview" goto preview
if "%~1"=="check:quick" goto task_check_quick
if "%~1"=="test" goto task_test
if "%~1"=="playwright" goto task_playwright
if "%~1"=="ci" goto task_ci
echo Unknown workshop command: %1 1>&2
exit /b 2
:app_setup
call npm.cmd ci --include=dev --no-audit --no-fund
exit /b %errorlevel%
:foundation_setup
call npm.cmd --prefix foundation ci --include=dev --no-audit --no-fund
exit /b %errorlevel%
:node_version
node.exe --version
exit /b %errorlevel%
:preview
call npm.cmd start -- --configLoader native
exit /b %errorlevel%
:task_check_quick
call npm.cmd run lint
if errorlevel 1 exit /b %errorlevel%
call .\node_modules\.bin\playwright.cmd test --list
if errorlevel 1 exit /b %errorlevel%
exit /b 0
:task_test
call npm.cmd test
if errorlevel 1 exit /b %errorlevel%
node.exe --test plugins/blossom-bookings/test/plugin.test.mjs scripts/preview-identity.test.mjs
if errorlevel 1 exit /b %errorlevel%
exit /b 0
:task_playwright
call npm.cmd run build
if errorlevel 1 exit /b %errorlevel%
call .\node_modules\.bin\playwright.cmd install --only-shell chromium
if errorlevel 1 exit /b %errorlevel%
call .\node_modules\.bin\playwright.cmd test
if errorlevel 1 exit /b %errorlevel%
exit /b 0
:task_ci
call npm.cmd run lint
if errorlevel 1 exit /b %errorlevel%
call .\node_modules\.bin\playwright.cmd test --list
if errorlevel 1 exit /b %errorlevel%
call npm.cmd test
if errorlevel 1 exit /b %errorlevel%
node.exe --test plugins/blossom-bookings/test/plugin.test.mjs scripts/preview-identity.test.mjs
if errorlevel 1 exit /b %errorlevel%
call npm.cmd run build
if errorlevel 1 exit /b %errorlevel%
call .\node_modules\.bin\playwright.cmd install --only-shell chromium
if errorlevel 1 exit /b %errorlevel%
call .\node_modules\.bin\playwright.cmd test
if errorlevel 1 exit /b %errorlevel%
exit /b 0
