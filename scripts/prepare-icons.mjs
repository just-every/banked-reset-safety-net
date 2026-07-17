import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ICON_SIZE = 1024;
const CORNER_RADIUS = 224;

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(projectRoot, "build", "logo-source.png");
const outputPath = path.join(projectRoot, "build", "icon.png");

const metadata = await sharp(sourcePath).metadata();

if (!metadata.width || !metadata.height || metadata.width !== metadata.height) {
  throw new Error(`Icon source must be square: ${sourcePath}`);
}

if (metadata.width < ICON_SIZE) {
  throw new Error(`Icon source must be at least ${ICON_SIZE}px: ${sourcePath}`);
}

const roundedRectangleMask = Buffer.from(`
  <svg width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 ${ICON_SIZE} ${ICON_SIZE}">
    <rect width="${ICON_SIZE}" height="${ICON_SIZE}" rx="${CORNER_RADIUS}" fill="white" />
  </svg>
`);

await sharp(sourcePath)
  .resize(ICON_SIZE, ICON_SIZE, { fit: "cover" })
  .ensureAlpha()
  .composite([{ input: roundedRectangleMask, blend: "dest-in" }])
  .png({ compressionLevel: 9, palette: false })
  .toFile(outputPath);

console.log(`Prepared ${path.relative(projectRoot, outputPath)} from ${path.relative(projectRoot, sourcePath)}`);
