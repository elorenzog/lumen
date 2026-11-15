param([string]$ProcessName,[string]$Destination,[int]$ClickX=-1,[int]$ClickY=-1,[switch]$ScreenCapture)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LumenWindowCapture {
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left,Top,Right,Bottom; }
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr handle,out Rect rect);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr handle,IntPtr dc,uint flags);
    [StructLayout(LayoutKind.Sequential)] public struct Point { public int X,Y; }
    [DllImport("user32.dll")] public static extern bool ScreenToClient(IntPtr handle,ref Point point);
    [DllImport("user32.dll")] public static extern IntPtr ChildWindowFromPointEx(IntPtr handle,Point point,uint flags);
    [DllImport("user32.dll")] public static extern int MapWindowPoints(IntPtr from,IntPtr to,ref Point point,uint count);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr handle,uint message,IntPtr wParam,IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr handle);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr handle,int command);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point point);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
    public static void Click(IntPtr root,int x,int y){
        Rect rectangle;GetWindowRect(root,out rectangle);
        Point point=new Point{X=rectangle.Left+x,Y=rectangle.Top+y};ScreenToClient(root,ref point);
        IntPtr target=root;
        for(int i=0;i<20;i++){IntPtr child=ChildWindowFromPointEx(target,point,7);if(child==IntPtr.Zero||child==target)break;MapWindowPoints(target,child,ref point,1);target=child;}
        IntPtr position=new IntPtr((point.Y<<16)|(point.X&65535));
        PostMessage(target,0x201,new IntPtr(1),position);PostMessage(target,0x202,IntPtr.Zero,position);
    }
}
'@
$appProcess=Get-Process -Name $ProcessName | Where-Object {$_.MainWindowHandle -ne [IntPtr]::Zero} | Select-Object -First 1
if(!$appProcess){throw 'No se encontró la ventana solicitada.'}
if($ScreenCapture){$null=[LumenWindowCapture]::ShowWindow($appProcess.MainWindowHandle,9);$null=[LumenWindowCapture]::SetForegroundWindow($appProcess.MainWindowHandle);Start-Sleep -Milliseconds 200}
if($ClickX -ge 0 -and $ClickY -ge 0){
    if($ScreenCapture){
        $clickRect=New-Object LumenWindowCapture+Rect;$cursor=New-Object LumenWindowCapture+Point
        $null=[LumenWindowCapture]::GetCursorPos([ref]$cursor)
        $null=[LumenWindowCapture]::GetWindowRect($appProcess.MainWindowHandle,[ref]$clickRect)
        $null=[LumenWindowCapture]::SetCursorPos(($clickRect.Left+$ClickX),($clickRect.Top+$ClickY))
        [LumenWindowCapture]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[LumenWindowCapture]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
        $null=[LumenWindowCapture]::SetCursorPos($cursor.X,$cursor.Y)
    }else{[LumenWindowCapture]::Click($appProcess.MainWindowHandle,$ClickX,$ClickY)}
    Start-Sleep -Milliseconds 400
}
$rectangle=New-Object LumenWindowCapture+Rect
$null=[LumenWindowCapture]::GetWindowRect($appProcess.MainWindowHandle,[ref]$rectangle)
$bitmap=New-Object Drawing.Bitmap ($rectangle.Right-$rectangle.Left),($rectangle.Bottom-$rectangle.Top)
$graphics=[Drawing.Graphics]::FromImage($bitmap)
if($ScreenCapture){$graphics.CopyFromScreen($rectangle.Left,$rectangle.Top,0,0,$bitmap.Size);$captured=$true}
else{$dc=$graphics.GetHdc();try {$captured=[LumenWindowCapture]::PrintWindow($appProcess.MainWindowHandle,$dc,2)} finally {$graphics.ReleaseHdc($dc)}}
try {$bitmap.Save($Destination,[Drawing.Imaging.ImageFormat]::Png)} finally {$graphics.Dispose();$bitmap.Dispose()}
[pscustomobject]@{Process=$ProcessName;Captured=$captured;File=$Destination} | ConvertTo-Json -Compress
