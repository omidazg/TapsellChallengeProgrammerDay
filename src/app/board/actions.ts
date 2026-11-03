"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createBoardPost, deleteBoardPost, reportBoardPost } from "@/lib/board";
import { invalidate } from "@/lib/ttl-cache";
import { rateLimit, rateLimitMessage } from "@/lib/rate-limit";

export type BoardActionState = { error?: string; ok?: boolean; id?: string };

function revalidateBoard() {
  revalidatePath("/board");
  revalidatePath("/showcase", "layout");
  invalidate("feed:");
}

export async function createPostAction(_prev: BoardActionState, formData: FormData): Promise<BoardActionState> {
  const user = await requireUser();
  const limit = rateLimit("board:post", user.id, { limit: 5, windowMs: 60 * 1000 });
  if (!limit.ok) return { error: rateLimitMessage(limit.retryAfterSec) };

  const res = await createBoardPost(user, {
    kind: String(formData.get("kind") ?? ""),
    body: String(formData.get("body") ?? ""),
    imageUrl: String(formData.get("imageUrl") ?? ""),
    linkUrl: String(formData.get("linkUrl") ?? ""),
    productId: String(formData.get("productId") ?? ""),
  });
  if (res.error) return { error: res.error };
  revalidateBoard();
  return { ok: true, id: res.id };
}

export async function deletePostAction(postId: string): Promise<BoardActionState> {
  const user = await requireUser();
  const res = await deleteBoardPost(user, String(postId ?? ""));
  if (res.error) return { error: res.error };
  revalidateBoard();
  return { ok: true };
}

export async function reportPostAction(postId: string, reason: string): Promise<BoardActionState> {
  const user = await requireUser();
  const limit = rateLimit("board:report", user.id, { limit: 10, windowMs: 60 * 60 * 1000 });
  if (!limit.ok) return { error: rateLimitMessage(limit.retryAfterSec) };
  const res = await reportBoardPost(user, String(postId ?? ""), String(reason ?? ""));
  if (res.error) return { error: res.error };
  return { ok: true };
}
