import Image from "next/image";
import { isNextImageHost } from "@/lib/idea";

/**
 * جلد ایده.
 *
 * `next/image` فقط میزبان‌های مجاز در `next.config.ts` را می‌پذیرد و برای بقیه
 * هنگام رندر خطا می‌دهد؛ چون نشانی جلد را خود کاربر وارد می‌کند، برای
 * میزبان‌های نامجاز از تگ سادهٔ <img> استفاده می‌کنیم.
 */
export function Cover({ src, alt, sizes = "800px" }: { src: string; alt: string; sizes?: string }) {
  if (!src) return null;
  if (isNextImageHost(src)) {
    return <Image src={src} alt={alt} fill sizes={sizes} className="object-cover" />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className="absolute inset-0 size-full object-cover" loading="lazy" />;
}
