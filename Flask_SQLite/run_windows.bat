@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 (
  set PYTHON=python
) else (
  set PYTHON=py
)
if not exist ".venv\Scripts\python.exe" (
  echo Criando ambiente virtual...
  %PYTHON% -m venv .venv
  if errorlevel 1 goto error
)
echo Instalando ou verificando dependencias...
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 goto error
echo.
echo Iniciando Mercado & Financas (Flask + SQLite)...
start "" http://127.0.0.1:5000
.venv\Scripts\python.exe app.py
if errorlevel 1 goto error
goto end
:error
echo.
echo Ocorreu um erro. Verifique se Python 3 esta instalado e consulte a mensagem acima.
pause
:end
endlocal
