export class CommandParseError extends Error {}

export function tokenizeCommand(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  let escaped = false;
  for (const character of input.trim()) {
    if (escaped) { current += character; escaped = false; continue; }
    if (character === "\\" && quote !== "'") { escaped = true; continue; }
    if (quote) {
      if (character === quote) quote = undefined;
      else current += character;
      continue;
    }
    if (character === "'" || character === '"') { quote = character; continue; }
    if (/\s/u.test(character)) {
      if (current) { tokens.push(current); current = ""; }
      continue;
    }
    current += character;
  }
  if (escaped || quote) throw new CommandParseError("Unterminated quote or escape in command.");
  if (current) tokens.push(current);
  return tokens;
}

export function displayCommand(argv: string[]): string {
  return argv.map((token) => /^[A-Za-z0-9_./:@%+=,-]+$/u.test(token) ? token : JSON.stringify(token)).join(" ");
}
