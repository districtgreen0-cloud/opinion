// frames + music → out/OPINION-promo.mp4 (H.264, 1080p30, AAC)
import { execSync } from 'node:child_process'
const here = new URL('.', import.meta.url).pathname
execSync(
  `ffmpeg -y -framerate 30 -i out/frames/f%05d.jpg -i out/music.wav -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 192k -shortest out/OPINION-promo.mp4`,
  { cwd: here, stdio: 'inherit' },
)
console.log('→ out/OPINION-promo.mp4')
