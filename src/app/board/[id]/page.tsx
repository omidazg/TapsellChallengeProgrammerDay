import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { moduleStatusFor } from "@/lib/module-state";
import { getBoardPost, BOARD_KIND_LABEL } from "@/lib/board";
import { ModuleClosed } from "@/components/ModuleState";
import { ShareButtons } from "@/components/ShareButtons";
import { Container, PageHeader } from "@/components/ui";
import { BoardPostCard } from "../BoardPostCard";
import { PostActions } from "../PostActions";

export const dynamic = "force-dynamic";

function excerpt(text: string, max = 160) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const post = await getBoardPost(id);
  if (!post) return { title: "بورد خبر" };
  const title = `${BOARD_KIND_LABEL[post.kind].label} · ${post.teamName}`;
  const description = excerpt(post.body);
  return { title, description, openGraph: { title, description, ...(post.imageUrl ? { images: [post.imageUrl] } : {}) } };
}

export default async function BoardPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const status = await moduleStatusFor("board", user?.teamId);
  if (status === "hidden") notFound();
  if (status === "closed") return <ModuleClosed moduleKey="board" title="بورد خبر" />;

  const post = await getBoardPost(id);
  if (!post) notFound();
  const ownTeam = !!user?.teamId && user.teamId === post.teamId;

  return (
    <>
      <PageHeader eyebrow="بورد خبر" title={`${BOARD_KIND_LABEL[post.kind].emoji} ${post.teamName}`} />
      <Container className="max-w-3xl space-y-4">
        <BoardPostCard post={post} full />
        <div className="card p-4 sm:p-5 space-y-3">
          <div className="text-sm font-black text-brand-navy">به اشتراک بگذار</div>
          <ShareButtons path={`/board/${post.id}`} text={`${post.teamName}: ${excerpt(post.body, 100)}`} />
        </div>
        {user && <PostActions postId={post.id} canDelete={ownTeam} canReport={!ownTeam} />}
        <Link href="/board" className="btn-ghost">→ بازگشت به بورد</Link>
      </Container>
    </>
  );
}
