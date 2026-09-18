/**
 * دود-تست پخش‌کنندهٔ SSE حراج، بدون سرور و بدون دیتابیس.
 * اجرا: npx tsx scripts/smoke-sse.ts
 *
 * بررسی می‌کند: subscribe تایمر را روشن می‌کند، اولین وضعیت فوراً می‌رسد،
 * وضعیت تکراری دوباره فرستاده نمی‌شود، poke (معادل publishAuctionChange) تغییر را فوراً می‌فرستد،
 * مشترک تازه آخرین وضعیت را می‌گیرد، و با رفتن آخرین مشترک تایمر خاموش می‌شود.
 */
import { createBroadcaster, sseMessage, type AuctionSnapshot } from "../src/lib/auction-events";

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++;
    console.log(`PASS  ${label}`);
  } else {
    failed++;
    console.log(`FAIL  ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let snapshot: AuctionSnapshot = { id: "a1", state: { price: 10 } };
  let loads = 0;
  const b = createBroadcaster(async () => {
    loads++;
    return snapshot;
  }, 50);

  check("idle before any subscriber", !b.isRunning() && b.subscriberCount() === 0);

  const gotA: string[] = [];
  const unsubA = b.subscribe((m) => gotA.push(m));
  check("timer starts on first subscribe", b.isRunning());
  await b.idle();
  check("first state delivered immediately", gotA.length === 1 && gotA[0] === sseMessage("state", JSON.stringify(snapshot)), gotA);

  await sleep(180); // چند تیک بدون تغییر
  await b.idle();
  check("unchanged state is not re-sent", gotA.length === 1, gotA.length);
  check("loader runs on ticks", loads >= 3, loads);

  snapshot = { id: "a1", state: { price: 12 } };
  b.poke();
  await b.idle();
  check("poke pushes change immediately", gotA.length === 2 && gotA[1].includes('"price":12'), gotA);

  const gotB: string[] = [];
  const unsubB = b.subscribe((m) => gotB.push(m));
  check("late subscriber gets last state synchronously", gotB.length === 1 && gotB[0].includes('"price":12'), gotB);
  check("two subscribers", b.subscriberCount() === 2);

  snapshot = { id: "a2", state: null };
  await sleep(120);
  await b.idle();
  check("timer tick broadcasts to all", gotA.length === 3 && gotB.length === 2 && gotB[1].includes('"a2"'), { a: gotA.length, b: gotB.length });

  // مشترکِ خراب (مثلاً جریان بسته) حذف می‌شود و بقیه را خراب نمی‌کند.
  const unsubBad = b.subscribe(() => {
    throw new Error("closed");
  });
  check("throwing subscriber removed on sync send", b.subscriberCount() === 2);
  unsubBad();

  unsubA();
  check("still running with one subscriber", b.isRunning() && b.subscriberCount() === 1);
  unsubB();
  check("timer stops after last unsubscribe", !b.isRunning() && b.subscriberCount() === 0);

  const loadsAtStop = loads;
  await sleep(150);
  check("no loads after stop", loads === loadsAtStop, { loads, loadsAtStop });

  b.poke();
  await b.idle();
  check("poke without subscribers does nothing", loads === loadsAtStop);

  // پس از توقف، subscribe دوباره از نو شروع می‌کند.
  const gotC: string[] = [];
  const unsubC = b.subscribe((m) => gotC.push(m));
  await b.idle();
  check("restart after stop delivers fresh state", b.isRunning() && gotC.length === 1, gotC);
  unsubC();
  check("stopped again", !b.isRunning());

  // خطای loader پخش را نمی‌کُشد.
  let fail = true;
  const b2 = createBroadcaster(async () => {
    if (fail) throw new Error("db down");
    return { id: null, state: null };
  }, 30);
  const gotD: string[] = [];
  const unsubD = b2.subscribe((m) => gotD.push(m));
  await b2.idle();
  check("loader error sends nothing", gotD.length === 0);
  fail = false;
  await sleep(80);
  await b2.idle();
  check("recovers after loader error", gotD.length === 1, gotD);
  unsubD();
  check("b2 stopped", !b2.isRunning());

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
