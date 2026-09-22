// scripts/generate-icons.js
// Generates valid PNG icons without external npm dependencies using Node.js built-in zlib.

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  let table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

function createChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

function generatePNG(width, height, drawPixel) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = createChunk('IHDR', ihdr);

  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = drawPixel(x, y, width, height);
      const pxOffset = rowOffset + 1 + x * 4;
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

function drawIcon(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const dx = x - cx + 0.5;
  const dy = y - cy + 0.5;
  const dist = Math.sqrt(dx * dx + dy * dy);

  const bgR = w * 0.46;
  if (dist > bgR) {
    return [0, 0, 0, 0];
  }

  const grad = y / h;
  const bgR_val = Math.round(24 + grad * 8);
  const bgG_val = Math.round(32 + grad * 12);
  const bgB_val = Math.round(48 + grad * 16);

  const nx = (x - cx) / (w * 0.4);
  const ny = (y - cy) / (h * 0.4);

  const inBirdBody = (nx + 0.1) ** 2 + (ny - 0.05) ** 2 < 0.35;
  const inHead = (nx + 0.2) ** 2 + (ny + 0.35) ** 2 < 0.12;
  const inBeak = nx < -0.35 && nx > -0.65 && Math.abs(ny + 0.35 - (nx + 0.35) * 0.4) < 0.1;
  const inEye = (nx + 0.28) ** 2 + (ny + 0.4) ** 2 < 0.015;
  const inNoteStem = nx > 0.15 && nx < 0.32 && ny > -0.55 && ny < 0.25;
  const inNoteHead = (nx - 0.05) ** 2 + (ny - 0.25) ** 2 < 0.08;
  const inNoteFlag = nx > 0.3 && nx < 0.55 && ny > -0.55 && ny < -0.25;

  if (inEye) {
    return [bgR_val, bgG_val, bgB_val, 255];
  }

  if (inHead || inBeak || inBirdBody || inNoteStem || inNoteHead || inNoteFlag) {
    return [56, 189, 248, 255]; // Soulseek cyan #38bdf8
  }

  return [bgR_val, bgG_val, bgB_val, 255];
}

const iconsDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(iconsDir, { recursive: true });

fs.writeFileSync(path.join(iconsDir, 'icon-16.png'), generatePNG(16, 16, drawIcon));
fs.writeFileSync(path.join(iconsDir, 'icon-48.png'), generatePNG(48, 48, drawIcon));
fs.writeFileSync(path.join(iconsDir, 'icon-128.png'), generatePNG(128, 128, drawIcon));

console.log('Icons generated successfully in', iconsDir);
