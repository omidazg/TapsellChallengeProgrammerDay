import { TEST_PHONE_RE } from "./phone";

/**
 * لایهٔ ارسال پیامک.
 *
 * درایور با SMS_PROVIDER انتخاب می‌شود:
 *   - "console": پیامک فرستاده نمی‌شود و فقط در لاگ سرور می‌آید (پیش‌فرض محیط توسعه)
 *   - خالی در production: ورود با پیامک غیرفعال است
 * درایور سرویس پیامک واقعی بعد از رسیدن مستندات سرویس به PROVIDERS اضافه می‌شود.
 */
export type SmsProvider = {
  name: string;
  /** true یعنی پیامک واقعاً به گوشی کاربر می‌رود */
  real: boolean;
  send(phone: string, text: string): Promise<void>;
};

const consoleProvider: SmsProvider = {
  name: "console",
  real: false,
  async send(phone, text) {
    console.log(`[sms:console] to=${phone} text=${JSON.stringify(text)}`);
  },
};

const PROVIDERS: Record<string, SmsProvider> = {
  console: consoleProvider,
};

function providerName() {
  const configured = (process.env.SMS_PROVIDER ?? "").trim().toLowerCase();
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? "" : "console";
}

export function smsProvider(): SmsProvider | null {
  return PROVIDERS[providerName()] ?? null;
}

/** آیا ورود/تأیید با پیامک در این محیط فعال است؟ */
export function smsEnabled() {
  return smsProvider() !== null;
}

/**
 * کد را در پاسخ هم برگردانیم؟ فقط وقتی پیامک واقعی نمی‌رود (درایور console یا شمارهٔ آزمایشی)
 * و محیط توسعه است یا OTP_ECHO=1 صریحاً (مثلاً روی استیجینگ) روشن شده.
 */
export function otpEchoAllowed(phone: string) {
  const provider = smsProvider();
  if (!provider) return false;
  const noRealSms = !provider.real || TEST_PHONE_RE.test(phone);
  return noRealSms && (process.env.NODE_ENV !== "production" || process.env.OTP_ECHO === "1");
}

export async function sendSms(phone: string, text: string) {
  const provider = smsProvider();
  if (!provider) throw new Error("SMS_DISABLED");
  // شماره‌های آزمایشی متعلق به آدم واقعی نیستند؛ هرگز به سرویس واقعی نمی‌روند
  if (TEST_PHONE_RE.test(phone)) return consoleProvider.send(phone, text);
  return provider.send(phone, text);
}
