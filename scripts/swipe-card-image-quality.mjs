import sharp from "sharp";

const SAMPLE_SIZE = 96;
const SAMPLE_HEIGHT = 144;
const DARK_LUMINANCE = 24;
const MIN_MEAN_LUMINANCE = 18;
const MIN_CONTRAST = 16;
const MAX_DARK_PIXEL_RATIO = 0.96;
const MAX_MOSTLY_DARK_PIXEL_RATIO = 0.9;
const MAX_MOSTLY_DARK_MEAN_LUMINANCE = 25;

export async function analyzeSwipeCardImage(buffer) {
  const { data, info } = await sharp(buffer)
    .resize(SAMPLE_SIZE, SAMPLE_HEIGHT, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    })
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const luminances = [];
  let sum = 0;
  let darkPixels = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const luminance = (0.2126 * data[offset]) + (0.7152 * data[offset + 1]) + (0.0722 * data[offset + 2]);
    luminances.push(luminance);
    sum += luminance;
    if (luminance < DARK_LUMINANCE) darkPixels += 1;
  }
  const meanLuminance = sum / luminances.length;
  const variance = luminances.reduce(
    (total, luminance) => total + ((luminance - meanLuminance) ** 2),
    0,
  ) / luminances.length;
  const contrast = Math.sqrt(variance);
  const darkPixelRatio = darkPixels / luminances.length;
  const lowContrastBlank = darkPixelRatio >= MAX_DARK_PIXEL_RATIO
    && meanLuminance < MIN_MEAN_LUMINANCE
    && contrast < MIN_CONTRAST;
  const mostlyDarkBlank = darkPixelRatio >= MAX_MOSTLY_DARK_PIXEL_RATIO
    && meanLuminance < MAX_MOSTLY_DARK_MEAN_LUMINANCE;
  const visuallyBlank = lowContrastBlank || mostlyDarkBlank;
  return {
    visuallyBlank,
    meanLuminance: Number(meanLuminance.toFixed(2)),
    contrast: Number(contrast.toFixed(2)),
    darkPixelRatio: Number(darkPixelRatio.toFixed(4)),
  };
}
