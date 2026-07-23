"use client";

import * as React from "react";
import { motion } from "framer-motion";

import { CardPreview } from "@/components/card-preview";
import { cardTemplates } from "@/lib/templates";
import { templateFontVariables } from "@/lib/fonts";

const featured = [
  cardTemplates.find((t) => t.id === "bold-geometric")!,
  cardTemplates.find((t) => t.id === "executive-serif")!,
  cardTemplates.find((t) => t.id === "luxury-foil")!,
];

const fanTransforms = [
  { rotate: -8, x: -36, y: 18 },
  { rotate: 0, x: 0, y: 0 },
  { rotate: 8, x: 36, y: 18 },
];

export function HeroShowcase() {
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Reading matchMedia is browser-only, so the initial value has to be
    // applied after mount to keep server and client markup in sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefersReducedMotion(query.matches);
    const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  return (
    <div className={`${templateFontVariables} relative h-72 w-full max-w-md sm:h-80`}>
      {featured.map((template, i) => {
        const fan = fanTransforms[i];
        return (
          <motion.div
            key={template.id}
            className="absolute inset-x-6 top-0 origin-bottom sm:inset-x-10"
            style={{ zIndex: i === 1 ? 3 : 1 }}
            initial={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 60, rotate: 0, scale: 0.9 }
            }
            animate={{
              opacity: 1,
              y: fan.y,
              x: fan.x,
              rotate: fan.rotate,
              scale: 1,
            }}
            whileHover={{ y: fan.y - 14, rotate: 0, zIndex: 10, scale: 1.04 }}
            transition={{
              duration: 0.7,
              delay: i * 0.12,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <CardPreview template={template} interactive={false} className="shadow-2xl" />
          </motion.div>
        );
      })}
    </div>
  );
}
