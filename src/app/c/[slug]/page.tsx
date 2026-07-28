import type { Metadata } from "next";
import Link from "next/link";
import { getCard } from "@/lib/store";
import { DigitalCard } from "@/components/card/digital-card";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const card = await getCard(slug);
  if (!card) return { title: "Card not found — CardStudio" };
  const { name, title, company } = card.doc.contact;
  return {
    title: `${name || "Digital card"} — CardStudio`,
    description: [title, company].filter(Boolean).join(" · ") || "Digital business card",
  };
}

export default async function CardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const card = await getCard(slug);

  if (!card) {
    return (
      <div className="container py-24 text-center">
        <h1 className="font-display text-3xl font-semibold">Card not found</h1>
        <p className="mt-3 text-muted-foreground">
          This digital card doesn&rsquo;t exist yet, or hasn&rsquo;t been published.
        </p>
        <Link href="/templates" className="mt-6 inline-block font-medium text-accent hover:underline">
          Design your own →
        </Link>
      </div>
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return <DigitalCard doc={card.doc} cardUrl={`${appUrl}/c/${slug}`} />;
}
