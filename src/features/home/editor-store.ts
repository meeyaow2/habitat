import type { FloorDoc } from "./model";

/**
 * Undo/redo history for the floor-plan editor. Pure and framework-free.
 * One entry per completed gesture (drag end, resize end, property edit).
 */
export type History = { past: FloorDoc[]; present: FloorDoc; future: FloorDoc[] };

export const HISTORY_LIMIT = 100;

export type HistoryAction =
  | { type: "commit"; doc: FloorDoc }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; doc: FloorDoc };

export function initHistory(doc: FloorDoc): History {
  return { past: [], present: doc, future: [] };
}

export function historyReducer(state: History, action: HistoryAction): History {
  switch (action.type) {
    case "commit":
      if (action.doc === state.present) return state;
      return {
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        present: action.doc,
        future: [],
      };
    case "undo": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future] };
    }
    case "redo": {
      if (state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      return { past: [...state.past, state.present], present: next, future: rest };
    }
    case "reset":
      return initHistory(action.doc);
  }
}

/** Stable comparison used for the "unsaved changes" state. */
export function docsEqual(a: FloorDoc, b: FloorDoc): boolean {
  return JSON.stringify(normalise(a)) === JSON.stringify(normalise(b));
}

function normalise(d: FloorDoc) {
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    rooms: d.rooms.map((r, i) => ({ ...r, sortOrder: i, x: round(r.x), y: round(r.y), width: round(r.width), height: round(r.height) })),
    objects: [...d.objects]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((o) => ({ ...o, x: round(o.x), y: round(o.y), width: round(o.width), height: round(o.height) })),
  };
}
