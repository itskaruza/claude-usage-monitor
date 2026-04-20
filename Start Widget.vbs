Set WshShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")
strFolder = objFSO.GetParentFolderName(WScript.ScriptFullName)

' Kill any existing instances to avoid single-instance lock issues
WshShell.Run "powershell -Command ""Get-Process electron -EA 0 | Stop-Process -Force; Get-Process 'Claude Usage Monitor' -EA 0 | Stop-Process -Force""", 0, True
WScript.Sleep 1500

' Always run from source (not stale exe)
WshShell.CurrentDirectory = strFolder
WshShell.Run "cmd /c npx electron .", 0, False
