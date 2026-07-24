import Link from "next/link";
import { getCard, getScans } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Scan analytics dashboard (Build Spec §6, §8 Phase 6). Proves the
 * "digital cards outperform paper" pitch with the owner's own data.
 * Demo note: not access-controlled here — production gates this behind the
 * card owner's session (Auth.js), per §7.
 */
export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const card = await getCard(slug);
  const scans = await getScans(slug);

  if (!card) {
    return (
      <div className="container py-24 text-center">
        <h1 className="font-display text-3xl font-semibold">No data yet</h1>
        <p className="mt-3 text-muted-foreground">Publish a card first to see its analytics.</p>
      </div>
    );
  }

  const total = scans.length;
  const last7 = scans.filter((s) => s.timestamp > Date.now() - 7 * 864e5).length;
  const byDay = groupByDay(scans.map((s) => s.timestamp));
  const max = Math.max(1, ...byDay.map((d) => d.count));

  return (
    <main className="container max-w-3xl py-16">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Scan analytics</h1>
          <p className="text-muted-foreground">
            {card.doc.contact.name || "Untitled card"} ·{" "}
            <Link href={`/c/${slug}`} className="text-accent hover:underline">
              /c/{slug}
            </Link>
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Total scans" value={total} />
        <Stat label="Last 7 days" value={last7} />
        <Stat label="Save-to-contact" value="—" hint="Wire vCard download tracking to populate" />
      </div>

      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold">Scans over the last 14 days</h2>
        <div className="flex items-end gap-1.5" style={{ height: 140 }}>
          {byDay.map((d) => (
            <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-accent/80"
                style={{ height: `${(d.count / max) * 110}px` }}
                title={`${d.count} scans`}
              />
              <span className="text-[10px] text-muted-foreground">{d.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold">Recent scans</h2>
        {scans.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No scans yet. Share your QR or open <code>/c/{slug}</code> to record one.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Location</th>
                  <th className="px-4 py-2 font-medium">Referrer</th>
                </tr>
              </thead>
              <tbody>
                {scans
                  .slice()
                  .reverse()
                  .slice(0, 25)
                  .map((s) => (
                    <tr key={s.id} className="border-t border-border">
                      <td className="px-4 py-2">{new Date(s.timestamp).toLocaleString()}</td>
                      <td className="px-4 py-2">{s.roughLocation ?? "—"}</td>
                      <td className="px-4 py-2 text-muted-foreground">{s.referrer ?? "direct"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="text-3xl font-semibold">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground/70">{hint}</div>}
    </div>
  );
}

function groupByDay(timestamps: number[]): { label: string; count: number }[] {
  const days: { label: string; count: number }[] = [];
  const now = Date.now();
  for (let i = 13; i >= 0; i--) {
    const start = now - i * 864e5;
    const d = new Date(start);
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    const count = timestamps.filter((t) => {
      const td = new Date(t);
      return td.getDate() === d.getDate() && td.getMonth() === d.getMonth();
    }).length;
    days.push({ label, count });
  }
  return days;
}
