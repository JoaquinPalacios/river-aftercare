export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

function writeUint32Be(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function writeUint16Be(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 8) & 0xff;
  bytes[offset + 1] = value & 0xff;
}

function writeUint24Le(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
}

export function pngBytes(width = OG_WIDTH, height = OG_HEIGHT): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  writeUint32Be(bytes, 8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  writeUint32Be(bytes, 16, width);
  writeUint32Be(bytes, 20, height);
  return bytes;
}

export function jpegBytes(width = OG_WIDTH, height = OG_HEIGHT): Uint8Array {
  const bytes = new Uint8Array(11);
  bytes.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08], 0);
  writeUint16Be(bytes, 7, height);
  writeUint16Be(bytes, 9, width);
  return bytes;
}

export function webpBytes(width = OG_WIDTH, height = OG_HEIGHT): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  writeUint32Be(bytes, 4, 22);
  bytes.set([0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58], 8);
  bytes[16] = 10;
  writeUint24Le(bytes, 24, width - 1);
  writeUint24Le(bytes, 27, height - 1);
  return bytes;
}

export function oversizedPngBytes(): Uint8Array {
  const bytes = new Uint8Array(2 * 1024 * 1024 + 1);
  bytes.set(pngBytes());
  return bytes;
}
