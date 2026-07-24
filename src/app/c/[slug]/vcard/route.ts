import { getCard } from "@/lib/store";
import { buildVCard } from "@/lib/vcard";

export const runtime = "nodejs";

/**
 * "Save to Contacts" (Build Spec §4.6 / §9 Phase-5 DoD): serves a working
 * vCard 3.0 (.vcf) the phone's native contacts app accepts. The photo is
 * referenced by URL, never base64-embedded (§7).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const card = await getCard(slug);
  if (!card) {
    return new Response("Card not found", { status: 404 });
  }

  const { doc } = card;
  const photo = doc.elements.find((el) => el.type === "photo");
  const photoUrl =
    photo && "src" in photo && typeof photo.src === "string" && photo.src.startsWith("http")
      ? photo.src
      : undefined;

  const vcf = buildVCard({
    contact: doc.contact,
    links: doc.links,
    linkedInUrl: doc.linkedInUrl,
    photoUrl,
  });

  const filename = `${(doc.contact.name || "contact").replace(/[^a-z0-9]+/gi, "-")}.vcf`;
  return new Response(vcf, {
    headers: {
      "content-type": "text/vcard; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
