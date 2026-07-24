"use client";

import * as React from "react";
import { ARTBOARD, resolveBoundText, type CardDocument, type CardElement } from "@/lib/card-model";
import { CardSvg } from "@/components/card/card-svg";
import type { EditorDispatch } from "@/lib/editor-store";
import { cn } from "@/lib/utils";

const SNAP_MM = 1.2;

export function Artboard({
  doc,
  selectedId,
  dispatch,
  cardUrl,
}: {
  doc: CardDocument;
  selectedId: string | null;
  dispatch: EditorDispatch;
  cardUrl: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(6); // px per mm
  const [guides, setGuides] = React.useState<{ x: boolean; y: boolean }>({ x: false, y: false });

  React.useEffect(() => {
    const measure = () => {
      if (ref.current) setScale(ref.current.clientWidth / ARTBOARD.width);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const drag = React.useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  function onPointerDown(e: React.PointerEvent, el: CardElement) {
    if (el.locked) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dispatch({ type: "select", id: el.id });
    // Commit a single history checkpoint at gesture start.
    dispatch({ type: "updateElement", id: el.id, patch: {}, commit: true });
    drag.current = { id: el.id, startX: e.clientX, startY: e.clientY, origX: el.x, origY: el.y };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const d = drag.current;
    const el = doc.elements.find((x) => x.id === d.id);
    if (!el) return;
    let nx = d.origX + (e.clientX - d.startX) / scale;
    let ny = d.origY + (e.clientY - d.startY) / scale;

    // Snap element center to the artboard center lines.
    const cx = nx + el.w / 2;
    const cy = ny + el.h / 2;
    const showX = Math.abs(cx - ARTBOARD.width / 2) < SNAP_MM;
    const showY = Math.abs(cy - ARTBOARD.height / 2) < SNAP_MM;
    if (showX) nx = ARTBOARD.width / 2 - el.w / 2;
    if (showY) ny = ARTBOARD.height / 2 - el.h / 2;
    setGuides({ x: showX, y: showY });

    dispatch({
      type: "updateElement",
      id: d.id,
      patch: { x: round(nx), y: round(ny) },
      commit: false,
    });
  }

  function onPointerUp() {
    drag.current = null;
    setGuides({ x: false, y: false });
  }

  return (
    <div
      className="relative w-full select-none rounded-xl shadow-2xl ring-1 ring-black/10"
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onClick={() => dispatch({ type: "select", id: null })}
    >
      <CardSvg doc={doc} cardUrl={cardUrl} className="rounded-xl" />

      {/* Interactive overlay: one handle per element for select + drag. */}
      <div className="absolute inset-0">
        {doc.elements.map((el) => {
          const selected = el.id === selectedId;
          return (
            <div
              key={el.id}
              onPointerDown={(e) => onPointerDown(e, el)}
              className={cn(
                "absolute cursor-move rounded-[2px] transition-shadow",
                selected
                  ? "ring-2 ring-accent"
                  : "hover:ring-2 hover:ring-accent/40",
                el.locked && "cursor-not-allowed"
              )}
              style={{
                left: el.x * scale,
                top: el.y * scale,
                width: Math.max(el.w * scale, 8),
                height: Math.max(el.h * scale, 8),
              }}
              title={el.type === "text" ? resolveBoundText(el, doc.contact) : el.type}
            />
          );
        })}

        {/* Alignment guides */}
        {guides.x && (
          <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-accent" />
        )}
        {guides.y && (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-accent" />
        )}
      </div>
    </div>
  );
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
