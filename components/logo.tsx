const MONOGRAM_A = "M292 270 H405 L512 377 L619 270 H732 V654 H659 V348 H644 L512 480 L360 328 V400 L442 481 L512 551 L603 460 V654 H390 L459 581 L340 462 V654 H292 V270 Z";
const MONOGRAM_B = "M292 492 L366 565 L292 638 Z";

/** The MoleSkill monogram (from public/moleskill-logo.svg), cropped tight and drawn in the current text color. */
export function LogoGlyph() {
  return (
    <svg viewBox="272 250 480 424" fill="currentColor" aria-hidden="true">
      <path d={MONOGRAM_A} />
      <path d={MONOGRAM_B} />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5 text-[1.0625rem] font-semibold tracking-[-.02em]">
      <span className="logo-mark"><LogoGlyph /></span>
      MoleSkill
    </span>
  );
}
