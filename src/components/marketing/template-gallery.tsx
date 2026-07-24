"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { TEMPLATES, instantiateTemplate, type Template } from "@/lib/templates";
import { CardSvg } from "@/components/card/card-svg";
import type { CardDocument } from "@/lib/card-model";
import { cn } from "@/lib/utils";

const CATEGORIES = ["All", "Minimal", "Corporate", "Creative", "Bold"] as const;

export function TemplateGallery({ compact = false }: { compact?: boolean }) {
  const [filter, setFilter] = React.useState<(typeof CATEGORIES)[number]>("All");

  // Build sample documents once so previews are stable.
  const docs = React.useMemo(() => {
    const map = new Map<string, CardDocument>();
    for (const t of TEMPLATES) map.set(t.id, instantiateTemplate(t.id));
    return map;
  }, []);

  const shown = TEMPLATES.filter((t) => filter === "All" || t.category === filter);

  return (
    <div>
      {!compact && (
        <div className="mb-8 flex flex-wrap items-center justify-center gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm transition-colors",
                filter === c
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((t, i) => (
          <TemplatePreviewCard key={t.id} template={t} doc={docs.get(t.id)!} index={i} />
        ))}
      </div>
    </div>
  );
}

function TemplatePreviewCard({
  template,
  doc,
  index,
}: {
  template: Template;
  doc: CardDocument;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay: (index % 3) * 0.08 }}
      className="group relative"
    >
      <Link
        href={`/editor/new?template=${template.id}`}
        className="block focus-visible:outline-none"
        aria-label={`Edit the ${template.name} template`}
      >
        <div className="relative overflow-hidden rounded-2xl border border-border bg-muted/40 p-5 shadow-sm transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl">
          <div className="rounded-xl shadow-lg ring-1 ring-black/5 transition-transform duration-500 group-hover:scale-[1.03]">
            <CardSvg
              doc={doc}
              cardUrl="https://cardstudio.app/c/preview"
              className="rounded-xl"
            />
          </div>
          <div className="mt-5 flex items-start justify-between">
            <div>
              <h3 className="font-display text-lg font-semibold">{template.name}</h3>
              <p className="text-sm text-muted-foreground">{template.blurb}</p>
            </div>
            <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-background text-muted-foreground opacity-0 transition-all duration-300 group-hover:opacity-100 group-hover:text-foreground">
              <ArrowUpRight className="size-4" />
            </span>
          </div>
          <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="rounded-full bg-background px-2 py-0.5">{template.category}</span>
            <span>{template.fontPairing}</span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
