import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Container, Empty } from "@/components/ui";
import { UserRow } from "./UserRow";

export const metadata = { title: "کاربران · پنل برگزارکننده" };

export default async function AdminUsersPage() {
  const me = await requireAdmin();
  const users = await prisma.user.findMany({
    include: { team: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <>
      <PageHeader eyebrow="پنل برگزارکننده" title="کاربران" desc="دسترسی برگزارکنندگی و تنظیم دستی کیف پول." />
      <Container className="space-y-3">
        {users.length === 0 ? (
          <Empty title="کاربری ثبت نشده" />
        ) : (
          users.map((u) => (
            <UserRow
              key={u.id}
              isMe={u.id === me.id}
              user={{
                id: u.id,
                email: u.email,
                nickname: u.nickname,
                avatarSeed: u.avatarSeed,
                isAdmin: u.isAdmin,
                blocked: !!u.blockedAt,
                teamName: u.team?.name ?? null,
                seedWallet: u.seedWallet,
                buyWallet: u.buyWallet,
              }}
            />
          ))
        )}
      </Container>
    </>
  );
}
