param([long]$WindowHandle,[string]$Destination)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LumenProjectionCapture {
 [StructLayout(LayoutKind.Sequential)] public struct Rect {public int Left,Top,Right,Bottom;}
 [StructLayout(LayoutKind.Sequential)] public struct Point {public int X,Y;}
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr handle,out Rect rect);
 [DllImport("user32.dll")] public static extern IntPtr GetWindowLongPtr(IntPtr handle,int index);
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point point);
 [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr handle,uint flags);
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr handle,IntPtr dc,uint flags);
}
'@
$handle=[IntPtr]::new($WindowHandle)
$rectangle=New-Object LumenProjectionCapture+Rect
if(![LumenProjectionCapture]::GetWindowRect($handle,[ref]$rectangle)){throw 'Projection window not found'}
$style=[LumenProjectionCapture]::GetWindowLongPtr($handle,-16).ToInt64()
$point=New-Object LumenProjectionCapture+Point
$point.X=$rectangle.Left+[int](($rectangle.Right-$rectangle.Left)/2)
$point.Y=$rectangle.Bottom-2
$bottomRoot=[LumenProjectionCapture]::GetAncestor([LumenProjectionCapture]::WindowFromPoint($point),2)
$bitmap=New-Object Drawing.Bitmap ($rectangle.Right-$rectangle.Left),($rectangle.Bottom-$rectangle.Top)
$graphics=[Drawing.Graphics]::FromImage($bitmap)
$dc=$graphics.GetHdc()
try{$captured=[LumenProjectionCapture]::PrintWindow($handle,$dc,2)}finally{$graphics.ReleaseHdc($dc)}
try{$bitmap.Save($Destination,[Drawing.Imaging.ImageFormat]::Png)}finally{$graphics.Dispose();$bitmap.Dispose()}
[pscustomobject]@{captured=$captured;width=$rectangle.Right-$rectangle.Left;height=$rectangle.Bottom-$rectangle.Top;x=$rectangle.Left;y=$rectangle.Top;hasCaption=($style -band 0xC00000) -ne 0;hasThickFrame=($style -band 0x40000) -ne 0;bottomCovered=($bottomRoot -eq $handle);windowHandle=$WindowHandle;bottomWindowHandle=$bottomRoot.ToInt64()}|ConvertTo-Json -Compress
