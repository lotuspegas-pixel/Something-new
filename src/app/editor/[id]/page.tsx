"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { loadLocalCard } from "@/lib/local-store";
import { Editor } from "@/components/editor/editor";
import type { CardDocument } from "@/lib/card-model";

export default function EditExistingPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = React.useState<CardDocument | null | undefined>(undefined);

  React.useEffect(() => {
    setDoc(loadLocalCard(id));
  }, [id]);

  if (doc === undefined) {
    return <div className="container py-20 text-center text-muted-foreground">Loading…</div>;
  }
  if (doc === null) {
    return (
      <div className="container py-20 text-center">
        <p className="text-muted-foreground">This card isn&rsquo;t saved on this device.</p>
        <Link href="/templates" className="mt-4 inline-block font-medium text-accent hover:underline">
          Start a new card →
        </Link>
      </div>
    );
  }
  return <Editor initialDoc={doc} />;
}
