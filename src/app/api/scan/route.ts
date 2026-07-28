import { NextResponse } from "next/server";
import { logScan } from "@/lib/store";

export const runtime = "nodejs";

/**
 * Lightweight, privacy-conscious scan logging (Build Spec §4.7).
 * Stores only a timestamp, referrer, and a coarse country/region — never a
 * precise location or any PII. Fired from the hosted card page on view.
 */
export async function POST(req: Request) {
  try {
    const { slug } = (await req.json()) as { slug: string };
    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });

    // Coarse location only, from CDN geo headers when present.
    const country =
      req.headers.get("x-vercel-ip-country") ||
      req.headers.get("cf-ipcountry") ||
      null;
    const region = req.headers.get("x-vercel-ip-country-region") || null;
    const roughLocation = [region, country].filter(Boolean).join(", ") || null;

    await logScan({
      cardSlug: slug,
      timestamp: Date.now(),
      referrer: req.headers.get("referer"),
      roughLocation,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Scan log failed" }, { status: 500 });
  }
}
