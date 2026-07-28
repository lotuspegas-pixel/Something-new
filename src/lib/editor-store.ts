"use client";

/**
 * Editor state with undo/redo history (Build Spec §4.3).
 *
 * History is checkpoint-based: mutations pass `commit` to snapshot the previous
 * document. Continuous gestures (dragging) commit once at gesture start, then
 * stream non-committing updates, so one drag == one undo step.
 */

import * as React from "react";
import type {
  CardBackground,
  CardContact,
  CardDocument,
  CardElement,
  CardLink,
} from "./card-model";

interface EditorState {
  doc: CardDocument;
  selectedId: string | null;
  past: CardDocument[];
  future: CardDocument[];
}

type Action =
  | { type: "select"; id: string | null }
  | { type: "updateElement"; id: string; patch: Partial<CardElement>; commit?: boolean }
  | { type: "updateContact"; patch: Partial<CardContact>; commit?: boolean }
  | { type: "updateBackground"; patch: Partial<CardBackground>; commit?: boolean }
  | { type: "addElement"; element: CardElement }
  | { type: "deleteElement"; id: string }
  | { type: "reorder"; id: string; direction: "front" | "back" }
  | { type: "setLinks"; links: CardLink[] }
  | { type: "replaceDoc"; doc: CardDocument }
  | { type: "undo" }
  | { type: "redo" };

const MAX_HISTORY = 60;

function withHistory(state: EditorState, nextDoc: CardDocument, commit = true): EditorState {
  if (!commit) return { ...state, doc: nextDoc };
  return {
    ...state,
    doc: nextDoc,
    past: [...state.past, state.doc].slice(-MAX_HISTORY),
    future: [],
  };
}

export function editorReducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case "select":
      return { ...state, selectedId: action.id };

    case "updateElement": {
      const elements = state.doc.elements.map((el) =>
        el.id === action.id ? ({ ...el, ...action.patch } as CardElement) : el
      );
      return withHistory(state, { ...state.doc, elements }, action.commit ?? true);
    }

    case "updateContact":
      return withHistory(
        state,
        { ...state.doc, contact: { ...state.doc.contact, ...action.patch } },
        action.commit ?? true
      );

    case "updateBackground":
      return withHistory(
        state,
        { ...state.doc, background: { ...state.doc.background, ...action.patch } },
        action.commit ?? true
      );

    case "addElement":
      return {
        ...withHistory(state, {
          ...state.doc,
          elements: [...state.doc.elements, action.element],
        }),
        selectedId: action.element.id,
      };

    case "deleteElement":
      return {
        ...withHistory(state, {
          ...state.doc,
          elements: state.doc.elements.filter((el) => el.id !== action.id),
        }),
        selectedId: null,
      };

    case "reorder": {
      const els = [...state.doc.elements];
      const idx = els.findIndex((e) => e.id === action.id);
      if (idx === -1) return state;
      const [item] = els.splice(idx, 1);
      if (action.direction === "front") els.push(item);
      else els.unshift(item);
      return withHistory(state, { ...state.doc, elements: els });
    }

    case "setLinks":
      return withHistory(state, { ...state.doc, links: action.links });

    case "replaceDoc":
      return { ...state, doc: action.doc };

    case "undo": {
      if (!state.past.length) return state;
      const previous = state.past[state.past.length - 1];
      return {
        ...state,
        doc: previous,
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future],
      };
    }

    case "redo": {
      if (!state.future.length) return state;
      const next = state.future[0];
      return {
        ...state,
        doc: next,
        past: [...state.past, state.doc],
        future: state.future.slice(1),
      };
    }

    default:
      return state;
  }
}

export function useEditor(initial: CardDocument) {
  const [state, dispatch] = React.useReducer(editorReducer, {
    doc: initial,
    selectedId: null,
    past: [],
    future: [],
  });
  return { state, dispatch };
}

export type EditorDispatch = React.Dispatch<Action>;
export type { EditorState };
