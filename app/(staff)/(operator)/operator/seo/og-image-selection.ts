export function formatFileSize(byteLength: number): string {
  if (byteLength < 1024) {
    return `${byteLength} B`;
  }

  const kilobytes = byteLength / 1024;
  if (kilobytes < 1024) {
    if (kilobytes < 10) {
      const rounded = kilobytes.toFixed(1).replace(/\.0$/, "");
      return `${rounded} KB`;
    }
    return `${Math.round(kilobytes)} KB`;
  }

  const megabytes = kilobytes / 1024;
  const rounded = megabytes.toFixed(1).replace(/\.0$/, "");
  return `${rounded} MB`;
}

export function formatSelectedOgFileLabel(input: {
  name: string;
  byteLength: number;
  width: number | null;
  height: number | null;
}): string {
  const parts = [input.name];
  if (input.width && input.height) {
    parts.push(`${input.width} × ${input.height}`);
  }
  parts.push(formatFileSize(input.byteLength));
  return parts.join(" · ");
}
