import type { Metadata } from "next";
import { HallClient } from "./HallClient";

// نمای سالن: صفحهٔ عمومی پروژکتور، بدون نیاز به ورود.
export const metadata: Metadata = { title: "نمای سالن" };
export const dynamic = "force-dynamic";

export default function HallPage() {
  return <HallClient />;
}
