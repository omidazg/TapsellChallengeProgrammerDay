/**
 * ابزار تست‌بار (load test) میدان بنیان‌گذاران.
 *
 * اجرا (نمونه‌ها):
 *   npx tsx scripts/loadtest.ts --base http://localhost:3000 --scenario public --connections 50 --duration 30
 *   npx tsx scripts/loadtest.ts --base http://staging:8080 --scenario auth --cookies loadtest-cookies.json
 *   npx tsx scripts/loadtest.ts --base http://staging:8080 --scenario all --cookies loadtest-cookies.json --sse 300
 *
 * جزئیات کامل و راهنمای اجرا روی استیجینگ: docs/loadtest.md
 */
import autocannon from "autocannon";
import fs from "node:fs";
import path from "node:path";

// ---------- آستانه‌های پیش‌فرض PASS/FAIL (با گزینه‌های --threshold-* قابل تغییرند) ----------
interface Thresholds {
  apiP95Ms: number;
  pageP95Ms: number;
  errorRateMax: number; // نسبت (۰..۱)
  sseEstablishedMin: number; // نسبت (۰..۱)
}
const DEFAULT_THRESHOLDS: Thresholds = {
  apiP95Ms: 500,
  pageP95Ms: 1500,
  errorRateMax: 0.01,
  sseEstablishedMin: 0.99,
};

type Kind = "page" | "api";
interface WeightedPath {
  path: string;
  weight: number;
  kind: Kind;
}

// وزن‌ها تقریبی‌اند و صرفاً نسبت درخواست‌ها را در ترکیب شبیه می‌کنند.
const PUBLIC_MIX: WeightedPath[] = [
  { path: "/", weight: 3, kind: "page" },
  { path: "/api/phase", weight: 4, kind: "api" },
  { path: "/api/market/ticker", weight: 2, kind: "api" },
  { path: "/api/auction/live", weight: 1, kind: "api" },
];

const AUTH_MIX: WeightedPath[] = [
  { path: "/market", weight: 3, kind: "page" },
  { path: "/leaderboard", weight: 2, kind: "page" },
  { path: "/auction", weight: 2, kind: "page" },
  { path: "/api/notifications", weight: 3, kind: "api" },
];

// ---------- CLI ----------
interface Args {
  base: string;
  duration: number;
  connections: number;
  scenario: "public" | "auth" | "sse" | "all";
  cookiesFile: string | null;
  sse: number;
  paths: string[] | null;
  thresholds: Thresholds;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    base: "http://localhost:3000",
    duration: 30,
    connections: 100,
    scenario: "public",
    cookiesFile: null,
    sse: 50,
    paths: null,
    thresholds: { ...DEFAULT_THRESHOLDS },
  };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    switch (t) {
      case "--base":
        a.base = argv[++i];
        break;
      case "--duration":
        a.duration = Number(argv[++i]);
        break;
      case "--connections":
        a.connections = Number(argv[++i]);
        break;
      case "--scenario":
        a.scenario = argv[++i] as Args["scenario"];
        break;
      case "--cookies":
        a.cookiesFile = argv[++i];
        break;
      case "--sse":
        a.sse = Number(argv[++i]);
        break;
      case "--paths":
        a.paths = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
        break;
      case "--threshold-api-p95":
        a.thresholds.apiP95Ms = Number(argv[++i]);
        break;
      case "--threshold-page-p95":
        a.thresholds.pageP95Ms = Number(argv[++i]);
        break;
      case "--threshold-error-rate":
        a.thresholds.errorRateMax = Number(argv[++i]);
        break;
      case "--threshold-sse-established":
        a.thresholds.sseEstablishedMin = Number(argv[++i]);
        break;
      default:
        throw new Error(`گزینهٔ ناشناخته: ${t}`);
    }
  }
  if (!["public", "auth", "sse", "all"].includes(a.scenario)) {
    throw new Error(`سناریوی نامعتبر: ${a.scenario} (public|auth|sse|all)`);
  }
  return a;
}

function loadCookies(file: string): string[] {
  const raw = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  const users = raw.users as { cookie: string }[];
  if (!Array.isArray(users) || users.length === 0) {
    throw new Error(`فایل کوکی خالی یا نامعتبر است: ${file}`);
  }
  return users.map((u) => u.cookie);
}

// ---------- ترکیب وزن‌دار درخواست‌ها ----------
// mulberry32: PRNG کوچک و بدون وابستگی، برای شافل قطعی (تکرارپذیر بین اجراها).
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function expandWeighted(entries: WeightedPath[]): string[] {
  const out: string[] = [];
  for (const e of entries) for (let i = 0; i < e.weight; i++) out.push(e.path);
  const rand = mulberry32(42);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function splitConnections(total: number, groups: WeightedPath[][]): number[] {
  const active = groups.map((g) => (g.length > 0 ? g.reduce((s, e) => s + e.weight, 0) : 0));
  const totalWeight = active.reduce((s, w) => s + w, 0);
  if (totalWeight === 0) return groups.map(() => 0);
  const raw = active.map((w) => (w === 0 ? 0 : Math.max(1, Math.round((total * w) / totalWeight))));
  // اصلاح گرد کردن تا مجموع دقیقاً برابر total (یا حداقل تعداد گروه‌های فعال) بماند
  let diff = total - raw.reduce((s, n) => s + n, 0);
  let idx = 0;
  while (diff !== 0 && raw.some((n) => n > 0)) {
    while (raw[idx % raw.length] === 0) idx++;
    raw[idx % raw.length] += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
    idx++;
    if (raw.every((n) => n <= 1) && diff !== 0) break; // از رفتن به صفر یا منفی جلوگیری می‌کند
  }
  return raw.map((n) => Math.max(0, n));
}

function filterByOverride(entries: WeightedPath[], overridePaths: string[] | null): WeightedPath[] {
  if (!overridePaths) return entries;
  return entries.filter((e) => overridePaths.includes(e.path));
}

// ---------- اجرای یک گروه autocannon و جمع‌آوری لتنسی‌های خام ----------
interface GroupResult {
  name: string;
  kind: Kind;
  connections: number;
  paths: string[];
  requestsTotal: number;
  durationSec: number;
  requestsPerSec: number;
  p50: number;
  p95: number;
  p99: number;
  non2xx: number;
  connErrors: number;
  errorRate: number;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[idx];
}

async function runGroup(
  name: string,
  kind: Kind,
  base: string,
  entries: WeightedPath[],
  connections: number,
  duration: number,
  cookies: string[] | null
): Promise<GroupResult | null> {
  if (entries.length === 0 || connections <= 0) return null;
  const uniquePaths = [...new Set(entries.map((e) => e.path))];
  const requestPaths = expandWeighted(entries);
  const latencies: number[] = [];
  const statusCodes: number[] = [];

  let cookieIdx = 0;
  const useAuth = !!cookies && cookies.length > 0;

  const opts: autocannon.Options = {
    url: base,
    connections,
    duration,
    requests: requestPaths.map((p) => {
      const req: autocannon.Request = { path: p };
      if (useAuth) {
        req.setupRequest = (request) => {
          request.headers = { ...request.headers, Cookie: cookies![cookieIdx++ % cookies!.length] };
          return request;
        };
      }
      return req;
    }),
  };

  const result = await new Promise<autocannon.Result>((resolve, reject) => {
    const instance = autocannon(opts, (err, res) => (err ? reject(err) : resolve(res)));
    instance.on("response", (_client, statusCode, _resBytes, responseTime) => {
      latencies.push(responseTime);
      statusCodes.push(statusCode);
    });
  });

  latencies.sort((x, y) => x - y);
  const non2xx = statusCodes.filter((c) => c < 200 || c >= 300).length;
  const connErrors = result.errors + result.timeouts;
  const attempted = latencies.length + connErrors;
  const errorRate = attempted === 0 ? 0 : (non2xx + connErrors) / attempted;

  return {
    name,
    kind,
    connections,
    paths: uniquePaths,
    requestsTotal: latencies.length,
    durationSec: result.duration,
    requestsPerSec: result.duration > 0 ? latencies.length / result.duration : 0,
    p50: quantile(latencies, 0.5),
    p95: quantile(latencies, 0.95),
    p99: quantile(latencies, 0.99),
    non2xx,
    connErrors,
    errorRate,
  };
}

async function runPublicScenario(base: string, connections: number, duration: number, overridePaths: string[] | null): Promise<GroupResult[]> {
  const pages = filterByOverride(
    PUBLIC_MIX.filter((e) => e.kind === "page"),
    overridePaths
  );
  const apis = filterByOverride(
    PUBLIC_MIX.filter((e) => e.kind === "api"),
    overridePaths
  );
  const [cPages, cApis] = splitConnections(connections, [pages, apis]);
  const [pagesRes, apisRes] = await Promise.all([
    runGroup("public-pages", "page", base, pages, cPages, duration, null),
    runGroup("public-apis", "api", base, apis, cApis, duration, null),
  ]);
  return [pagesRes, apisRes].filter((g): g is GroupResult => g !== null);
}

async function runAuthScenario(base: string, connections: number, duration: number, cookies: string[]): Promise<GroupResult[]> {
  const pages = AUTH_MIX.filter((e) => e.kind === "page");
  const apis = AUTH_MIX.filter((e) => e.kind === "api");
  const [cPages, cApis] = splitConnections(connections, [pages, apis]);
  const [pagesRes, apisRes] = await Promise.all([
    runGroup("auth-pages", "page", base, pages, cPages, duration, cookies),
    runGroup("auth-apis", "api", base, apis, cApis, duration, cookies),
  ]);
  return [pagesRes, apisRes].filter((g): g is GroupResult => g !== null);
}

// ---------- سناریوی SSE ----------
interface SseStats {
  attempted: number;
  established: number;
  errors: number;
  durationSec: number;
  firstEventLatencies: number[]; // میلی‌ثانیه
  eventsPerConnection: number[];
}

async function runOneSse(base: string, cookie: string, durationSec: number, stats: SseStats) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), durationSec * 1000);
  const start = Date.now();
  let firstEventAt: number | null = null;
  let eventCount = 0;
  try {
    const res = await fetch(new URL("/api/auction/stream", base), {
      headers: { Cookie: cookie, Accept: "text/event-stream" },
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      stats.errors++;
      return;
    }
    stats.established++;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // پیام‌های SSE با یک خط خالی از هم جدا می‌شوند (شامل کامنت‌های heartbeat/connected)
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        if (part.trim().length === 0) continue;
        if (firstEventAt === null) firstEventAt = Date.now();
        eventCount++;
      }
    }
  } catch {
    if (!controller.signal.aborted) stats.errors++;
  } finally {
    clearTimeout(timer);
    if (firstEventAt !== null) stats.firstEventLatencies.push(firstEventAt - start);
    stats.eventsPerConnection.push(eventCount);
  }
}

async function runSseScenario(base: string, cookies: string[], count: number, durationSec: number): Promise<SseStats> {
  const stats: SseStats = { attempted: count, established: 0, errors: 0, durationSec, firstEventLatencies: [], eventsPerConnection: [] };
  await Promise.all(Array.from({ length: count }, (_, i) => runOneSse(base, cookies[i % cookies.length], durationSec, stats)));
  return stats;
}

// ---------- خروجی ----------
function fmtMs(n: number) {
  return `${n.toFixed(0)}ms`;
}
function fmtPct(n: number) {
  return `${(n * 100).toFixed(2)}%`;
}

function groupPass(g: GroupResult, th: Thresholds): boolean {
  const p95Limit = g.kind === "api" ? th.apiP95Ms : th.pageP95Ms;
  return g.p95 <= p95Limit && g.errorRate <= th.errorRateMax;
}

function printReport(
  args: Args,
  groups: GroupResult[],
  sse: SseStats | null
): { pass: boolean } {
  const th = args.thresholds;
  console.log("\n=================================================================");
  console.log(`گزارش تست‌بار — ${args.base} — سناریو: ${args.scenario}`);
  console.log(`Load test report — ${args.base} — scenario: ${args.scenario}`);
  console.log("=================================================================\n");

  console.log("گروه/Group        | نوع/Kind | اتصال/Conn | req/s  | p50    | p95    | p99    | non-2xx | خطا/err% | نتیجه/Result");
  console.log("-".repeat(115));
  let allPass = true;
  for (const g of groups) {
    const ok = groupPass(g, th);
    if (!ok) allPass = false;
    console.log(
      `${g.name.padEnd(18)} | ${g.kind.padEnd(8)} | ${String(g.connections).padEnd(10)} | ${g.requestsPerSec.toFixed(1).padEnd(6)} | ` +
        `${fmtMs(g.p50).padEnd(6)} | ${fmtMs(g.p95).padEnd(6)} | ${fmtMs(g.p99).padEnd(6)} | ${String(g.non2xx).padEnd(7)} | ` +
        `${fmtPct(g.errorRate).padEnd(8)} | ${ok ? "PASS" : "FAIL"}`
    );
  }

  if (sse) {
    const establishedRate = sse.attempted === 0 ? 0 : sse.established / sse.attempted;
    const sorted = [...sse.firstEventLatencies].sort((a, b) => a - b);
    const p50 = quantile(sorted, 0.5);
    const p95 = quantile(sorted, 0.95);
    const perMinRates = sse.eventsPerConnection.map((n) => n / (sse.durationSec / 60));
    const avgPerMin = perMinRates.length ? perMinRates.reduce((a, b) => a + b, 0) / perMinRates.length : 0;
    const sseOk = establishedRate >= th.sseEstablishedMin;
    if (!sseOk) allPass = false;

    console.log("\n--- SSE (/api/auction/stream) ---");
    console.log(`تلاش/Attempted: ${sse.attempted}   برقرارشده/Established: ${sse.established} (${fmtPct(establishedRate)})   خطا/Errors: ${sse.errors}`);
    console.log(`لتنسی اولین رویداد/First-event latency — p50: ${fmtMs(p50)}   p95: ${fmtMs(p95)}`);
    console.log(`میانگین رویداد در دقیقه هر اتصال/Avg events per connection per minute: ${avgPerMin.toFixed(2)}`);
    console.log(`آستانهٔ برقراری/Established threshold: ${fmtPct(th.sseEstablishedMin)} → ${sseOk ? "PASS" : "FAIL"}`);
  }

  console.log("\nآستانه‌ها/Thresholds:");
  console.log(
    `  API p95 < ${th.apiP95Ms}ms، صفحه/Page p95 < ${th.pageP95Ms}ms، نرخ خطا/Error rate < ${fmtPct(th.errorRateMax)}، ` +
      `SSE established ≥ ${fmtPct(th.sseEstablishedMin)}`
  );
  console.log(`\nنتیجهٔ کلی/Overall result: ${allPass ? "PASS" : "FAIL"}`);
  console.log("=================================================================\n");

  return { pass: allPass };
}

function writeReport(args: Args, groups: GroupResult[], sse: SseStats | null, pass: boolean) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.resolve(`loadtest-report-${ts}.json`);
  const report = {
    generatedAt: new Date().toISOString(),
    base: args.base,
    scenario: args.scenario,
    duration: args.duration,
    connections: args.connections,
    thresholds: args.thresholds,
    groups,
    sse: sse
      ? {
          ...sse,
          firstEventLatencySorted: undefined,
        }
      : null,
    pass,
  };
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
  console.log(`گزارش JSON نوشته شد/JSON report written: ${outPath}`);
  console.log("(این فایل را کامیت نکنید — به .gitignore اضافه شده در docs/loadtest.md توضیح داده شده)");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const needsCookies = args.scenario === "auth" || args.scenario === "sse" || args.scenario === "all";
  const cookies = args.cookiesFile ? loadCookies(args.cookiesFile) : null;
  if (needsCookies && (!cookies || cookies.length === 0)) {
    throw new Error(
      `سناریوی «${args.scenario}» به --cookies file.json نیاز دارد (خروجی scripts/lib/loadtest-users.ts).`
    );
  }

  const groups: GroupResult[] = [];
  let sse: SseStats | null = null;
  const tasks: Promise<void>[] = [];

  if (args.scenario === "public" || args.scenario === "all") {
    tasks.push(
      runPublicScenario(args.base, args.connections, args.duration, args.paths).then((gs) => {
        groups.push(...gs);
      })
    );
  }
  if (args.scenario === "auth" || args.scenario === "all") {
    tasks.push(
      runAuthScenario(args.base, args.connections, args.duration, cookies!).then((gs) => {
        groups.push(...gs);
      })
    );
  }
  if (args.scenario === "sse") {
    // طبق مشخصات: سناریوی sse باید هم‌زمان با بار public اجرا شود تا fan-out زیر بار سنجیده شود.
    tasks.push(
      runPublicScenario(args.base, args.connections, args.duration, args.paths).then((gs) => {
        groups.push(...gs);
      })
    );
  }
  if (args.scenario === "sse" || args.scenario === "all") {
    tasks.push(
      runSseScenario(args.base, cookies!, args.sse, args.duration).then((s) => {
        sse = s;
      })
    );
  }

  await Promise.all(tasks);

  const { pass } = printReport(args, groups, sse);
  writeReport(args, groups, sse, pass);
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error("خطا:", e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
