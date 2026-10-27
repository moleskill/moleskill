const H = [40, 70, 100, 55, 85, 30, 95, 60, 45, 80, 35, 65, 90, 50, 75, 40, 60, 30, 85, 55];

export function Wave() {
  return (
    <div aria-hidden className="flex h-12 items-center gap-[3px]">
      {H.map((v, i) => (
        <span key={i} className="w-[3px] origin-center rounded-full bg-accent motion-safe:animate-[wave_1.6s_ease-in-out_infinite]"
          style={{ height: `${v}%`, animationDelay: `${(i % 7) * 0.17}s` }} />
      ))}
    </div>
  );
}
