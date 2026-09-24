param([Parameter(Mandatory=$true)][string]$Sheet,[Parameter(Mandatory=$true)][string]$PickedUp)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$out=Join-Path $PSScriptRoot '../public/experiments/carnival'
$source=[System.Drawing.Bitmap]::new($Sheet)
# Non-overlapping source regions. Retain original RGBA; no color-key/matte removal.
$regions=@(
  @{name='fox-breaking'; rect=@(0,0,795,765); points=@(0,0,750,0,766,291,751,365,795,453,782,570,756,729,501,754,316,765,290,730,0,730)},
  @{name='mara-front'; rect=@(0,734,309,124)},
  @{name='mara-back'; rect=@(950,750,312,125)},
  @{name='fox-fragment-0'; rect=@(776,9,160,174)},
  @{name='fox-fragment-1'; rect=@(770,187,121,106)},
  @{name='fox-fragment-2'; rect=@(899,183,146,135)},
  @{name='fox-fragment-3'; rect=@(1061,142,125,174)},
  @{name='fox-fragment-4'; rect=@(767,299,126,137)},
  @{name='fox-fragment-5'; rect=@(890,426,95,125)}
)
foreach($r in $regions){
  $a=$r.rect; $image=$source.Clone([System.Drawing.Rectangle]::new($a[0],$a[1],$a[2],$a[3]),[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  if($r.points){
    $path=[System.Drawing.Drawing2D.GraphicsPath]::new(); $pts=@()
    for($i=0;$i -lt $r.points.Count;$i+=2){$pts += [System.Drawing.Point]::new($r.points[$i],$r.points[$i+1])}
    $path.AddPolygon([System.Drawing.Point[]]$pts)
    for($y=0;$y -lt $image.Height;$y++){for($x=0;$x -lt $image.Width;$x++){if(-not $path.IsVisible($x,$y)){$image.SetPixel($x,$y,[System.Drawing.Color]::Transparent)}}}
    $path.Dispose()
  }
  $image.Save((Join-Path $out ($r.name+'.png')),[System.Drawing.Imaging.ImageFormat]::Png); $image.Dispose()
}
$source.Dispose()
Copy-Item -LiteralPath $PickedUp -Destination (Join-Path $out 'fox-picked-up.png')
