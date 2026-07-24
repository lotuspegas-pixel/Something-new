"use client";

import * as React from "react";
import { FileImage, FileType, FileCode, QrCode as QrIcon, Loader2 } from "lucide-react";
import type { CardDocument } from "@/lib/card-model";
import { exportPng, exportPdf, exportSvg } from "@/lib/export";
import { qrToDataUrl, qrToSvg } from "@/lib/qr";
import { Button } from "@/components/ui/button";

export function ExportPanel({ doc, cardUrl }: { doc: CardDocument; cardUrl: string }) {
  const [transparent, setTransparent] = React.useState(true);
  const [printReady, setPrintReady] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function run(kind: string, fn: () => Promise<void>) {
    setBusy(kind);
    try {
      await fn();
    } catch (err) {
      console.error(err);
      alert("Export failed — see console for details.");
    } finally {
      setBusy(null);
    }
  }

  async function exportQrPng() {
    const url = await qrToDataUrl(cardUrl, { level: "H" });
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.slug}-qr.png`;
    a.click();
  }

  async function exportQrSvg() {
    const svg = await qrToSvg(cardUrl, { level: "H" });
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.slug}-qr.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Export</h3>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} />
        Transparent background
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={printReady} onChange={(e) => setPrintReady(e.target.checked)} />
        Print-ready (bleed + crop marks, PDF)
      </label>

      <div className="grid gap-2">
        <ExportButton
          icon={<FileImage className="size-4" />}
          label="PNG (high-res)"
          busy={busy === "png"}
          onClick={() => run("png", () => exportPng(doc, cardUrl, { transparent }))}
        />
        <ExportButton
          icon={<FileType className="size-4" />}
          label="Vector PDF"
          busy={busy === "pdf"}
          onClick={() => run("pdf", () => exportPdf(doc, cardUrl, { transparent, printReady }))}
        />
        <ExportButton
          icon={<FileCode className="size-4" />}
          label="SVG (editable)"
          busy={busy === "svg"}
          onClick={() => run("svg", () => exportSvg(doc, cardUrl, transparent))}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Vector PDF/SVG open and edit fully in Adobe Illustrator, Figma or
        Inkscape. Text stays selectable — it&rsquo;s not a flattened screenshot.
      </p>

      <div className="border-t border-border pt-4">
        <h3 className="mb-2 text-sm font-semibold">QR code graphic</h3>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={exportQrPng}>
            <QrIcon className="size-4" /> PNG
          </Button>
          <Button variant="outline" size="sm" onClick={exportQrSvg}>
            <QrIcon className="size-4" /> SVG
          </Button>
        </div>
      </div>
    </div>
  );
}

function ExportButton({
  icon,
  label,
  busy,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <Button variant="outline" className="justify-start" onClick={onClick} disabled={busy}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : icon}
      {label}
    </Button>
  );
}
