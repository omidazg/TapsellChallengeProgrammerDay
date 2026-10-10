import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

/**
 * Prisma 7: اتصال از طریق driver adapter انجام می‌شود (بدون engine باینری).
 * مسیر فایل SQLite از DATABASE_URL (مثل file:./dev.db) خوانده می‌شود.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** قفل FIFO ساده (صف promise) */
class Lock {
  #tail: Promise<void> = Promise.resolve();
  acquire(): Promise<() => void> {
    let release!: () => void;
    const next = new Promise<void>((r) => (release = r));
    const prev = this.#tail;
    this.#tail = prev.then(() => next);
    return prev.then(() => release);
  }
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

/** true یعنی این زنجیرهٔ async داخل callback یک prisma.$transaction است. */
const inTransaction = new AsyncLocalStorage<true>();

type Queryable = { queryRaw: (q: unknown) => Promise<unknown>; executeRaw: (q: unknown) => Promise<unknown> };
type TxLike = { commit: () => Promise<void>; rollback: () => Promise<void> };
type AdapterLike = Queryable & { startTransaction: (iso?: unknown) => Promise<TxLike> };

/**
 * آداپتر better-sqlite3 فقط یک اتصال دارد و قفلش فقط تراکنش‌ها را پشت هم می‌چیند. یک
 * کوئری بیرون از تراکنش (از درخواستی دیگر) که وسط یک BEGIN باز اجرا شود، جزو همان
 * تراکنش می‌شود و با rollback آن (مثلاً پیشنهاد ردشدهٔ حراج) بی‌صدا پاک می‌شود. این‌جا
 * کوئری‌های بیرون از تراکنش تا پایان تراکنش باز صبر می‌کنند. کوئری‌هایی که از داخل
 * callback خود تراکنش می‌آیند (حتی با prisma به‌جای tx) صبر نمی‌کنند تا قفل بن‌بست نسازد.
 */
function serializeAdapter(adapter: AdapterLike): AdapterLike {
  const lock = new Lock();
  const guard = <A,>(fn: (a: A) => Promise<unknown>) => (a: A) =>
    inTransaction.getStore() ? fn(a) : lock.run(() => fn(a));
  adapter.queryRaw = guard(adapter.queryRaw.bind(adapter));
  adapter.executeRaw = guard(adapter.executeRaw.bind(adapter));
  const startTransaction = adapter.startTransaction.bind(adapter);
  adapter.startTransaction = async (iso) => {
    const release = await lock.acquire();
    try {
      const tx = await startTransaction(iso);
      let released = false;
      const finish =
        <T,>(fn: () => Promise<T>) =>
        async () => {
          try {
            return await fn();
          } finally {
            if (!released) {
              released = true;
              release();
            }
          }
        };
      tx.commit = finish(tx.commit.bind(tx));
      tx.rollback = finish(tx.rollback.bind(tx));
      return tx;
    } catch (e) {
      release();
      throw e;
    }
  };
  return adapter;
}

class SerializedSqlite extends PrismaBetterSqlite3 {
  override async connect() {
    const adapter = await super.connect();
    return serializeAdapter(adapter as unknown as AdapterLike) as unknown as typeof adapter;
  }
}

function makeClient() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  // WAL: خواندن‌های هم‌زمان در حین نوشتن مسدود نمی‌شوند (مهم برای polling حراج و اعلان‌ها)
  const adapter = new SerializedSqlite({ url, timeout: 5000 });
  const client = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  const $transaction = client.$transaction.bind(client) as (...args: unknown[]) => Promise<unknown>;
  (client as unknown as { $transaction: typeof $transaction }).$transaction = (...args) =>
    inTransaction.run(true, () => $transaction(...args));
  client.$queryRawUnsafe("PRAGMA journal_mode=WAL").catch(() => {});
  client.$queryRawUnsafe("PRAGMA synchronous=NORMAL").catch(() => {});
  return client;
}

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
