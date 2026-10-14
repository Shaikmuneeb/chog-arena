@echo off
cd /d C:\Users\hi\Downloads\Chog-Casino-extracted\Chog-Casino\artifacts\chog-casino
echo Starting Vite dev server...
npx vite --host 0.0.0.0 --port 5173
echo Vite exited. Restarting in 3 seconds...
timeout /t 3 /nobreak >nul
goto :eof
