import { NextResponse } from "next/server";
import { saveCard } from "@/lib/store";
import type { CardDocument } from "@/lib/card-model";

export const runtime = "nodejs";

/** Publish a card to the server store so its /c/[slug] page is shareable. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { doc: CardDocument };
    if (!body?.doc?.slug) {
      return NextResponse.json({ error: "Missing card document" }, { status: 400 });
    }
    await saveCard(body.doc);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
    return NextResponse.json({ ok: true, url: `${appUrl}/c/${body.doc.slug}` });
  } catch (err) {
    console.error("Publish failed", err);
    return NextResponse.json({ error: "Publish failed" }, { status: 500 });
  }
}
