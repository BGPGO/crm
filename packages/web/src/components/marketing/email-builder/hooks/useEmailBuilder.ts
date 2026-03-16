"use client";

import { useReducer, useCallback, useMemo } from "react";
import {
  EmailSection,
  EmailDocument,
  GlobalStyle,
  SectionData,
  SectionStyle,
  DEFAULT_GLOBAL_STYLE,
} from "@/types/email-builder";
import { renderEmailHtml } from "../renderer/emailHtmlRenderer";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface Snapshot {
  sections: EmailSection[];
  globalStyle: GlobalStyle;
}

interface BuilderState {
  sections: EmailSection[];
  globalStyle: GlobalStyle;
  selectedSectionId: string | null;
  undoStack: Snapshot[];
  redoStack: Snapshot[];
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type BuilderAction =
  | { type: "ADD_SECTION"; section: EmailSection; atIndex?: number }
  | { type: "REMOVE_SECTION"; sectionId: string }
  | { type: "MOVE_SECTION"; fromIndex: number; toIndex: number }
  | { type: "DUPLICATE_SECTION"; sectionId: string }
  | {
      type: "UPDATE_SECTION";
      sectionId: string;
      data?: Partial<SectionData>;
      style?: Partial<SectionStyle>;
    }
  | { type: "SELECT_SECTION"; sectionId: string | null }
  | { type: "UPDATE_GLOBAL_STYLE"; style: Partial<GlobalStyle> }
  | { type: "SET_DOCUMENT"; document: EmailDocument }
  | { type: "UNDO" }
  | { type: "REDO" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_UNDO = 50;

function snapshot(state: BuilderState): Snapshot {
  return {
    sections: structuredClone(state.sections),
    globalStyle: { ...state.globalStyle },
  };
}

function pushUndo(state: BuilderState): { undoStack: Snapshot[]; redoStack: Snapshot[] } {
  const stack = [...state.undoStack, snapshot(state)];
  if (stack.length > MAX_UNDO) stack.shift();
  return { undoStack: stack, redoStack: [] };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    // -- Mutations that record undo ------------------------------------------

    case "ADD_SECTION": {
      const history = pushUndo(state);
      const sections = [...state.sections];
      const index = action.atIndex ?? sections.length;
      sections.splice(index, 0, action.section);
      return { ...state, ...history, sections, selectedSectionId: action.section.id };
    }

    case "REMOVE_SECTION": {
      const history = pushUndo(state);
      const sections = state.sections.filter((s) => s.id !== action.sectionId);
      const selectedSectionId =
        state.selectedSectionId === action.sectionId ? null : state.selectedSectionId;
      return { ...state, ...history, sections, selectedSectionId };
    }

    case "MOVE_SECTION": {
      const { fromIndex, toIndex } = action;
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= state.sections.length ||
        toIndex >= state.sections.length
      ) {
        return state;
      }
      const history = pushUndo(state);
      const sections = [...state.sections];
      const [moved] = sections.splice(fromIndex, 1);
      sections.splice(toIndex, 0, moved);
      return { ...state, ...history, sections };
    }

    case "DUPLICATE_SECTION": {
      const idx = state.sections.findIndex((s) => s.id === action.sectionId);
      if (idx === -1) return state;
      const history = pushUndo(state);
      const original = state.sections[idx];
      const cloned: EmailSection = {
        ...structuredClone(original),
        id: crypto.randomUUID(),
      };
      const sections = [...state.sections];
      sections.splice(idx + 1, 0, cloned);
      return { ...state, ...history, sections, selectedSectionId: cloned.id };
    }

    case "UPDATE_SECTION": {
      const idx = state.sections.findIndex((s) => s.id === action.sectionId);
      if (idx === -1) return state;
      const history = pushUndo(state);
      const sections = [...state.sections];
      const current = sections[idx];
      sections[idx] = {
        ...current,
        data: action.data ? ({ ...current.data, ...action.data } as SectionData) : current.data,
        style: action.style ? { ...current.style, ...action.style } : current.style,
      };
      return { ...state, ...history, sections };
    }

    case "UPDATE_GLOBAL_STYLE": {
      const history = pushUndo(state);
      return {
        ...state,
        ...history,
        globalStyle: { ...state.globalStyle, ...action.style },
      };
    }

    case "SET_DOCUMENT": {
      const history = pushUndo(state);
      return {
        ...state,
        ...history,
        sections: structuredClone(action.document.sections),
        globalStyle: { ...action.document.globalStyle },
        selectedSectionId: null,
      };
    }

    // -- Non-mutating actions (no undo) --------------------------------------

    case "SELECT_SECTION":
      return { ...state, selectedSectionId: action.sectionId };

    case "UNDO": {
      if (state.undoStack.length === 0) return state;
      const undoStack = [...state.undoStack];
      const prev = undoStack.pop()!;
      const redoStack = [...state.redoStack, snapshot(state)];
      return {
        ...state,
        sections: prev.sections,
        globalStyle: prev.globalStyle,
        undoStack,
        redoStack,
        selectedSectionId: null,
      };
    }

    case "REDO": {
      if (state.redoStack.length === 0) return state;
      const redoStack = [...state.redoStack];
      const next = redoStack.pop()!;
      const undoStack = [...state.undoStack, snapshot(state)];
      return {
        ...state,
        sections: next.sections,
        globalStyle: next.globalStyle,
        undoStack,
        redoStack,
        selectedSectionId: null,
      };
    }

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function initState(doc?: EmailDocument): BuilderState {
  return {
    sections: doc ? structuredClone(doc.sections) : [],
    globalStyle: doc ? { ...doc.globalStyle } : { ...DEFAULT_GLOBAL_STYLE },
    selectedSectionId: null,
    undoStack: [],
    redoStack: [],
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEmailBuilder(initialDocument?: EmailDocument) {
  const [state, dispatch] = useReducer(builderReducer, initialDocument, initState);

  const { sections, globalStyle, selectedSectionId, undoStack, redoStack } = state;

  const selectedSection = useMemo(
    () => sections.find((s) => s.id === selectedSectionId) ?? null,
    [sections, selectedSectionId],
  );

  const compiledHtml = useMemo(
    () => renderEmailHtml({ sections, globalStyle }),
    [sections, globalStyle],
  );

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  // -- Convenience wrappers --------------------------------------------------

  const addSection = useCallback(
    (section: EmailSection, atIndex?: number) =>
      dispatch({ type: "ADD_SECTION", section, atIndex }),
    [],
  );

  const removeSection = useCallback(
    (sectionId: string) => dispatch({ type: "REMOVE_SECTION", sectionId }),
    [],
  );

  const moveSection = useCallback(
    (fromIndex: number, toIndex: number) =>
      dispatch({ type: "MOVE_SECTION", fromIndex, toIndex }),
    [],
  );

  const duplicateSection = useCallback(
    (sectionId: string) => dispatch({ type: "DUPLICATE_SECTION", sectionId }),
    [],
  );

  const updateSection = useCallback(
    (sectionId: string, data?: Partial<SectionData>, style?: Partial<SectionStyle>) =>
      dispatch({ type: "UPDATE_SECTION", sectionId, data, style }),
    [],
  );

  const selectSection = useCallback(
    (sectionId: string | null) => dispatch({ type: "SELECT_SECTION", sectionId }),
    [],
  );

  const updateGlobalStyle = useCallback(
    (style: Partial<GlobalStyle>) => dispatch({ type: "UPDATE_GLOBAL_STYLE", style }),
    [],
  );

  const setDocument = useCallback(
    (document: EmailDocument) => dispatch({ type: "SET_DOCUMENT", document }),
    [],
  );

  const undo = useCallback(() => dispatch({ type: "UNDO" }), []);
  const redo = useCallback(() => dispatch({ type: "REDO" }), []);

  return {
    sections,
    globalStyle,
    selectedSectionId,
    selectedSection,
    compiledHtml,
    canUndo,
    canRedo,
    dispatch,
    addSection,
    removeSection,
    moveSection,
    duplicateSection,
    updateSection,
    selectSection,
    updateGlobalStyle,
    setDocument,
    undo,
    redo,
  };
}
