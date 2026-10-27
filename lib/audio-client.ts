/** Seeks and plays even when the audio has not loaded its metadata yet (preload="none", freshly changed src). */
export function seekAndPlay(el: HTMLAudioElement, time: number) {
  if (el.readyState >= 1) el.currentTime = time;
  else el.addEventListener("loadedmetadata", () => { el.currentTime = time; }, { once: true });
  void el.play().catch(() => {});
}

export function downloadText(name: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000); // revoking immediately breaks the download in Safari
}
