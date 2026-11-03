/**
 * ثابت‌های ویترین و بورد خبر — بدون وابستگی به دیتابیس (قابل استفاده در کلاینت).
 * منطق سرور در ./showcase.ts و ./board.ts است.
 */

export type ShowcaseStatus = "" | "REQUESTED" | "APPROVED" | "REJECTED";

export const SHOWCASE_STATUS_LABEL: Record<Exclude<ShowcaseStatus, "">, string> = {
  REQUESTED: "در انتظار تأیید",
  APPROVED: "در ویترین",
  REJECTED: "نیاز به اصلاح",
};

export type ShowcaseSort = "top" | "hot" | "new";
export const SHOWCASE_SORTS: { key: ShowcaseSort; label: string }[] = [
  { key: "top", label: "بهترین‌ها" },
  { key: "hot", label: "داغ این هفته" },
  { key: "new", label: "تازه‌ها" },
];

export const BOARD_KINDS = ["PROGRESS", "LAUNCH", "FEEDBACK", "LESSON"] as const;
export type BoardKind = (typeof BOARD_KINDS)[number];
export const BOARD_KIND_LABEL: Record<BoardKind, { label: string; emoji: string }> = {
  PROGRESS: { label: "پیشرفت", emoji: "🛠️" },
  LAUNCH: { label: "لانچ", emoji: "🚀" },
  FEEDBACK: { label: "درخواست بازخورد", emoji: "🙋" },
  LESSON: { label: "درس‌آموخته", emoji: "💡" },
};

export function isBoardKind(v: unknown): v is BoardKind {
  return (BOARD_KINDS as readonly unknown[]).includes(v);
}

export const BOARD_BODY_MAX = 1000;
/** سقف پست هر تیم در ۲۴ ساعت */
export const BOARD_POSTS_PER_DAY = 5;

/** نام عمومی یک نفر: نام نمایشی اگر خودش وارد کرده، وگرنه نام مستعار */
export function publicName(u: { displayName: string; nickname: string }): string {
  return u.displayName.trim() || u.nickname;
}

/** لینک اشتراک تلگرام */
export function telegramShareUrl(url: string, text: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
}
