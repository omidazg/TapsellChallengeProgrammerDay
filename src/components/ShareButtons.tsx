"use client";

import { useState, useSyncExternalStore } from "react";
import { copyText } from "@/lib/clipboard";
import { telegramShareUrl } from "@/lib/community";

const noop = () => () => {};

/**
 * اشتراک یک صفحهٔ عمومی: تلگرام، اشتراک سیستمی (بله و بقیهٔ اپ‌ها روی موبایل) و کپی لینک.
 * پیش‌نمایش لینک در پیام‌رسان از متادیتای openGraph همان صفحه ساخته می‌شود.
 */
export function ShareButtons({ path, text }: { path: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => "");
  const canShare = useSyncExternalStore(noop, () => typeof navigator.share === "function", () => false);
  const url = `${origin}${path}`;

  return (
    <div className="flex flex-wrap gap-2">
      <a href={telegramShareUrl(url, text)} target="_blank" rel="noopener noreferrer" className="btn-ghost !py-2 !px-4 text-sm">
        ارسال در تلگرام
      </a>
      {canShare && (
        <button
          type="button"
          className="btn-ghost !py-2 !px-4 text-sm"
          onClick={() => navigator.share({ title: text, text, url }).catch(() => {})}
        >
          اشتراک‌گذاری…
        </button>
      )}
      <button
        type="button"
        className="btn-ghost !py-2 !px-4 text-sm"
        onClick={async () => {
          if (await copyText(url)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }
        }}
      >
        {copied ? "کپی شد ✓" : "کپی لینک"}
      </button>
    </div>
  );
}
