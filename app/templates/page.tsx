import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { TemplateGallery } from "@/components/template-gallery";
import { templateFontVariables } from "@/lib/fonts";

export const metadata: Metadata = {
  title: "Templates",
  description:
    "Browse professional business-card templates with coordinated font pairings, each previewed live at full size before you start editing.",
};

export default function TemplatesPage() {
  return (
    <div className={templateFontVariables}>
      <SiteHeader />
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
        <div className="max-w-2xl">
          <h1 className="font-display text-3xl sm:text-4xl">Template gallery</h1>
          <p className="text-muted-foreground mt-3 text-base">
            Every template pairs a heading and body font chosen for print legibility.
            Click any card to preview it at full size before you commit to editing it.
          </p>
        </div>
        <TemplateGallery />
      </main>
      <SiteFooter />
    </div>
  );
}
