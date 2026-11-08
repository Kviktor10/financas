@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 (set PYTHON=python) else (set PYTHON=py)
start "Mercado & Finanças - Navegador" http://127.0.0.1:8000
%PYTHON% -m http.server 8000 --bind 127.0.0.1
endlocal
