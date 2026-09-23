/**
 * لاگ ساختاریافته: هر خط یک JSON با فیلدهای ثابت (ts, level, event, ...) روی stdout/stderr
 * چاپ می‌شود. برای تجمیع لاگ در Docker/Caddy مناسب است (هر خط قابل parse جداگانه).
 */

type Fields = Record<string, unknown>;

function serializeError(err: unknown): Fields {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack, name: err.name };
  }
  return { message: String(err) };
}

function write(level: "info" | "warn" | "error", event: string, fields?: Fields) {
  const line: Fields = { ts: new Date().toISOString(), level, event, ...fields };
  const json = JSON.stringify(line);
  if (level === "error") console.error(json);
  else if (level === "warn") console.warn(json);
  else console.log(json);
}

/** فیلدهای دلخواه؛ اگر `error` در fields باشد و instanceof Error باشد، به message/stack تبدیل می‌شود. */
function normalize(fields?: Fields): Fields | undefined {
  if (!fields) return fields;
  if ("error" in fields && fields.error instanceof Error) {
    return { ...fields, error: serializeError(fields.error) };
  }
  return fields;
}

export const log = {
  info(event: string, fields?: Fields) {
    write("info", event, normalize(fields));
  },
  warn(event: string, fields?: Fields) {
    write("warn", event, normalize(fields));
  },
  error(event: string, fields?: Fields) {
    write("error", event, normalize(fields));
  },
};
