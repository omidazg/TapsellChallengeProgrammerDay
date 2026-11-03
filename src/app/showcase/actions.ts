"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { toggleVote } from "@/lib/showcase";
import { rateLimit, rateLimitMessage } from "@/lib/rate-limit";

export type VoteState = { error?: string; voted?: boolean };

/** رأی دادن به محصول ویترین یا پس گرفتن آن */
export async function voteAction(productId: string, slug: string): Promise<VoteState> {
  const user = await requireUser();
  const limit = rateLimit("showcase:vote", user.id, { limit: 30, windowMs: 60 * 1000 });
  if (!limit.ok) return { error: rateLimitMessage(limit.retryAfterSec) };

  const res = await toggleVote(user, String(productId ?? ""));
  if (res.error) return { error: res.error };
  revalidatePath("/showcase");
  revalidatePath(`/showcase/${slug}`);
  return { voted: res.voted };
}
