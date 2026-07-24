"use client";

/**
 * Client autosave for the editor (Build Spec §4.3 "Autosave card state").
 *
 * Cards are persisted to localStorage while editing so a reload restores the
 * exact state (this is what makes the Phase 2 Definition of Done pass). When the
 * user publishes, the card is POSTed to the server store for the hosted page.
 */

import type { CardDocument } from "./card-model";

const KEY = "cardstudio:cards";

type Bag = Record<string, CardDocument>;

function read(): Bag {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Bag;
  } catch {
    return {};
  }
}

function write(bag: Bag) {
  localStorage.setItem(KEY, JSON.stringify(bag));
}

export function saveLocalCard(doc: CardDocument) {
  const bag = read();
  bag[doc.id] = { ...doc, updatedAt: Date.now() };
  write(bag);
}

export function loadLocalCard(id: string): CardDocument | null {
  return read()[id] ?? null;
}

export function listLocalCards(): CardDocument[] {
  return Object.values(read()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deleteLocalCard(id: string) {
  const bag = read();
  delete bag[id];
  write(bag);
}
