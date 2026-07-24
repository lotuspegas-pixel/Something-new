import type { Metadata } from "next";
import { TemplateGallery } from "@/components/marketing/template-gallery";

export const metadata: Metadata = {
  title: "Templates — CardStudio",
  description: "Browse curated, print-ready business-card templates.",
};

export default function TemplatesPage() {
  return (
    <main className="container py-16">
      <div className="mx-auto mb-12 max-w-2xl text-center">
        <h1 className="font-display text-4xl font-semibold sm:text-5xl">
          Pick a starting point
        </h1>
        <p className="mt-4 text-muted-foreground">
          Every template is fully editable — fonts, colors, layout, photo and
          fields. Choose one and make it yours.
        </p>
      </div>
      <TemplateGallery />
    </main>
  );
}
