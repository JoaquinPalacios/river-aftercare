function startsWith(
  bytes: Uint8Array,
  signature: number[],
  offset = 0
): boolean {
  if (bytes.length < offset + signature.length) {
    return false;
  }
  return signature.every((value, index) => bytes[offset + index] === value);
}

function readUint32Be(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function readUint16Be(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint24Le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) {
    return null;
  }
  if (
    !startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ||
    !startsWith(bytes, [0x49, 0x48, 0x44, 0x52], 12)
  ) {
    return null;
  }
  const width = readUint32Be(bytes, 16);
  const height = readUint32Be(bytes, 20);
  if (width < 1 || height < 1) {
    return null;
  }
  return { width, height };
}

function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (
      marker === 0xd8 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9) {
      break;
    }
    if (offset + 3 >= bytes.length) {
      return null;
    }

    const length = readUint16Be(bytes, offset + 2);
    if (length < 2) {
      return null;
    }

    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof) {
      const height = readUint16Be(bytes, offset + 5);
      const width = readUint16Be(bytes, offset + 7);
      if (width < 1 || height < 1) {
        return null;
      }
      return { width, height };
    }

    offset += 2 + length;
  }

  return null;
}

function webpSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 30) {
    return null;
  }
  if (
    !startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) ||
    !startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return null;
  }

  const fourcc = String.fromCharCode(
    bytes[12],
    bytes[13],
    bytes[14],
    bytes[15]
  );

  if (fourcc === "VP8X") {
    const width = readUint24Le(bytes, 24) + 1;
    const height = readUint24Le(bytes, 27) + 1;
    if (width < 1 || height < 1) {
      return null;
    }
    return { width, height };
  }

  if (fourcc === "VP8 " && bytes.length >= 30) {
    const payload = 20;
    if (
      bytes[payload + 3] === 0x9d &&
      bytes[payload + 4] === 0x01 &&
      bytes[payload + 5] === 0x2a
    ) {
      const width = readUint16Be(bytes, payload + 6) & 0x3fff;
      const height = readUint16Be(bytes, payload + 8) & 0x3fff;
      if (width < 1 || height < 1) {
        return null;
      }
      return { width, height };
    }
  }

  if (fourcc === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    const bits =
      bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    if (width < 1 || height < 1) {
      return null;
    }
    return { width, height };
  }

  return null;
}

export function rasterImageSize(
  bytes: Uint8Array
): { width: number; height: number } | null {
  return pngSize(bytes) ?? jpegSize(bytes) ?? webpSize(bytes);
}
