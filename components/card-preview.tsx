import { cn } from "@/lib/utils";
import type { CardTemplate } from "@/lib/templates";

const alignToItems: Record<CardTemplate["layout"]["align"], string> = {
  left: "items-start text-left",
  center: "items-center text-center",
  right: "items-end text-right",
};

function CardMotif({ layout }: { layout: CardTemplate["layout"] }) {
  switch (layout.motif) {
    case "geometric":
      return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div
            className="absolute -right-6 -top-8 h-28 w-28 rotate-45 opacity-20"
            style={{ background: layout.accent }}
          />
          <div
            className="absolute -right-2 top-10 h-14 w-14 rotate-12 opacity-30"
            style={{ background: layout.accent }}
          />
        </div>
      );
    case "radial":
      return (
        <div
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-30 blur-2xl"
          style={{ background: layout.accent }}
          aria-hidden="true"
        />
      );
    case "grid":
      return (
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: `linear-gradient(${layout.foreground} 1px, transparent 1px), linear-gradient(90deg, ${layout.foreground} 1px, transparent 1px)`,
            backgroundSize: "16px 16px",
          }}
          aria-hidden="true"
        />
      );
    case "frame":
      return (
        <div
          className="pointer-events-none absolute inset-3 rounded-md border opacity-40"
          style={{ borderColor: layout.accent }}
          aria-hidden="true"
        />
      );
    case "split":
      return (
        <div
          className="pointer-events-none absolute inset-x-8 top-[38%] h-px opacity-60"
          style={{ background: layout.accent }}
          aria-hidden="true"
        />
      );
    default:
      return null;
  }
}

export function CardPreview({
  template,
  className,
  interactive = true,
}: {
  template: CardTemplate;
  className?: string;
  interactive?: boolean;
}) {
  const { layout, sample } = template;

  return (
    <div
      className={cn(
        "group relative aspect-[7/4] w-full overflow-hidden rounded-xl shadow-md",
        layout.border && "border",
        interactive &&
          "transition-transform duration-[--duration-base] ease-[--ease-out-quart] hover:-translate-y-1 hover:shadow-xl",
        className,
      )}
      style={{
        background: layout.background,
        color: layout.foreground,
      }}
    >
      <CardMotif layout={layout} />

      <div
        className={cn(
          "relative z-10 flex h-full w-full flex-col justify-between p-5",
          alignToItems[layout.align],
        )}
      >
        <div>
          <p
            className={cn(
              "text-lg leading-tight sm:text-xl",
              layout.headingStyle === "italic" && "italic",
            )}
            style={{ fontFamily: `var(${layout.headingFont})` }}
          >
            {sample.name}
          </p>
          <p className="mt-0.5 text-xs sm:text-sm" style={{ color: layout.muted }}>
            {sample.title} &middot; {sample.company}
          </p>
        </div>

        <div
          className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] sm:text-xs"
          style={{ fontFamily: `var(${layout.bodyFont})`, color: layout.muted }}
        >
          <span>{sample.email}</span>
          <span>{sample.phone}</span>
          <span>{sample.website}</span>
        </div>
      </div>

      {/* Foreshadows the digital-card QR export (Section 4.6) — decorative only in the gallery */}
      <div
        className="absolute bottom-3 right-3 z-10 h-7 w-7 rounded-sm opacity-70 sm:h-8 sm:w-8"
        style={{
          backgroundImage: `repeating-conic-gradient(${layout.foreground} 0% 25%, transparent 0% 50%)`,
          backgroundSize: "6px 6px",
        }}
        aria-hidden="true"
      />
    </div>
  );
}
