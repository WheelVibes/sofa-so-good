import sharp from 'sharp'

const [, , src, out, l, t, w, h] = process.argv
await sharp(src).extract({ left: +l, top: +t, width: +w, height: +h }).toFile(out)
console.log('cropped', out)
