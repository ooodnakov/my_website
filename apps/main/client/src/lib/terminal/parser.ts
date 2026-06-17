import type { ParsedCommand } from "./types";

export function parseCommand(raw: string): ParsedCommand {
  const input = raw.trim();
  const tokens: string[] = [];
  let token = "";
  let quote: '"' | "'" | null = null;
  let escaping = false;
  let hasToken = false;

  for (const char of input) {
    if (escaping) {
      token += char;
      escaping = false;
      hasToken = true;
      continue;
    }

    if (char === "\\" && quote !== "'") {
      escaping = true;
      hasToken = true;
      continue;
    }

    if ((char === '"' || char === "'") && !quote) {
      quote = char;
      hasToken = true;
      continue;
    }

    if (char === quote) {
      quote = null;
      hasToken = true;
      continue;
    }

    if (char === "#" && !quote && !hasToken) {
      break;
    }

    if (/\s/.test(char) && !quote) {
      if (hasToken) {
        tokens.push(token);
        token = "";
        hasToken = false;
      }
      continue;
    }

    token += char;
    hasToken = true;
  }

  if (escaping) {
    token += "\\";
    hasToken = true;
  }
  if (quote) throw new Error(`unterminated ${quote} quote`);
  if (hasToken) tokens.push(token);

  const [command = "", ...args] = tokens;
  return { raw, command: command.toLowerCase(), args, tokens };
}
