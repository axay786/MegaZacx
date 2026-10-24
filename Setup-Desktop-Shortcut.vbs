Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)

Set wshShell = CreateObject("WScript.Shell")
desktopPath = wshShell.SpecialFolders("Desktop")
shortcutPath = desktopPath & "\MegaZacx.lnk"

Set shortcut = wshShell.CreateShortcut(shortcutPath)
shortcut.TargetPath = currentDir & "\node_modules\electron\dist\electron.exe"
shortcut.Arguments = """" & currentDir & """"
shortcut.WorkingDirectory = currentDir
shortcut.IconLocation = currentDir & "\src\renderer\assets\icon.ico,0"
shortcut.Description = "MegaZacx - Discord-style Voice & Text App"
shortcut.Save

wshShell.Popup "MegaZacx shortcut created successfully on your Desktop!", 4, "MegaZacx", 64
