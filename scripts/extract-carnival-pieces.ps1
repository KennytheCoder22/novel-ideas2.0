param([Parameter(Mandatory=$true)][string]$Sheet)
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$source = [System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath $Sheet).Path)
$destination = Join-Path $PSScriptRoot '../public/experiments/carnival'
function Export-Piece($Name, $X, $Y, $Width, $Height, $Vertices) {
  $result = [System.Drawing.Bitmap]::new($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $region = $null
  if ($Vertices) {
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $path.AddPolygon([System.Drawing.PointF[]]($Vertices | ForEach-Object { [System.Drawing.PointF]::new($_[0], $_[1]) }))
    $region = [System.Drawing.Region]::new($path)
    $path.Dispose()
  }
  # Copy source pixels exactly. Polygon crops only exclude neighboring pieces in
  # otherwise empty corners; no color key, redrawing, threshold or edge cleanup.
  for ($row = 0; $row -lt $Height; $row++) {
    for ($column = 0; $column -lt $Width; $column++) {
      if (!$region -or $region.IsVisible($column + $X, $row + $Y)) {
        $result.SetPixel($column, $row, $source.GetPixel($column + $X, $row + $Y))
      }
    }
  }
  $result.Save((Join-Path $destination $Name), [System.Drawing.Imaging.ImageFormat]::Png)
  $result.Dispose()
  if ($region) { $region.Dispose() }
}
try {
  if ($source.Width -ne 1536 -or $source.Height -ne 1024) { throw 'Unexpected sheet dimensions; do not apply these crops.' }
  Export-Piece 'wheel-frame.png' 35 0 550 535 @(@(35,0),@(585,0),@(585,440),@(470,535),@(160,535),@(35,440))
  Export-Piece 'support.png' 548 60 351 472 @(@(635,60),@(800,60),@(899,532),@(548,532))
  Export-Piece 'gondola-01.png' 872 43 211 296 $null
} finally { $source.Dispose() }
