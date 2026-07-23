"use client";

import { motion } from "framer-motion";
import { LayoutTemplate, FileOutput, QrCode } from "lucide-react";

import { LinkedinIcon } from "@/components/icons/linkedin-icon";

const steps = [
  {
    icon: LayoutTemplate,
    title: "Design",
    description:
      "Pick a template and edit every field on a drag-and-resize canvas — text, fonts, colors, photo, and layout.",
  },
  {
    icon: LinkedinIcon,
    title: "LinkedIn auto-fill",
    description:
      "Sign in with LinkedIn to pull your name and profile photo in automatically. Title and company stay yours to fill in.",
  },
  {
    icon: FileOutput,
    title: "Export",
    description:
      "Download a transparent PNG, an editable vector PDF or SVG, or a print-ready file with bleed and crop marks.",
  },
  {
    icon: QrCode,
    title: "QR / digital card",
    description:
      "Every card gets a hosted page and a QR code. Scanning it opens your full card on any phone — no app required.",
  },
];

export function FeatureWalkthrough() {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((step, i) => (
        <motion.div
          key={step.title}
          className="border-border/60 flex flex-col gap-3 rounded-xl border p-6"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-full">
            <step.icon aria-hidden="true" className="h-5 w-5" />
          </div>
          <h3 className="font-display text-lg">
            <span className="text-muted-foreground mr-1.5 text-sm">
              {String(i + 1).padStart(2, "0")}
            </span>
            {step.title}
          </h3>
          <p className="text-muted-foreground text-sm">{step.description}</p>
        </motion.div>
      ))}
    </div>
  );
}
