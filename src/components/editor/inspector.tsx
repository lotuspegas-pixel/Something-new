"use client";

import * as React from "react";
import { Trash2, BringToFront, SendToBack, Lock, Unlock } from "lucide-react";
import type { CardDocument, CardElement } from "@/lib/card-model";
import type { EditorDispatch } from "@/lib/editor-store";
import { Button } from "@/components/ui/button";

const PRINT_FONTS = ["Helvetica", "Georgia", "Times", "Courier"];

export function Inspector({
  doc,
  selectedId,
  dispatch,
}: {
  doc: CardDocument;
  selectedId: string | null;
  dispatch: EditorDispatch;
}) {
  const el = doc.elements.find((e) => e.id === selectedId) ?? null;

  if (!el) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Background</h3>
        <label className="block text-xs text-muted-foreground">Type</label>
        <select
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          value={doc.background.type}
          onChange={(e) =>
            dispatch({ type: "updateBackground", patch: { type: e.target.value as "solid" | "gradient" } })
          }
        >
          <option value="solid">Solid</option>
          <option value="gradient">Gradient</option>
        </select>
        <ColorRow
          label="Color"
          value={doc.background.color}
          onChange={(v, commit) => dispatch({ type: "updateBackground", patch: { color: v }, commit })}
        />
        {doc.background.type === "gradient" && (
          <ColorRow
            label="Color 2"
            value={doc.background.color2 ?? "#ffffff"}
            onChange={(v, commit) => dispatch({ type: "updateBackground", patch: { color2: v }, commit })}
          />
        )}
        <p className="pt-2 text-xs text-muted-foreground">
          Tip: exports keep a transparent background by default — the card color
          here is just for on-screen design.
        </p>
      </div>
    );
  }

  const patch = (p: Partial<CardElement>, commit = true) =>
    dispatch({ type: "updateElement", id: el.id, patch: p, commit });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold capitalize">{el.type} element</h3>
        <div className="flex gap-1">
          <IconBtn label="Bring to front" onClick={() => dispatch({ type: "reorder", id: el.id, direction: "front" })}>
            <BringToFront className="size-4" />
          </IconBtn>
          <IconBtn label="Send to back" onClick={() => dispatch({ type: "reorder", id: el.id, direction: "back" })}>
            <SendToBack className="size-4" />
          </IconBtn>
          <IconBtn label={el.locked ? "Unlock" : "Lock"} onClick={() => patch({ locked: !el.locked })}>
            {el.locked ? <Unlock className="size-4" /> : <Lock className="size-4" />}
          </IconBtn>
          <IconBtn label="Delete" onClick={() => dispatch({ type: "deleteElement", id: el.id })}>
            <Trash2 className="size-4 text-red-500" />
          </IconBtn>
        </div>
      </div>

      {/* Position & size */}
      <div className="grid grid-cols-2 gap-2">
        <NumberRow label="X" value={el.x} onChange={(v, c) => patch({ x: v }, c)} />
        <NumberRow label="Y" value={el.y} onChange={(v, c) => patch({ y: v }, c)} />
        <NumberRow label="W" value={el.w} onChange={(v, c) => patch({ w: v }, c)} />
        <NumberRow label="H" value={el.h} onChange={(v, c) => patch({ h: v }, c)} />
      </div>

      {el.type === "text" && (
        <div className="space-y-3 border-t border-border pt-3">
          {el.bind && (
            <p className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
              Bound to your <b>{el.bind}</b> — edit it in the Content tab.
            </p>
          )}
          <label className="block text-xs text-muted-foreground">Font</label>
          <select
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            value={el.fontFamily}
            onChange={(e) => patch({ fontFamily: e.target.value })}
          >
            {PRINT_FONTS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <NumberRow label="Size (pt)" value={el.fontSize} step={0.5} onChange={(v, c) => patch({ fontSize: v }, c)} />
            <div>
              <label className="block text-xs text-muted-foreground">Weight</label>
              <select
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                value={el.fontWeight}
                onChange={(e) => patch({ fontWeight: Number(e.target.value) })}
              >
                {[300, 400, 500, 600, 700, 800].map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground">Align</label>
            <div className="mt-1 flex gap-1">
              {(["left", "center", "right"] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => patch({ align: a })}
                  className={`flex-1 rounded-md border px-2 py-1 text-xs capitalize ${
                    el.align === a ? "border-foreground bg-foreground text-background" : "border-border"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={!!el.uppercase} onChange={(e) => patch({ uppercase: e.target.checked })} />
            Uppercase
          </label>
          <ColorRow label="Color" value={el.color} onChange={(v, c) => patch({ color: v }, c)} />
        </div>
      )}

      {el.type === "shape" && (
        <div className="space-y-3 border-t border-border pt-3">
          <ColorRow label="Fill" value={el.fill} onChange={(v, c) => patch({ fill: v }, c)} />
          {el.shape === "rect" && (
            <NumberRow label="Corner radius" value={el.radius ?? 0} onChange={(v, c) => patch({ radius: v }, c)} />
          )}
        </div>
      )}

      {el.type === "qr" && (
        <div className="space-y-3 border-t border-border pt-3">
          <ColorRow label="QR color" value={el.color} onChange={(v, c) => patch({ color: v }, c)} />
          <ColorRow label="QR background" value={el.background} onChange={(v, c) => patch({ background: v }, c)} />
          <p className="text-xs text-muted-foreground">
            The QR encodes your card&rsquo;s public URL, so you can update your
            details later without reprinting.
          </p>
        </div>
      )}

      {el.type === "photo" && (
        <div className="space-y-3 border-t border-border pt-3">
          <NumberRow label="Corner radius" value={el.radius} onChange={(v, c) => patch({ radius: v }, c)} />
          <p className="text-xs text-muted-foreground">Upload a photo from the Content tab.</p>
        </div>
      )}
    </div>
  );
}

function IconBtn({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon" className="size-8" aria-label={label} title={label} onClick={onClick}>
      {children}
    </Button>
  );
}

function NumberRow({
  label,
  value,
  step = 0.5,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number, commit: boolean) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-muted-foreground">{label}</label>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value), false)}
        onBlur={(e) => onChange(Number(e.target.value), true)}
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
      />
    </div>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string, commit: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value, false)}
          onBlur={(e) => onChange(e.target.value, true)}
          className="w-20 rounded-md border border-input bg-background px-2 py-1 text-xs"
        />
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value, false)}
          onBlur={(e) => onChange(e.target.value, true)}
          className="size-8 cursor-pointer rounded border border-input bg-background"
          aria-label={`${label} color picker`}
        />
      </div>
    </div>
  );
}
