export type SpeakerNameMap = Record<string, string> | null | undefined;

/** Replace common diarization labels at presentation time without changing stored text. */
export function applySpeakerNames(text: string, speakerNames: SpeakerNameMap, lang: string): string {
  if (!text) return text;
  const defaultLabel = lang.toLowerCase().startsWith("ru") ? "Спикер" : "Speaker";
  const names = speakerNames ?? {};
  let result = text;
  const entries = Object.entries(names)
    .map(([code, name]) => ({ number: /^s(\d{1,2})$/i.exec(code)?.[1], name: name.trim() }))
    .filter((entry): entry is { number: string; name: string } => !!entry.number && !!entry.name)
    .sort((a, b) => Number(b.number) - Number(a.number));
  for (const { number, name } of entries) {
    const n = number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`(?<![\\p{L}\\p{N}_])(?:Спикер(?:а|у|ом|е)?|Speaker)\\s+${n}(?![\\p{L}\\p{N}_])`, "giu"),
      new RegExp(`\\{s${n}\\}`, "giu"),
      new RegExp(`\\bs${n}\\b`, "giu"),
    ];
    for (const pattern of patterns) result = result.replace(pattern, () => name);
  }
  const resolve = (number: string) => {
    const name = names[`s${number}`];
    return typeof name === "string" && name.trim() ? name.trim() : `${defaultLabel} ${number}`;
  };
  result = result.replace(/\{s(\d{1,2})\}/giu, (_token, number: string) => resolve(number));
  result = result.replace(/(?<![\p{L}\p{N}_])s(\d{1,2})(?![\p{L}\p{N}_])/giu, (_token, number: string) => resolve(number));
  return result;
}
