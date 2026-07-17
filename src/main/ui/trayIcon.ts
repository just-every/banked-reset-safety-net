import { nativeImage, type NativeImage } from 'electron'

export function createTrayIcon(): NativeImage {
  const image = nativeImage.createFromBitmap(createBitmap(32), {
    width: 32,
    height: 32,
    scaleFactor: 2
  })
  if (process.platform === 'darwin') image.setTemplateImage(true)
  return image
}

function createBitmap(size: number): Buffer {
  const bitmap = Buffer.alloc(size * size * 4)
  const center = (size - 1) / 2

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x - center, y - center)
      const onRing = distance >= size * 0.3 && distance <= size * 0.39
      const inGap = x > center + size * 0.12 && y < center - size * 0.08
      const onHand =
        Math.abs(x - center) <= size * 0.045 && y >= center - size * 0.18 && y <= center + 1
      const onMinuteHand =
        y >= center - 1 && y <= center + size * 0.06 && x >= center && x <= center + size * 0.18
      const onArrow =
        x >= center + size * 0.16 &&
        x <= center + size * 0.36 &&
        y >= center - size * 0.31 &&
        y <= center - size * 0.1 &&
        x + y >= size * 0.83

      if ((onRing && !inGap) || onHand || onMinuteHand || onArrow) {
        const offset = (y * size + x) * 4
        bitmap[offset] = 0
        bitmap[offset + 1] = 0
        bitmap[offset + 2] = 0
        bitmap[offset + 3] = 255
      }
    }
  }
  return bitmap
}
