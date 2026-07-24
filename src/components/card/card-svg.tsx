"use client";

import * as React from "react";
import { renderCardSvg } from "@/lib/render-svg";
import { qrToDataUrl } from "@/lib/qr";
import type { CardDocument } from "@/lib/card-model";
import { cn } from "@/lib/utils";

/**
 * Renders a CardDocument to inline SVG for on-screen display. Uses the exact same
 * vector renderer as the export engine, so what you see is what you export.
 * QR elements are resolved to data URLs that encode the card's public URL.
 */
export function CardSvg({
  doc,
  cardUrl,
  transparent = false,
  className,
}: {
  doc: CardDocument;
  cardUrl: string;
  transparent?: boolean;
  className?: string;
}) {
  const [svg, setSvg] = React.useState<string>(() =>
    renderCardSvg(doc, { transparent })
  );

  React.useEffect(() => {
    let cancelled = false;
    async function build() {
      const qrHrefs: Record<string, string> = {};
      for (const el of doc.elements) {
        if (el.type === "qr") {
          qrHrefs[el.id] = await qrToDataUrl(cardUrl, {
            color: el.color,
            background: el.background,
          });
        }
      }
      if (!cancelled) setSvg(renderCardSvg(doc, { transparent, qrHrefs }));
    }
    build();
    return () => {
      cancelled = true;
    };
  }, [doc, cardUrl, transparent]);

  return (
    <div
      className={cn("card-svg-host aspect-[85.6/53.98] w-full overflow-hidden", className)}
      // The SVG is generated from our own trusted model, not user HTML.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
