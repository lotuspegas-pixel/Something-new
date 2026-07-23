import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { HeroShowcase } from "@/components/hero-showcase";
import { FeatureWalkthrough } from "@/components/feature-walkthrough";
import { Reveal } from "@/components/reveal";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const freeFeatures = [
  "Unlimited digital business cards",
  "QR code + hosted card page for every card",
  "Save-to-contacts vCard download",
  "LinkedIn auto-fill for name and photo",
  "PNG, vector PDF, and SVG export",
  "Basic scan analytics",
];

const teamFeatures = [
  "Shared, brand-locked templates",
  "Bulk provisioning via CSV import",
  "Per-rep scan analytics",
  "Apple & Google Wallet passes",
  "Lead-capture form + CRM sync",
  "Priority support",
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto flex max-w-6xl flex-col items-center gap-12 px-6 pt-16 pb-24 sm:pt-24 lg:flex-row lg:items-center lg:pt-28">
          <div className="flex max-w-xl flex-col gap-6 text-center lg:text-left">
            <Badge variant="secondary" className="mx-auto w-fit lg:mx-0">
              Design → LinkedIn auto-fill → Export → QR
            </Badge>
            <h1 className="font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Your business card, but it never runs out.
            </h1>
            <p className="text-muted-foreground text-lg text-balance">
              Design a print-ready card in minutes, auto-fill your name and photo from
              LinkedIn, and hand out a QR code that opens your full card on any phone —
              no app, no reprint, ever.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Button asChild size="lg" variant="accent">
                <Link href="/templates">
                  Browse templates
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="#how-it-works">See how it works</Link>
              </Button>
            </div>
          </div>
          <div className="flex w-full justify-center lg:justify-end">
            <HeroShowcase />
          </div>
        </section>

        {/* Feature walkthrough */}
        <section id="how-it-works" className="border-border/60 border-t">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <Reveal className="mx-auto max-w-2xl text-center">
              <h2 className="font-display text-3xl sm:text-4xl">
                From template to tap-to-save
              </h2>
              <p className="text-muted-foreground mt-3 text-base">
                Four steps take you from a blank template to a card that shares itself.
              </p>
            </Reveal>
            <div className="mt-12">
              <FeatureWalkthrough />
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="border-border/60 border-t">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <Reveal className="mx-auto max-w-2xl text-center">
              <h2 className="font-display text-3xl sm:text-4xl">Start free. Stay free.</h2>
              <p className="text-muted-foreground mt-3 text-base">
                Unlimited digital cards and analytics on the free tier — pay only when a
                team needs shared branding, Wallet passes, or CRM sync.
              </p>
            </Reveal>
            <div className="mx-auto mt-12 grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
              <Reveal>
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>Free</CardTitle>
                    <CardDescription>For individuals and freelancers.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="flex flex-col gap-2.5 text-sm">
                      {freeFeatures.map((f) => (
                        <li key={f} className="flex items-start gap-2">
                          <Check
                            aria-hidden="true"
                            className="text-primary mt-0.5 h-4 w-4 shrink-0"
                          />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    <Button asChild className="w-full">
                      <Link href="/templates">Get started free</Link>
                    </Button>
                  </CardFooter>
                </Card>
              </Reveal>
              <Reveal delay={0.1}>
                <Card className="border-accent/60 h-full">
                  <CardHeader>
                    <CardTitle>Team</CardTitle>
                    <CardDescription>For sales and enterprise teams.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="flex flex-col gap-2.5 text-sm">
                      {teamFeatures.map((f) => (
                        <li key={f} className="flex items-start gap-2">
                          <Check
                            aria-hidden="true"
                            className="text-primary mt-0.5 h-4 w-4 shrink-0"
                          />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled
                      title="Team billing lands in a later phase"
                    >
                      Contact sales
                    </Button>
                  </CardFooter>
                </Card>
              </Reveal>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
