Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\hi\Downloads\Chog-Casino-extracted\Chog-Casino\operator"
WshShell.Run "cmd /c npx tsx src/index.ts > C:\Users\hi\Downloads\Chog-Casino-extracted\operator.log 2>&1", 0, False
