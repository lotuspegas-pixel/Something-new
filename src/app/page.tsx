import Link from "next/link";
import { ArrowRight, QrCode, Linkedin, Download, Palette, Check } from "lucide-react";
import { TemplateGallery } from "@/components/marketing/template-gallery";
import { HeroCard } from "@/components/marketing/hero-card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function HomePage() {
  return (
    <main>
      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-grid opacity-70" />
        <div className="container grid items-center gap-12 py-20 lg:grid-cols-2 lg:py-28">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-accent" />
              A card that hands out itself
            </span>
            <h1 className="mt-6 font-display text-5xl font-semibold leading-[1.05] tracking-tight text-balance sm:text-6xl">
              Design a card.
              <br />
              Share it as a{" "}
              <span className="relative whitespace-nowrap text-accent">
                living QR.
              </span>
            </h1>
            <p className="mt-6 max-w-md text-lg text-muted-foreground text-balance">
              Start from a designer template, auto-fill your name and photo from
              LinkedIn, and export a print-ready card — while every card also
              becomes a scannable digital card that saves straight to contacts.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/templates" className={cn(buttonVariants({ size: "lg" }))}>
                Browse templates <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/editor/new?template=ink-minimal"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
              >
                Open the editor
              </Link>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Unlimited digital cards on the free tier. No credit card.
            </p>
          </div>

          <div className="relative">
            <HeroCard />
          </div>
        </div>
      </section>

      {/* ---------- Template gallery (the homepage hero, §3) ---------- */}
      <section id="templates" className="border-t border-border/60 py-20">
        <div className="container">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="font-display text-3xl font-semibold sm:text-4xl">
              Templates that already look finished
            </h2>
            <p className="mt-3 text-muted-foreground">
              Each one ships with a coordinated font pairing chosen for print
              legibility. Hover to lift, click to start editing.
            </p>
          </div>
          <TemplateGallery />
        </div>
      </section>

      {/* ---------- Feature walkthrough ---------- */}
      <section id="features" className="border-t border-border/60 bg-muted/30 py-20">
        <div className="container">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <h2 className="font-display text-3xl font-semibold sm:text-4xl">
              Four steps, start to shared
            </h2>
          </div>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f, i) => (
              <div key={f.title} className="relative">
                <div className="mb-4 grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground">
                  <f.icon className="size-5" />
                </div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">
                  Step {i + 1}
                </div>
                <h3 className="font-display text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Pricing ---------- */}
      <section id="pricing" className="border-t border-border/60 py-20">
        <div className="container">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <h2 className="font-display text-3xl font-semibold sm:text-4xl">
              A genuinely generous free tier
            </h2>
            <p className="mt-3 text-muted-foreground">
              We monetize teams, Wallet passes and CRM sync — not your contact
              limit or your analytics.
            </p>
          </div>
          <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-3">
            {PLANS.map((p) => (
              <div
                key={p.name}
                className={cn(
                  "flex flex-col rounded-2xl border p-6",
                  p.featured
                    ? "border-accent bg-card shadow-xl ring-1 ring-accent/30"
                    : "border-border bg-card"
                )}
              >
                <h3 className="font-display text-xl font-semibold">{p.name}</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold">{p.price}</span>
                  {p.per && <span className="text-sm text-muted-foreground">{p.per}</span>}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{p.tagline}</p>
                <ul className="mt-6 space-y-2 text-sm">
                  {p.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-accent" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/templates"
                  className={cn(
                    buttonVariants({ variant: p.featured ? "accent" : "outline" }),
                    "mt-6 w-full"
                  )}
                >
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60 py-10">
        <div className="container flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} CardStudio. Built for professionals.</p>
          <p>LinkedIn sign-in uses OpenID Connect — we never scrape profiles.</p>
        </div>
      </footer>
    </main>
  );
}

const FEATURES = [
  { icon: Palette, title: "Design", body: "Drag, type and recolor every element on a real vector canvas." },
  { icon: Linkedin, title: "Auto-fill", body: "Sign in with LinkedIn to pull your name and photo in one tap." },
  { icon: Download, title: "Export", body: "Print-ready vector PDF, transparent PNG, and editable SVG." },
  { icon: QrCode, title: "Share", body: "A QR opens your live card and saves you to contacts instantly." },
];

const PLANS = [
  {
    name: "Free",
    price: "$0",
    per: "forever",
    tagline: "Everything one professional needs.",
    features: [
      "Unlimited digital cards",
      "All templates & the full editor",
      "PNG / SVG / vector PDF export",
      "QR code + Save to Contacts",
      "Basic scan analytics",
    ],
    cta: "Start free",
    featured: true,
  },
  {
    name: "Pro",
    price: "$8",
    per: "/mo",
    tagline: "For power networkers.",
    features: [
      "Everything in Free",
      "Apple & Google Wallet passes",
      "Lead-capture forms",
      "AI card & badge scanner",
      "Full analytics dashboard",
    ],
    cta: "Go Pro",
    featured: false,
  },
  {
    name: "Team",
    price: "Custom",
    per: "",
    tagline: "Brand-locked cards for a whole team.",
    features: [
      "Shared, brand-locked templates",
      "CSV bulk provisioning",
      "Per-rep scan analytics",
      "CRM sync (HubSpot / Salesforce)",
      "SSO & priority support",
    ],
    cta: "Talk to us",
    featured: false,
  },
];
