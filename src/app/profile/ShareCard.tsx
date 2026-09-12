"use client";

import { useState } from "react";
import NextImage from "next/image";
import { Avatar, avatarParts } from "@/components/Avatar";
import { ROLES, POWERS, type RoleKey, type PowerKey } from "@/lib/constants";
import { fa } from "@/lib/persian";

type Stats = { coffee: number; bugs: number; sleep: number; confidence: number };

export function ShareCard({
  nickname,
  role,
  power,
  department,
  avatarSeed,
  stats,
}: {
  nickname: string;
  role: RoleKey;
  power: PowerKey;
  department: string;
  avatarSeed: string;
  stats: Stats;
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    const W = 1200;
    const H = 680;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // پس‌زمینهٔ گرادیانی برند
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#002d47");
    grad.addColorStop(1, "#e10126");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // نقاط تزئینی
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    for (let i = 0; i < 40; i++) {
      const x = (i * 97) % W;
      const y = (i * 53) % H;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // آواتار ساده از روی رنگ‌های avatarParts
    const p = avatarParts(avatarSeed);
    const ax = 210;
    const ay = 260;
    const ar = 130;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, Math.PI * 2);
    ctx.fillStyle = p.bg;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ax, ay + 14, ar * 0.56, 0, Math.PI * 2);
    ctx.fillStyle = p.skin;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(ax, ay - ar * 0.28, ar * 0.62, ar * 0.34, 0, Math.PI, 2 * Math.PI);
    ctx.fillStyle = p.hair;
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, Math.PI * 2);
    ctx.stroke();

    // متن‌ها
    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 56px Tahoma, sans-serif";
    ctx.fillText(nickname, W - 70, 170);

    ctx.font = "bold 30px Tahoma, sans-serif";
    ctx.fillStyle = "#eaf4fa";
    ctx.fillText(`${ROLES[role].emoji} ${ROLES[role].label}   ·   ${POWERS[power].emoji} ${POWERS[power].label}`, W - 70, 220);

    ctx.font = "24px Tahoma, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(department, W - 70, 260);

    const items: [string, number][] = [
      ["قهوه", stats.coffee],
      ["باگ", stats.bugs],
      ["خواب", stats.sleep],
      ["اعتمادبه‌نفس", stats.confidence],
    ];
    const boxW = 230;
    const startX = W - 70;
    items.forEach(([label, value], i) => {
      const cx = startX - i * (boxW + 16);
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      roundRect(ctx, cx - boxW, 420, boxW, 110, 18);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 34px Tahoma, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(fa(value), cx - boxW / 2, 470);
      ctx.font = "16px Tahoma, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillText(label, cx - boxW / 2, 500);
      ctx.textAlign = "right";
    });

    // لوگوی تپسل
    try {
      const logo = await loadImage("/brand/tapsell-logo.png");
      const lw = 180;
      const lh = (logo.height / logo.width) * lw;
      // لوگوی تیره روی پس‌زمینهٔ تیره دیده نمی‌شود؛ سفیدش می‌کنیم (مثل کارت درون صفحه)
      const off = document.createElement("canvas");
      off.width = Math.ceil(lw);
      off.height = Math.ceil(lh);
      const octx = off.getContext("2d");
      if (octx) {
        octx.drawImage(logo, 0, 0, lw, lh);
        octx.globalCompositeOperation = "source-in";
        octx.fillStyle = "#ffffff";
        octx.fillRect(0, 0, off.width, off.height);
        ctx.drawImage(off, W - 70 - lw, H - 60 - lh, lw, lh);
      } else {
        ctx.drawImage(logo, W - 70 - lw, H - 60 - lh, lw, lh);
      }
    } catch {
      // لوگو در دسترس نبود؛ کارت بدون لوگو صادر می‌شود
    }

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `karat-${nickname || "founder"}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // باطل‌کردن فوری URL در بعضی مرورگرها دانلود را لغو می‌کند
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }, "image/png");
  }

  async function onDownload() {
    if (busy) return;
    setBusy(true);
    try {
      await download();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-6 anim-rise">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-black text-brand-navy">کارت من</h3>
        <button type="button" onClick={onDownload} disabled={busy} className="btn-primary">
          {busy ? "در حال ساخت…" : "دانلود کارت"}
        </button>
      </div>
      <div
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-navy to-brand-red p-8 text-white shadow-lift"
        style={{ aspectRatio: "600 / 340" }}
      >
        <div className="flex h-full items-center gap-6">
          <Avatar seed={avatarSeed} size={110} className="ring-4 ring-white/70" />
          <div className="flex-1">
            <div className="text-2xl font-black">{nickname}</div>
            <div className="mt-1 flex flex-wrap gap-2 text-xs font-bold text-white/90">
              <span>{ROLES[role].emoji} {ROLES[role].label}</span>
              <span>·</span>
              <span>{POWERS[power].emoji} {POWERS[power].label}</span>
            </div>
            <div className="mt-4 flex gap-3 text-xs">
              <span className="rounded-xl bg-white/15 px-3 py-2 font-black">قهوه {fa(stats.coffee)}</span>
              <span className="rounded-xl bg-white/15 px-3 py-2 font-black">باگ {fa(stats.bugs)}</span>
              <span className="rounded-xl bg-white/15 px-3 py-2 font-black">خواب {fa(stats.sleep)}</span>
            </div>
          </div>
        </div>
        <NextImage
          src="/brand/tapsell-logo.png"
          alt="تپسل"
          width={90}
          height={18}
          className="absolute bottom-4 left-4 h-5 w-auto brightness-0 invert"
        />
      </div>
    </div>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** لوگو هم‌منشأ است (public/brand) پس بوم را tainted نمی‌کند و toBlob کار می‌کند */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "sync";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image failed: ${src}`));
    img.src = src;
  });
}
