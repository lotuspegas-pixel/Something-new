/**
 * Hand-rolled vCard 3.0 generator (RFC 2426) — Build Spec §2, §4.6.
 *
 * Deliberately small and dependency-free. The photo is referenced by URL, never
 * embedded as base64: an inline photo bloats the .vcf and (per §4.6/§7) the photo
 * must never be embedded in a QR-encoded vCard. Here the QR encodes the card URL,
 * and this .vcf is served from the "Save to Contacts" button on the hosted page.
 */

import type { CardContact, CardLink } from "./card-model";

/** Escape a value per RFC 2426 §5 (backslash, comma, semicolon, newline). */
function escapeValue(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** Fold long lines at 75 octets per RFC 2426 §2.6. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  chunks.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 74) {
    chunks.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length) chunks.push(" " + rest);
  return chunks.join("\r\n");
}

export interface VCardInput {
  contact: CardContact;
  links?: CardLink[];
  linkedInUrl?: string;
  /** Absolute URL to the re-hosted photo (never base64-embedded). */
  photoUrl?: string;
}

export function buildVCard({
  contact,
  links = [],
  linkedInUrl,
  photoUrl,
}: VCardInput): string {
  const lines: string[] = ["BEGIN:VCARD", "VERSION:3.0"];

  const name = contact.name?.trim() || "Contact";
  const parts = name.split(/\s+/);
  const family = parts.length > 1 ? parts.slice(1).join(" ") : "";
  const given = parts[0] ?? "";

  lines.push(`N:${escapeValue(family)};${escapeValue(given)};;;`);
  lines.push(`FN:${escapeValue(name)}`);

  if (contact.company) lines.push(`ORG:${escapeValue(contact.company)}`);
  if (contact.title) lines.push(`TITLE:${escapeValue(contact.title)}`);
  if (contact.email)
    lines.push(`EMAIL;TYPE=INTERNET,PREF:${escapeValue(contact.email)}`);
  if (contact.phone) lines.push(`TEL;TYPE=CELL:${escapeValue(contact.phone)}`);
  if (contact.website)
    lines.push(`URL:${escapeValue(normalizeUrl(contact.website))}`);
  if (linkedInUrl) lines.push(`URL;TYPE=LinkedIn:${escapeValue(linkedInUrl)}`);
  for (const link of links) {
    lines.push(`URL;TYPE=${escapeValue(link.label)}:${escapeValue(normalizeUrl(link.url))}`);
  }
  // Reference the photo by URL — do NOT inline base64 (§4.6).
  if (photoUrl) lines.push(`PHOTO;VALUE=URI:${escapeValue(photoUrl)}`);
  if (contact.tagline) lines.push(`NOTE:${escapeValue(contact.tagline)}`);

  lines.push("END:VCARD");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export function normalizeUrl(url: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}
