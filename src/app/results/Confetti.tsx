const COLORS = ["#e10126", "#00b8e0", "#002d47", "#f5a524", "#49ba86"];

function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/** لایهٔ کانفتی با ~۴۰ نوار رنگی؛ کاملاً CSS، بدون کتابخانه. */
export function Confetti() {
  const pieces = Array.from({ length: 40 }, (_, i) => {
    const left = seededRandom(i * 7.13) * 100;
    const delay = seededRandom(i * 3.71) * 2.5;
    const duration = 2.5 + seededRandom(i * 11.9) * 2;
    const color = COLORS[i % COLORS.length];
    const rotate = seededRandom(i * 5.2) * 360;
    return { id: i, left, delay, duration, color, rotate };
  });
  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-0 block w-2 h-3 rounded-sm"
          style={{
            left: `${p.left}%`,
            backgroundColor: p.color,
            transform: `rotate(${p.rotate}deg)`,
            animation: `confetti-fall ${p.duration}s linear ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
