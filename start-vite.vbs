Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\hi\Downloads\Chog-Casino-extracted\Chog-Casino\artifacts\chog-casino"
WshShell.Run "cmd /c npx vite --host 0.0.0.0 --port 5173 > C:\Users\hi\Downloads\Chog-Casino-extracted\vite.log 2>&1", 0, False
