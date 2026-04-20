// Generate a multi-size Windows ICO file from scratch.
// Design: amber-filled circle with three horizontal bars inside (representing the usage bars).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const pngToIco = require('png-to-ico').default;

// Minimal PNG encoder (24-bit RGB + 8-bit alpha = RGBA)
function encodePNG(width, height, pixels) {
  function crc32(buf) {
    let c, crcTable = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // color type RGBA
  ihdr[10] = 0;   // compression
  ihdr[11] = 0;   // filter
  ihdr[12] = 0;   // interlace
  // Build raw scanlines with filter byte (0 = None) per row
  const rowLen = width * 4;
  const raw = Buffer.alloc((rowLen + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (rowLen + 1)] = 0;
    pixels.copy(raw, y * (rowLen + 1) + 1, y * rowLen, (y + 1) * rowLen);
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// Draw icon at given size: amber circle with 3 horizontal bars inside
function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 4); // RGBA
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - Math.max(1, size / 32);

  // Background colors
  const BG_R = 0x1a, BG_G = 0x1a, BG_B = 0x2e;       // dark navy
  const FG_R = 0xd4, FG_G = 0xa5, FG_B = 0x74;       // amber
  const BAR_R = 0x3a, BAR_G = 0x3a, BAR_B = 0x4a;    // dim bar background

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > radius) {
        // Transparent outside circle
        pixels[i] = 0; pixels[i+1] = 0; pixels[i+2] = 0; pixels[i+3] = 0;
        continue;
      }

      // Inside circle — draw navy background
      pixels[i] = BG_R; pixels[i+1] = BG_G; pixels[i+2] = BG_B; pixels[i+3] = 255;

      // Three horizontal bars, each with partial fill (amber) and empty (dim)
      // Bar dimensions relative to size
      const barHeight = Math.max(2, Math.floor(size * 0.10));
      const barSpacing = Math.max(3, Math.floor(size * 0.08));
      const barsHeight = barHeight * 3 + barSpacing * 2;
      const barsStartY = Math.floor(cy - barsHeight / 2);
      const barMargin = Math.floor(size * 0.22);
      const barStartX = barMargin;
      const barEndX = size - barMargin;
      const barWidth = barEndX - barStartX;

      // Fill percentages for each bar (visual decoration)
      const fills = [0.75, 0.45, 0.20];

      for (let b = 0; b < 3; b++) {
        const by = barsStartY + b * (barHeight + barSpacing);
        if (y >= by && y < by + barHeight && x >= barStartX && x < barEndX) {
          const fillWidth = Math.floor(barWidth * fills[b]);
          if (x < barStartX + fillWidth) {
            // Amber filled portion
            pixels[i] = FG_R; pixels[i+1] = FG_G; pixels[i+2] = FG_B; pixels[i+3] = 255;
          } else {
            // Dim unfilled portion
            pixels[i] = BAR_R; pixels[i+1] = BAR_G; pixels[i+2] = BAR_B; pixels[i+3] = 255;
          }
        }
      }

      // Anti-alias edge of circle (rough)
      if (dist > radius - 1) {
        const a = Math.max(0, Math.min(1, radius - dist));
        pixels[i+3] = Math.round(pixels[i+3] * a);
      }
    }
  }
  return pixels;
}

async function main() {
  const sizes = [16, 32, 48, 64, 128, 256];
  const buildDir = path.join(__dirname, 'build');
  if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir);

  const pngBuffers = [];
  for (const size of sizes) {
    const pixels = drawIcon(size);
    const png = encodePNG(size, size, pixels);
    const pngPath = path.join(buildDir, `icon-${size}.png`);
    fs.writeFileSync(pngPath, png);
    pngBuffers.push(png);
    console.log(`Generated ${size}x${size} PNG`);
  }

  const ico = await pngToIco(pngBuffers);
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico);
  // Also keep the largest PNG as icon.png (useful for some configs)
  fs.writeFileSync(path.join(buildDir, 'icon.png'), pngBuffers[pngBuffers.length - 1]);
  console.log('Generated build/icon.ico and build/icon.png');
}

main().catch((err) => { console.error(err); process.exit(1); });
