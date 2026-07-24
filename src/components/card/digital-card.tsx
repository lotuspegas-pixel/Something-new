"use client";

import * as React from "react";
import { Linkedin, Globe, Mail, Phone, Download, Link2 } from "lucide-react";
import type { CardDocument } from "@/lib/card-model";
import { CardSvg } from "@/components/card/card-svg";
import { normalizeUrl } from "@/lib/vcard";
import { LANGUAGES, STRINGS, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * The recipient experience (Build Spec §4.7): opens directly in a mobile
 * browser, shows the full card, and offers one-tap Save to Contacts, LinkedIn,
 * and any custom links. Logs a single privacy-conscious scan event on view.
 */
export function DigitalCard({ doc, cardUrl }: { doc: CardDocument; cardUrl: string }) {
  const [lang, setLang] = React.useState<Lang>("en");
  const t = STRINGS[lang];

  // Fire one scan beacon on mount (§4.7).
  React.useEffect(() => {
    const key = `scanned:${doc.slug}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    fetch("/api/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: doc.slug }),
      keepalive: true,
    }).catch(() => {});
  }, [doc.slug]);

  const c = doc.contact;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-10">
      {/* Language switcher */}
      <div className="mb-6 flex justify-end">
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as Lang)}
          aria-label="Display language"
          className="rounded-full border border-border bg-background px-3 py-1 text-xs"
        >
          {Object.entries(LANGUAGES).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Card visual */}
      <div className="overflow-hidden rounded-2xl shadow-xl ring-1 ring-black/10">
        <CardSvg doc={doc} cardUrl={cardUrl} />
      </div>

      {/* Identity */}
      <div className="mt-6 text-center">
        <h1 className="font-display text-2xl font-semibold">{c.name || "Your name"}</h1>
        {(c.title || c.company) && (
          <p className="mt-1 text-muted-foreground">
            {[c.title, c.company].filter(Boolean).join(" · ")}
          </p>
        )}
        {c.tagline && <p className="mt-2 text-sm text-muted-foreground">{c.tagline}</p>}
      </div>

      {/* Primary action */}
      <a
        href={`/c/${doc.slug}/vcard`}
        className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
      >
        <Download className="size-5" /> {t.saveContact}
      </a>
      <p className="mt-2 text-center text-xs text-muted-foreground">{t.savedNote}</p>

      {/* Secondary actions */}
      <div className="mt-6 space-y-2.5">
        {doc.linkedInUrl && (
          <ActionLink href={doc.linkedInUrl} icon={<Linkedin className="size-5 text-[#0a66c2]" />}>
            {t.openLinkedIn}
          </ActionLink>
        )}
        {c.website && (
          <ActionLink href={normalizeUrl(c.website)} icon={<Globe className="size-5" />}>
            {t.visitWebsite}
          </ActionLink>
        )}
        {c.email && (
          <ActionLink href={`mailto:${c.email}`} icon={<Mail className="size-5" />}>
            {c.email}
          </ActionLink>
        )}
        {c.phone && (
          <ActionLink href={`tel:${c.phone}`} icon={<Phone className="size-5" />}>
            {c.phone}
          </ActionLink>
        )}
        {doc.links.map((l) => (
          <ActionLink key={l.id} href={normalizeUrl(l.url)} icon={<Link2 className="size-5" />}>
            {l.label}
          </ActionLink>
        ))}
      </div>

      <footer className="mt-auto pt-10 text-center text-xs text-muted-foreground">
        {t.poweredBy}
      </footer>
    </main>
  );
}

function ActionLink({
  href,
  icon,
  children,
  className,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel="noopener noreferrer"
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium transition-colors hover:bg-muted",
        className
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </a>
  );
}
