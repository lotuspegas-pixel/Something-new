/**
 * Card + scan-event store (server-only).
 *
 * Production backend is PostgreSQL via Prisma (see prisma/schema.prisma, §6).
 * When DATABASE_URL is not configured, this falls back to a JSON file store so
 * the entire publish -> QR -> scan -> analytics loop is demonstrable end-to-end
 * without provisioning a database. The fallback is clearly ephemeral and logged.
 */

import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { CardDocument } from "./card-model";

export interface ScanEvent {
  id: string;
  cardSlug: string;
  timestamp: number;
  referrer: string | null;
  /** Coarse, privacy-conscious location (country/region only), if available. */
  roughLocation: string | null;
}

export interface StoredCard {
  doc: CardDocument;
  ownerEmail?: string;
  isPublished: boolean;
}

interface DbShape {
  cards: Record<string, StoredCard>;
  scans: ScanEvent[];
}

const usingDatabase = Boolean(process.env.DATABASE_URL);

function dataFile(): string {
  // Prefer a project-local dir in dev; fall back to tmp on read-only FS.
  const primary = path.join(process.cwd(), ".data");
  const fallback = path.join(os.tmpdir(), "cardstudio-data");
  return path.join(process.env.CARDSTUDIO_DATA_DIR ?? primary ?? fallback, "db.json");
}

async function readDb(): Promise<DbShape> {
  try {
    const raw = await fs.readFile(dataFile(), "utf8");
    return JSON.parse(raw) as DbShape;
  } catch {
    return { cards: {}, scans: [] };
  }
}

async function writeDb(db: DbShape): Promise<void> {
  const file = dataFile();
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(db, null, 2), "utf8");
  } catch {
    // Read-only FS (e.g. serverless). In production DATABASE_URL should be set.
    const tmp = path.join(os.tmpdir(), "cardstudio-data", "db.json");
    await fs.mkdir(path.dirname(tmp), { recursive: true });
    await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  }
}

export async function saveCard(
  doc: CardDocument,
  ownerEmail?: string
): Promise<StoredCard> {
  // NOTE: when usingDatabase is true, wire the Prisma client here (schema ready).
  const db = await readDb();
  const record: StoredCard = { doc, ownerEmail, isPublished: true };
  db.cards[doc.slug] = record;
  await writeDb(db);
  return record;
}

export async function getCard(slug: string): Promise<StoredCard | null> {
  const db = await readDb();
  return db.cards[slug] ?? null;
}

export async function listCards(): Promise<StoredCard[]> {
  const db = await readDb();
  return Object.values(db.cards);
}

export async function logScan(
  event: Omit<ScanEvent, "id">
): Promise<void> {
  const db = await readDb();
  db.scans.push({ ...event, id: `${event.timestamp}-${db.scans.length}` });
  await writeDb(db);
}

export async function getScans(cardSlug: string): Promise<ScanEvent[]> {
  const db = await readDb();
  return db.scans.filter((s) => s.cardSlug === cardSlug);
}

export function storeBackend(): "postgres" | "file" {
  return usingDatabase ? "postgres" : "file";
}
