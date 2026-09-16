import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, ...value] = argument.split("=");
    return [key, value.join("=")];
  }),
);

const landingSource = args.get("--landing");
const likeSource = args.get("--like");
const dislikeSource = args.get("--dislike");
const outputDirectory = args.get("--output") || "assets/games/media-mania-environment";

if (!landingSource || !likeSource || !dislikeSource) {
  throw new Error("Usage: node scripts/build-media-mania-environment-assets.mjs --landing=<path> --like=<path> --dislike=<path> [--output=<path>]");
}

const scenes = [
  {
    name: "landing",
    input: landingSource,
    blur: 12,
    overlay: { r: 2, g: 8, b: 20, alpha: 0.18 },
  },
  {
    name: "like",
    input: likeSource,
    blur: 0,
    overlay: { r: 0, g: 20, b: 25, alpha: 0.05 },
  },
  {
    name: "dislike",
    input: dislikeSource,
    blur: 0,
    overlay: { r: 48, g: 3, b: 24, alpha: 0.05 },
  },
];

await fs.mkdir(outputDirectory, { recursive: true });

for (const scene of scenes) {
  let pipeline = sharp(scene.input)
    .resize(1920, 1080, { fit: "cover", position: "centre" });
  if (scene.blur) pipeline = pipeline.blur(scene.blur);
  await pipeline
    .modulate({ brightness: scene.name === "landing" ? 0.9 : 0.98, saturation: 1.05 })
    .composite([{ input: { create: { width: 1920, height: 1080, channels: 4, background: scene.overlay } }, blend: "over" }])
    .webp({ quality: 82, effort: 6 })
    .toFile(path.join(outputDirectory, `${scene.name}.webp`));
}
