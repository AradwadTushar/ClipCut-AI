' ClipCut AI Studio - Silent Desktop Launcher
Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

' Get the absolute directory where this script lives
scriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir

' Launch run.bat hidden (0 = hide console window, False = don't wait for completion)
WshShell.Run "cmd.exe /c """ & scriptDir & "\run.bat"" --silent", 0, False
Set WshShell = Nothing
Set FSO = Nothing
