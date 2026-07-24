"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { QrCode, Mail, Phone } from "lucide-react";

/**
 * Motion with a purpose (§3): the hero card visually *assembles itself* —
 * elements fly in one by one — to explain what the product does, not just to
 * decorate. Respects prefers-reduced-motion via the global CSS reset.
 */
export function HeroCard() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <motion.div
        initial={{ opacity: 0, rotateX: 12, y: 30 }}
        animate={{ opacity: 1, rotateX: 0, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative aspect-[85.6/53.98] w-full rounded-2xl bg-gradient-to-br from-primary to-[hsl(232_60%_32%)] p-6 text-primary-foreground shadow-2xl"
        style={{ transformPerspective: 1000 }}
      >
        <Fly delay={0.3}>
          <div className="size-12 rounded-full bg-accent/90" />
        </Fly>
        <Fly delay={0.45}>
          <div className="mt-4 font-display text-2xl font-semibold">Jordan Avery</div>
        </Fly>
        <Fly delay={0.6}>
          <div className="text-sm text-primary-foreground/70">
            Product Designer · Northwind Studio
          </div>
        </Fly>
        <div className="absolute bottom-6 left-6 space-y-1.5 text-xs text-primary-foreground/80">
          <Fly delay={0.75}>
            <span className="flex items-center gap-2">
              <Mail className="size-3" /> jordan@northwind.studio
            </span>
          </Fly>
          <Fly delay={0.85}>
            <span className="flex items-center gap-2">
              <Phone className="size-3" /> +1 (415) 555-0142
            </span>
          </Fly>
        </div>
        <Fly delay={1}>
          <div className="absolute bottom-6 right-6 grid size-16 place-items-center rounded-lg bg-primary-foreground text-primary">
            <QrCode className="size-10" />
          </div>
        </Fly>
      </motion.div>

      {/* Floating "scan me" chip */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1.2, duration: 0.5 }}
        className="absolute -bottom-4 -right-3 rounded-full border border-border bg-background px-4 py-2 text-xs font-medium text-foreground shadow-lg"
      >
        📱 Scan to save contact
      </motion.div>
    </div>
  );
}

function Fly({ children, delay }: { children: React.ReactNode; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.5, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
