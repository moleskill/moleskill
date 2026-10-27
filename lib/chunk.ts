/** Splits one over-long line at sentence boundaries, falling back to a hard cut at whitespace. */
export function splitLongLine(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const sentences = text.split(/(?<=[.!?…])\s+/);
  const out: string[] = [];
  let current = "";
  const flush = () => { if (current) out.push(current); current = ""; };
  for (const sentence of sentences) {
    let rest = sentence;
    while (rest.length > max) {
      const cut = rest.lastIndexOf(" ", max);
      const at = cut > max * 0.5 ? cut : max;
      flush();
      out.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (!rest) continue;
    if (current && current.length + 1 + rest.length > max) flush();
    current = current ? `${current} ${rest}` : rest;
  }
  flush();
  return out.filter(Boolean);
}

/** Packs lines into chunks of at most `maxChars` characters without ever cutting a line unless it alone exceeds the limit. */
export function chunkLines(lines: readonly string[], maxChars: number): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    for (const piece of splitLongLine(line, maxChars)) {
      if (current && current.length + 1 + piece.length > maxChars) {
        chunks.push(current);
        current = "";
      }
      current = current ? `${current}\n${piece}` : piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
