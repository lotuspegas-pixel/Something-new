import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="border-border/60 bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          className="font-display text-lg tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring rounded-sm"
        >
          Card Studio
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-6 text-sm sm:flex">
          <Link
            href="/templates"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Templates
          </Link>
          <Link
            href="/#how-it-works"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            How it works
          </Link>
          <Link
            href="/#pricing"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Pricing
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild size="sm" variant="accent">
            <Link href="/templates">Start designing</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
