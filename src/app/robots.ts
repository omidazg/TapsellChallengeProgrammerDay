import type { MetadataRoute } from "next";

// رویداد داخلی است؛ هیچ موتور جست‌وجویی نباید صفحه‌ها را بخزد.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
