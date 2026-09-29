@echo off
cd /d "%~dp0"
docker compose up --build --wait -d
if errorlevel 1 (
  echo No se pudo iniciar Deksa. Asegurate de que Docker Desktop este abierto.
  pause
  exit /b 1
)
start "" "http://127.0.0.1:52655"
echo Abierto en el navegador. Usuario: deksa. Clave local: local.
pause
