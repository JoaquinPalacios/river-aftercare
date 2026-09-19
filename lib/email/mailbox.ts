export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseEmailAddress(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length > 254 || /[\r\n]/.test(trimmed)) {
    return null;
  }
  if (!EMAIL_PATTERN.test(trimmed)) {
    return null;
  }

  return trimmed;
}

export function parseMailboxAddress(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length > 200 || /[\r\n]/.test(trimmed)) {
    return null;
  }

  const angled = trimmed.match(/^(?:"([^"]+)"|([^<]*?))\s*<([^<>]+)>$/);
  if (angled) {
    const name = (angled[1] ?? angled[2] ?? "").trim();
    const email = parseEmailAddress(angled[3]);
    if (!email) {
      return null;
    }
    if (!name) {
      return email;
    }
    if (/[<>]/.test(name)) {
      return null;
    }
    const safeName = name
      .replace(/[\u0000-\u001f\u007f]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!safeName) {
      return email;
    }
    return `${safeName} <${email}>`;
  }

  return parseEmailAddress(trimmed);
}
