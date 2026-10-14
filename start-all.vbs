Set WshShell = CreateObject("WScript.Shell")

' Start Vite dev server (detached)
WshShell.CurrentDirectory = "C:\Users\hi\Downloads\Chog-Casino-extracted\Chog-Casino\artifacts\chog-casino"
WshShell.Run "cmd /c npx vite --host 0.0.0.0 --port 5173 > C:\Users\hi\Downloads\Chog-Casino-extracted\vite.log 2>&1", 0, False

' Start Operator service (detached)
WshShell.CurrentDirectory = "C:\Users\hi\Downloads\Chog-Casino-extracted\Chog-Casino\operator"
WshShell.Run "cmd /c npx tsx src/index.ts > C:\Users\hi\Downloads\Chog-Casino-extracted\operator.log 2>&1", 0, False

WScript.Echo "Both services started. Vite: http://localhost:5173 | Operator: http://localhost:8787"
