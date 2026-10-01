export function isSafeTerminalLink(uri: string, baseUrl: string): boolean {
  if (!uri || uri !== uri.trim() || /[\u0000-\u001f\u007f]/.test(uri)) return false;

  try {
    const base = new URL(baseUrl);
    const resolved = new URL(uri, base);
    if (/^[a-z][a-z\d+.-]*:/i.test(uri)) {
      return ["http:", "https:", "mailto:"].includes(resolved.protocol);
    }
    return ["http:", "https:"].includes(resolved.protocol) && resolved.origin === base.origin;
  } catch {
    return false;
  }
}
