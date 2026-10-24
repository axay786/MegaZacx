$desktop = [Environment]::GetFolderPath('Desktop')
$wsh = New-Object -ComObject WScript.Shell
$lnk = $wsh.CreateShortcut((Join-Path $desktop 'MegaZacx.lnk'))
$lnk.TargetPath = 'D:\eZacx-Comm\node_modules\electron\dist\electron.exe'
$lnk.Arguments = 'D:\eZacx-Comm'
$lnk.WorkingDirectory = 'D:\eZacx-Comm'
$lnk.IconLocation = 'D:\eZacx-Comm\src\renderer\assets\icon.ico,0'
$lnk.Description = 'MegaZacx - Voice and Text Chat'
$lnk.Save()

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class ShellChange {
    [DllImport("shell32.dll")]
    public static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);
}
"@
[ShellChange]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
Write-Output "Successfully updated MegaZacx.lnk with icon D:\eZacx-Comm\src\renderer\assets\icon.ico"