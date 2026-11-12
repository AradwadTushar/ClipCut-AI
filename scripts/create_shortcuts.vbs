' ClipCut AI Studio - Desktop and Start Menu Shortcut Creator
Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

' Current script is inside scripts/, get repository root
scriptDir = FSO.GetParentFolderName(FSO.GetParentFolderName(WScript.ScriptFullName))
strDesktop = WshShell.SpecialFolders("Desktop")
strPrograms = WshShell.SpecialFolders("Programs")

targetLauncher = scriptDir & "\ClipCut.vbs"
If Not FSO.FileExists(targetLauncher) Then
    targetLauncher = scriptDir & "\run.bat"
End If

' 1. Desktop Shortcut
On Error Resume Next
Set oDesktopLink = WshShell.CreateShortcut(strDesktop & "\ClipCut AI Studio.lnk")
oDesktopLink.TargetPath = targetLauncher
oDesktopLink.WorkingDirectory = scriptDir
oDesktopLink.Description = "Autonomous AI Video Repurposing Studio for YouTube Shorts and Reels"
oDesktopLink.Save

' 2. Windows Start Menu Shortcut (Instantly searchable via Windows Key)
Set oStartLink = WshShell.CreateShortcut(strPrograms & "\ClipCut AI Studio.lnk")
oStartLink.TargetPath = targetLauncher
oStartLink.WorkingDirectory = scriptDir
oStartLink.Description = "Autonomous AI Video Repurposing Studio for YouTube Shorts and Reels"
oStartLink.Save
On Error GoTo 0
