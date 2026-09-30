import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "tapsell.com" },
    ],
  },
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
  poweredByHeader: false,
  // هدرهای امنیتی پایه برای وقتی که اپ مستقیم (بدون Caddy) سرو می‌شود — مثل staging روی پورت 8080.
  // در تولید Caddy همین‌ها (به‌علاوهٔ CSP کامل) را بازنویسی می‌کند. CSP اینجا عمداً نیست تا HMR توسعه نشکند.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
