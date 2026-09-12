/**
 * آواتار قطعی و آفلاین: از روی seed یک شخصیت SVG می‌سازد.
 * seed می‌تواند شامل نقش/قدرت/عددها باشد تا ظاهر متفاوت شود.
 * بعداً می‌توان با تصویر تولیدشدهٔ هوش مصنوعی جایگزین کرد (avatarUrl).
 */

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const BG = ["#e10126", "#00b8e0", "#002d47", "#f5a524", "#49ba86", "#6f78a5", "#ff6900", "#0095b8"];
const SKIN = ["#ffd9b3", "#f1c27d", "#e0ac69", "#c68642", "#8d5524"];
const HAIR = ["#1b1b1b", "#3b2314", "#6b3e1e", "#b55239", "#d9a441", "#7a7a7a"];

export function avatarParts(seed: string) {
  const h = hash(seed);
  return {
    bg: BG[h % BG.length],
    skin: SKIN[(h >> 3) % SKIN.length],
    hair: HAIR[(h >> 6) % HAIR.length],
    hairStyle: (h >> 9) % 4,
    eyes: (h >> 12) % 3,
    mouth: (h >> 15) % 3,
    glasses: ((h >> 18) & 3) === 0,
    accessory: (h >> 20) % 4, // 0 none, 1 headphones, 2 cap, 3 laptop
  };
}

export function Avatar({ seed, size = 40, className = "" }: { seed: string; size?: number; className?: string }) {
  const p = avatarParts(seed);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={`rounded-full shrink-0 ${className}`} aria-hidden>
      <rect width="100" height="100" rx="50" fill={p.bg} />
      {/* بدن */}
      <path d="M20 100 C20 74 80 74 80 100 Z" fill="#ffffff" opacity=".92" />
      {/* گردن و سر */}
      <rect x="43" y="56" width="14" height="12" fill={p.skin} />
      <circle cx="50" cy="44" r="20" fill={p.skin} />
      {/* مو */}
      {p.hairStyle === 0 && <path d="M30 42 C30 22 70 22 70 42 L70 36 C66 24 34 24 30 36 Z" fill={p.hair} />}
      {p.hairStyle === 1 && <path d="M29 46 C26 20 74 20 71 46 C68 34 60 30 50 30 C40 30 32 34 29 46 Z" fill={p.hair} />}
      {p.hairStyle === 2 && <path d="M30 40 C30 18 70 18 70 40 L72 60 C70 50 30 50 28 60 Z" fill={p.hair} />}
      {p.hairStyle === 3 && <ellipse cx="50" cy="28" rx="22" ry="10" fill={p.hair} />}
      {/* چشم‌ها */}
      {p.eyes === 0 && (<><circle cx="43" cy="44" r="2.6" fill="#1b1b1b" /><circle cx="57" cy="44" r="2.6" fill="#1b1b1b" /></>)}
      {p.eyes === 1 && (<><path d="M39 44 q4 -4 8 0" stroke="#1b1b1b" strokeWidth="2.2" fill="none" /><path d="M53 44 q4 -4 8 0" stroke="#1b1b1b" strokeWidth="2.2" fill="none" /></>)}
      {p.eyes === 2 && (<><rect x="40" y="42" width="6" height="4" rx="1" fill="#1b1b1b" /><rect x="54" y="42" width="6" height="4" rx="1" fill="#1b1b1b" /></>)}
      {/* عینک */}
      {p.glasses && (<><circle cx="43" cy="44" r="6" stroke="#002d47" strokeWidth="1.8" fill="none" /><circle cx="57" cy="44" r="6" stroke="#002d47" strokeWidth="1.8" fill="none" /><path d="M49 44 h2" stroke="#002d47" strokeWidth="1.8" /></>)}
      {/* دهان */}
      {p.mouth === 0 && <path d="M44 53 q6 5 12 0" stroke="#7a2e2e" strokeWidth="2" fill="none" strokeLinecap="round" />}
      {p.mouth === 1 && <path d="M44 54 h12" stroke="#7a2e2e" strokeWidth="2" strokeLinecap="round" />}
      {p.mouth === 2 && <ellipse cx="50" cy="54" rx="4" ry="2.5" fill="#7a2e2e" />}
      {/* لوازم */}
      {p.accessory === 1 && (<><path d="M30 44 C30 26 70 26 70 44" stroke="#002d47" strokeWidth="4" fill="none" /><rect x="26" y="40" width="7" height="12" rx="3" fill="#002d47" /><rect x="67" y="40" width="7" height="12" rx="3" fill="#002d47" /></>)}
      {p.accessory === 2 && (<><path d="M28 36 C30 20 70 20 72 36 Z" fill="#e10126" /><rect x="24" y="34" width="52" height="5" rx="2" fill="#e10126" /></>)}
      {p.accessory === 3 && (<><rect x="30" y="80" width="40" height="14" rx="2" fill="#002d47" /><rect x="33" y="82" width="34" height="9" fill="#00b8e0" /></>)}
    </svg>
  );
}
