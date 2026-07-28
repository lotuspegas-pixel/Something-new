"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { instantiateTemplate } from "@/lib/templates";
import { saveLocalCard } from "@/lib/local-store";
import { Editor } from "@/components/editor/editor";
import type { CardDocument } from "@/lib/card-model";

function NewEditor() {
  const params = useSearchParams();
  const templateId = params.get("template") ?? "ink-minimal";
  const [doc] = React.useState<CardDocument>(() => {
    const d = instantiateTemplate(templateId);
    saveLocalCard(d);
    return d;
  });
  return <Editor initialDoc={doc} />;
}

export default function NewEditorPage() {
  return (
    <React.Suspense fallback={<div className="container py-20 text-center text-muted-foreground">Loading editor…</div>}>
      <NewEditor />
    </React.Suspense>
  );
}
