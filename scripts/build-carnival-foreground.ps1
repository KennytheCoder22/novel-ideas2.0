param([switch]$Inspect)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Join-Path $PSScriptRoot '../public/experiments/carnival'
$source = [System.Drawing.Bitmap]::new((Join-Path $root 'midway.png'))
if ($Inspect) {
  $crop = $source.Clone([System.Drawing.Rectangle]::new(850,60,470,560), $source.PixelFormat)
  $grid = [System.Drawing.Graphics]::FromImage($crop)
  $font = [System.Drawing.Font]::new('Arial',8)
  for ($x=0;$x -lt 470;$x+=50) { $grid.DrawLine([System.Drawing.Pens]::Cyan,$x,0,$x,560); $grid.DrawString([string]($x+850),$font,[System.Drawing.Brushes]::Cyan,$x+2,0) }
  for ($y=40;$y -lt 560;$y+=50) { $grid.DrawLine([System.Drawing.Pens]::Cyan,0,$y,470,$y); $grid.DrawString([string]($y+60),$font,[System.Drawing.Brushes]::Cyan,0,$y+2) }
  $grid.Dispose(); $font.Dispose()
  $crop.Save((Join-Path $env:TEMP 'carnival-foreground-inspection.png'), [System.Drawing.Imaging.ImageFormat]::Png)
  $crop.Dispose(); $source.Dispose(); exit
}
$definition = Get-Content -Raw (Join-Path $PSScriptRoot 'carnival-foreground.json') | ConvertFrom-Json
$mask = [System.Drawing.Bitmap]::new($source.Width, $source.Height)
$graphics = [System.Drawing.Graphics]::FromImage($mask)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
foreach ($shape in $definition.shapes) {
  $points = [System.Drawing.PointF[]]($shape.points | ForEach-Object { [System.Drawing.PointF]::new($_[0], $_[1]) })
  if ($shape.width) {
    $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, [single]$shape.width)
    $graphics.DrawLines($pen, $points); $pen.Dispose()
  } else { $graphics.FillPolygon([System.Drawing.Brushes]::White, $points) }
}
$graphics.Dispose()
$foreground = [System.Drawing.Bitmap]::new($source.Width, $source.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
for ($row = 0; $row -lt $source.Height; $row++) {
  for ($column = 0; $column -lt $source.Width; $column++) {
    $alpha = $mask.GetPixel($column,$row).A
    # The small existing bulbs hang below the cable. Select their warm cores
    # from the actual source pixels; never synthesize lamps or a glow.
    if ($column -ge 975 -and $column -le 1133 -and $row -ge 320 -and $row -le 383) {
      $lightPixel = $source.GetPixel($column,$row)
      if ($lightPixel.R -gt 135 -and $lightPixel.G -gt 65 -and $lightPixel.R -gt $lightPixel.B * 1.35) { $alpha = 255 }
    }
    if ($alpha -gt 0) {
      $pixel = $source.GetPixel($column,$row)
      $foreground.SetPixel($column,$row,[System.Drawing.Color]::FromArgb($alpha,$pixel.R,$pixel.G,$pixel.B))
    }
  }
}
$foreground.Save((Join-Path $root 'foreground.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$foreground.Dispose(); $mask.Dispose(); $source.Dispose()
