import type { ParsedCommand } from "./types";

export function parseCommand(raw: string): ParsedCommand {
  const input = raw.trim();
  const tokens: string[] = [];
  let token = "";
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const char of input) {
    if (escaping) {
      token += char;
      escaping = false;
      continue;
    }

    if (char === "\\" && quote !== "'") {
      escaping = true;
      continue;
    }

    if ((char === '"' || char === "'") && !quote) {
      quote = char;
      continue;
    }

    if (char === quote) {
      quote = null;
      continue;
    }

    if (char === "#" && !quote && token.length === 0) {
      break;
    }

    if (/\s/.test(char) && !quote) {
      if (token) {
        tokens.push(token);
        token = "";
      }
      continue;
    }

    token += char;
  }

  if (escaping) token += "\\";
  if (quote) throw new Error(`unterminated ${quote} quote`);
  if (token) tokens.push(token);

  const [command = "", ...args] = tokens;
  return { raw, command: command.toLowerCase(), args, tokens };
}
