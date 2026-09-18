import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "میدان بنیان‌گذاران تپسل",
    short_name: "میدان بنیان‌گذاران",
    description: "بازار استارتاپی چهارروزهٔ روز برنامه‌نویس تپسل: ایده بده، سرمایه جذب کن، بساز، بفروش.",
    start_url: "/",
    display: "standalone",
    dir: "rtl",
    lang: "fa",
    background_color: "#ffffff",
    theme_color: "#002d47",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
