"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardPreview } from "@/components/card-preview";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  cardTemplates,
  templateCategories,
  type CardTemplate,
  type CardTemplateCategory,
} from "@/lib/templates";

export function TemplateGallery() {
  const [category, setCategory] = React.useState<CardTemplateCategory | "all">("all");
  const [preview, setPreview] = React.useState<CardTemplate | null>(null);

  const filtered =
    category === "all"
      ? cardTemplates
      : cardTemplates.filter((t) => t.category === category);

  return (
    <div className="flex flex-col gap-8">
      <Tabs value={category} onValueChange={(v) => setCategory(v as typeof category)}>
        <TabsList aria-label="Filter templates by category">
          {templateCategories.map((c) => (
            <TabsTrigger key={c.value} value={c.value}>
              {c.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => setPreview(template)}
            className="flex flex-col gap-3 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            aria-haspopup="dialog"
            aria-label={`Preview ${template.name} template at full size`}
          >
            <CardPreview template={template} />
            <div className="flex items-start justify-between gap-2 px-1">
              <div>
                <p className="font-display text-base">{template.name}</p>
                <p className="text-muted-foreground text-sm">{template.description}</p>
              </div>
              <Badge variant="secondary" className="shrink-0">
                {template.fontPairingLabel}
              </Badge>
            </div>
          </button>
        ))}
      </div>

      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-2xl">
          {preview && (
            <>
              <DialogHeader>
                <DialogTitle>{preview.name}</DialogTitle>
                <DialogDescription>{preview.description}</DialogDescription>
              </DialogHeader>
              <CardPreview template={preview} interactive={false} className="w-full" />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Badge variant="outline">{preview.fontPairingLabel}</Badge>
                <Button size="sm" disabled title="Card editor ships in a later phase">
                  Use this template
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
