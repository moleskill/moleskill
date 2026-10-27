"use client";

import { useEffect, useRef } from "react";

export function LiveWave({ analyser, paused, label }: { analyser: AnalyserNode | null; paused: boolean; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !analyser) return;
    let frame = 0;
    const values = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      if (document.visibilityState === "visible" && !paused) {
        analyser.getByteFrequencyData(values);
        const box = canvas.getBoundingClientRect();
        const ratio = window.devicePixelRatio || 1;
        const width = Math.max(1, Math.floor(box.width * ratio));
        const height = Math.max(1, Math.floor(box.height * ratio));
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
        context.clearRect(0, 0, width, height);
        const bar = Math.max(2 * ratio, width / 70);
        const gap = bar * .5;
        const count = Math.floor(width / (bar + gap));
        const step = Math.max(1, Math.floor(values.length / count));
        context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#4263eb";
        for (let i = 0; i < count; i += 1) {
          const energy = values[i * step] / 255;
          const h = Math.max(2 * ratio, energy * height * .92);
          context.globalAlpha = .35 + energy * .65;
          context.fillRect(i * (bar + gap), (height - h) / 2, bar, h);
        }
        context.globalAlpha = 1;
      }
      if (document.visibilityState === "visible" && !paused) frame = requestAnimationFrame(draw);
    };
    const visibility = () => {
      cancelAnimationFrame(frame);
      if (!paused && document.visibilityState === "visible") frame = requestAnimationFrame(draw);
    };
    document.addEventListener("visibilitychange", visibility);
    visibility();
    return () => { cancelAnimationFrame(frame); document.removeEventListener("visibilitychange", visibility); };
  }, [analyser, paused]);
  return <canvas ref={canvasRef} role="img" aria-label={label} className="h-16 w-full" />;
}
