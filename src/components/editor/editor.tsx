"use client";

import * as React from "react";
import Link from "next/link";
import {
  Undo2,
  Redo2,
  Type,
  Share2,
  Check,
  Loader2,
  ExternalLink,
} from "lucide-react";
import type { CardDocument, TextElement } from "@/lib/card-model";
import { useEditor } from "@/lib/editor-store";
import { saveLocalCard } from "@/lib/local-store";
import { shortId } from "@/lib/utils";
import { Artboard } from "./artboard";
import { Inspector } from "./inspector";
import { ContentPanel } from "./content-panel";
import { ExportPanel } from "./export-panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tab = "content" | "design" | "export";

export function Editor({ initialDoc }: { initialDoc: CardDocument }) {
  const { state, dispatch } = useEditor(initialDoc);
  const [tab, setTab] = React.useState<Tab>("content");
  const [publish, setPublish] = React.useState<{
    status: "idle" | "saving" | "done";
    url?: string;
  }>({ status: "idle" });

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const cardUrl = `${appUrl}/c/${state.doc.slug}`;

  // Autosave to localStorage (debounced) — Phase 2 persistence.
  React.useEffect(() => {
    const t = setTimeout(() => saveLocalCard(state.doc), 400);
    return () => clearTimeout(t);
  }, [state.doc]);

  // Keyboard: undo/redo.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch]);

  function addText() {
    const el: TextElement = {
      id: shortId(6),
      type: "text",
      x: 10,
      y: 25,
      w: 40,
      h: 6,
      text: "New text",
      fontFamily: "Helvetica",
      fontSize: 9,
      fontWeight: 500,
      color: "#141414",
      align: "left",
    };
    dispatch({ type: "addElement", element: el });
  }

  async function onPublish() {
    setPublish({ status: "saving" });
    saveLocalCard(state.doc);
    try {
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ doc: state.doc }),
      });
      const data = await res.json();
      setPublish({ status: "done", url: data.url ?? cardUrl });
    } catch {
      setPublish({ status: "done", url: cardUrl });
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Undo"
            disabled={!state.past.length}
            onClick={() => dispatch({ type: "undo" })}
          >
            <Undo2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Redo"
            disabled={!state.future.length}
            onClick={() => dispatch({ type: "redo" })}
          >
            <Redo2 className="size-4" />
          </Button>
          <div className="mx-2 h-5 w-px bg-border" />
          <Button variant="ghost" size="sm" onClick={addText}>
            <Type className="size-4" /> Add text
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={onPublish} disabled={publish.status === "saving"}>
            {publish.status === "saving" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : publish.status === "done" ? (
              <Check className="size-4" />
            ) : (
              <Share2 className="size-4" />
            )}
            {publish.status === "done" ? "Published" : "Publish digital card"}
          </Button>
        </div>
      </div>

      {publish.status === "done" && publish.url && (
        <div className="flex items-center justify-between gap-3 border-b border-border bg-accent/10 px-4 py-2 text-sm">
          <span className="truncate">
            Live at <span className="font-medium">{publish.url}</span>
          </span>
          <Link
            href={publish.url}
            target="_blank"
            className="inline-flex shrink-0 items-center gap-1 font-medium text-accent hover:underline"
          >
            Open card <ExternalLink className="size-3.5" />
          </Link>
        </div>
      )}

      <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[340px_1fr_300px]">
        {/* Left: content / design tabs */}
        <aside className="hidden overflow-y-auto border-r border-border p-4 lg:block">
          <div className="mb-4 flex rounded-lg bg-muted p-1">
            {(["content", "design"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex-1 rounded-md py-1.5 text-sm font-medium capitalize transition-colors",
                  tab === t ? "bg-background shadow-sm" : "text-muted-foreground"
                )}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === "content" ? (
            <ContentPanel doc={state.doc} dispatch={dispatch} />
          ) : (
            <Inspector doc={state.doc} selectedId={state.selectedId} dispatch={dispatch} />
          )}
        </aside>

        {/* Center: artboard */}
        <div className="flex items-center justify-center overflow-auto bg-muted/30 bg-grid p-8">
          <div className="w-full max-w-xl">
            <Artboard
              doc={state.doc}
              selectedId={state.selectedId}
              dispatch={dispatch}
              cardUrl={cardUrl}
            />
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Click an element to select · drag to move · centre-snap guides help
              you align
            </p>
          </div>
        </div>

        {/* Right: export */}
        <aside className="hidden overflow-y-auto border-l border-border p-4 lg:block">
          <ExportPanel doc={state.doc} cardUrl={cardUrl} />
        </aside>
      </div>
    </div>
  );
}
