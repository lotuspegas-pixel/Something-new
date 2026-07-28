import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-border/60 border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground">
          &copy; {new Date().getFullYear()} Card Studio. Made for people who hand out cards.
        </p>
        <nav aria-label="Footer" className="flex gap-6">
          <Link href="/templates" className="text-muted-foreground hover:text-foreground transition-colors">
            Templates
          </Link>
          <Link href="/#pricing" className="text-muted-foreground hover:text-foreground transition-colors">
            Pricing
          </Link>
          <Link href="/#how-it-works" className="text-muted-foreground hover:text-foreground transition-colors">
            How it works
          </Link>
        </nav>
      </div>
    </footer>
  );
}
