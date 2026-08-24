import { useEffect, useReducer } from 'preact/hooks';
import type { AppState, CuratedItem, FilterKey, ModEntry, ModExtractorExportPayload, Source } from '../lib/types';
import {
  candidateKey,
  createInitialState,
  ensureCustomSource,
  findModAcrossSources,
  mergeCurated,
  outputRows,
  randomSuffix,
  sourceLabel,
  toCollectionUrl,
} from '../lib/modLogic';
import { useSteamFetch } from './useSteamFetch';
import { useExportImport } from './useExportImport';

export type Action =
  | { type: 'SELECT_MOD'; id: string }
  | { type: 'QUICK_ADD'; id: string; srcKey: string }
  | { type: 'TOGGLE_CANDIDATE'; id: string; idx: number }
  | { type: 'ADD_ALL_FROM'; sourceKey: string; singleOnly: boolean }
  | { type: 'CLEAR_SOURCE'; sourceKey: string }
  | { type: 'ADD_ALL'; singleOnly: boolean }
  | { type: 'CLEAR_ALL' }
  | { type: 'RESET' }
  | { type: 'REMOVE_CURATED'; idx: number }
  | { type: 'MOVE_CURATED'; idx: number; dir: number }
  | { type: 'REORDER_CURATED'; from: number; to: number }
  | { type: 'SELECT_CURATED'; idx: number | null }
  | { type: 'TOGGLE_FILTER'; filter: FilterKey }
  | { type: 'TOGGLE_OPEN_ROW'; key: string }
  | { type: 'TOGGLE_PER_LINE'; key: string }
  | { type: 'TOGGLE_DESCRIPTION'; id: string }
  | { type: 'TOGGLE_SOURCE_OPEN'; key: string }
  | { type: 'REMOVE_SOURCE'; key: string }
  | { type: 'SET_SOURCE_DRAFT'; key: string; value: string }
  | { type: 'SET_SEARCH'; value: string }
  | { type: 'SET_INPUT_VALUE'; value: string }
  | { type: 'TOGGLE_B42' }
  | { type: 'SELECT_TAB'; tab: 'workshop' | 'modid' }
  | { type: 'SET_COPIED_ROW'; key: string }
  | { type: 'CLEAR_COPIED_ROW' }
  | { type: 'SHOW_TOAST'; message: string }
  | { type: 'HIDE_TOAST' }
  | { type: 'SET_ERROR'; message: string }
  | { type: 'SUBMIT_START' }
  | {
      type: 'SUBMIT_RESULT';
      cls: { collections: string[]; items: string[]; bad: string[] };
      collectionResults: PromiseSettledResult<{ mods: ModEntry[]; source?: { id: string; title: string; url: string } }>[];
      itemResults: PromiseSettledResult<{ mods: ModEntry[]; source?: { id: string; title: string; url: string } }>[];
    }
  | { type: 'ADD_TO_CUSTOM_START'; key: string }
  | { type: 'ADD_TO_CUSTOM_SUCCESS'; key: string; mod: ModEntry }
  | { type: 'ADD_TO_CUSTOM_ERROR'; key: string; error: string }
  | { type: 'IMPORT_PAYLOAD'; payload: ModExtractorExportPayload };

// Adds every checked (but not-yet-curated) candidate name for a mod. If none are
// checked, falls back to the single name at idxFallback so the plain "+ Add" click
// on a single-ID mod (or a multi-ID mod with nothing checked yet) still works.
function applyQuickAdd(state: AppState, id: string, srcKey: string): AppState {
  const source = state.sources.find((s) => s.key === srcKey);
  const mod = source?.items.find((m) => m.publishedfileid === id);
  if (!source || !mod || !mod.ok || mod.names.length === 0) return state;

  const idxFallback = state.selectedModId === id ? state.selectedCandidateIdx : 0;
  const label = sourceLabel(source);
  const checked = mod.names.filter((name) => state.checkedNames.has(candidateKey(mod.publishedfileid, name)));
  const namesToAdd = checked.length > 0 ? checked : [mod.names[Math.min(idxFallback, mod.names.length - 1)]];

  let curated = state.curated;
  let addedCount = 0;
  let lastName = '';
  namesToAdd.forEach((name) => {
    const result = mergeCurated(curated, mod, name, label);
    curated = result.curated;
    if (result.added) {
      addedCount += 1;
      lastName = name;
    }
  });

  const nextChecked = new Set(state.checkedNames);
  namesToAdd.forEach((name) => nextChecked.delete(candidateKey(mod.publishedfileid, name)));
  if (curated === state.curated && nextChecked.size === state.checkedNames.size) return state;

  const toast = addedCount === 1 ? `Added ${lastName}.` : addedCount > 1 ? `Added ${addedCount} mods.` : state.toast;
  return { ...state, curated, checkedNames: nextChecked, toast };
}

function applyAddAllFrom(state: AppState, sourceKey: string, singleOnly: boolean): AppState {
  const source = state.sources.find((s) => s.key === sourceKey);
  if (!source) return state;
  const existing = new Set(state.curated.map((c) => c.publishedfileid));
  const label = sourceLabel(source);
  const additions: CuratedItem[] = source.items
    .filter((m) => m.ok && (singleOnly ? m.names.length === 1 : m.names.length > 0) && !existing.has(m.publishedfileid))
    .map((m) => ({
      key: `${m.publishedfileid}-${m.names[0]}-${Date.now()}-${randomSuffix()}`,
      publishedfileid: m.publishedfileid,
      title: m.title,
      name: m.names[0],
      sources: [label],
    }));
  if (!additions.length) return { ...state, toast: 'Nothing new to add.' };
  return {
    ...state,
    curated: [...state.curated, ...additions],
    toast: `Added ${additions.length} mod${additions.length === 1 ? '' : 's'}.`,
  };
}

function applyAddAll(state: AppState, singleOnly: boolean): AppState {
  const existing = new Set(state.curated.map((c) => c.publishedfileid));
  const additions: CuratedItem[] = [];
  state.sources.forEach((src) => {
    const label = sourceLabel(src);
    src.items.forEach((mod) => {
      if (!mod.ok || existing.has(mod.publishedfileid)) return;
      if (singleOnly ? mod.names.length !== 1 : mod.names.length === 0) return;
      existing.add(mod.publishedfileid);
      additions.push({
        key: `${mod.publishedfileid}-${mod.names[0]}-${Date.now()}-${randomSuffix()}`,
        publishedfileid: mod.publishedfileid,
        title: mod.title,
        name: mod.names[0],
        sources: [label],
      });
    });
  });
  if (!additions.length) return { ...state, toast: 'Nothing new to add.' };
  return {
    ...state,
    curated: [...state.curated, ...additions],
    toast: `Added ${additions.length} mod${additions.length === 1 ? '' : 's'}.`,
  };
}

// Removing this source's tag doesn't delete a curated entry outright if another
// source also contributed it — only the tag for *this* source is dropped, and the
// entry itself is removed only once no source tag is left on it.
function applyClearSource(state: AppState, sourceKey: string): AppState {
  const source = state.sources.find((s) => s.key === sourceKey);
  if (!source) return state;
  const label = sourceLabel(source);
  const itemIds = new Set(source.items.map((m) => m.publishedfileid));
  let untagged = 0;
  const next = state.curated
    .map((c) => {
      if (!itemIds.has(c.publishedfileid) || !c.sources.includes(label)) return c;
      untagged += 1;
      return { ...c, sources: c.sources.filter((s) => s !== label) };
    })
    .filter((c) => c.sources.length > 0);
  if (untagged === 0) return { ...state, toast: 'Nothing to clear.' };
  return { ...state, curated: next, selectedCuratedIdx: null, toast: `Cleared ${untagged} mod${untagged === 1 ? '' : 's'} from ${label}.` };
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SELECT_MOD':
      if (state.selectedModId === action.id) return state;
      return { ...state, selectedModId: action.id, selectedCandidateIdx: 0 };

    case 'QUICK_ADD':
      return applyQuickAdd(state, action.id, action.srcKey);

    case 'TOGGLE_CANDIDATE': {
      const mod = findModAcrossSources(state.sources, action.id);
      if (!mod || !mod.ok || !mod.names[action.idx]) return state;
      const name = mod.names[action.idx];
      if (state.curated.some((c) => c.publishedfileid === action.id && c.name === name)) return state;
      const key = candidateKey(action.id, name);
      const next = new Set(state.checkedNames);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...state, checkedNames: next };
    }

    case 'ADD_ALL_FROM':
      return applyAddAllFrom(state, action.sourceKey, action.singleOnly);

    case 'CLEAR_SOURCE':
      return applyClearSource(state, action.sourceKey);

    case 'ADD_ALL':
      return applyAddAll(state, action.singleOnly);

    case 'CLEAR_ALL':
      if (state.curated.length === 0) return state;
      return { ...state, curated: [], selectedCuratedIdx: null, toast: 'Cleared modlist.' };

    case 'RESET':
      return createInitialState();

    case 'REMOVE_CURATED': {
      const arr = [...state.curated];
      const [removed] = arr.splice(action.idx, 1);
      if (!removed) return state;
      return { ...state, curated: arr, selectedCuratedIdx: null, toast: `Removed ${removed.name}.` };
    }

    case 'MOVE_CURATED': {
      const newIdx = action.idx + action.dir;
      if (newIdx < 0 || newIdx >= state.curated.length) return state;
      const arr = [...state.curated];
      [arr[action.idx], arr[newIdx]] = [arr[newIdx], arr[action.idx]];
      return { ...state, curated: arr, selectedCuratedIdx: newIdx };
    }

    case 'REORDER_CURATED': {
      if (action.from === action.to) return state;
      const arr = [...state.curated];
      const [item] = arr.splice(action.from, 1);
      arr.splice(action.to, 0, item);
      return { ...state, curated: arr, selectedCuratedIdx: action.to };
    }

    case 'SELECT_CURATED':
      return { ...state, selectedCuratedIdx: action.idx };

    case 'TOGGLE_FILTER':
      if (action.filter === 'multiOnly') return { ...state, filterMultiOnly: !state.filterMultiOnly };
      if (action.filter === 'hideAdded') return { ...state, filterHideAdded: !state.filterHideAdded };
      return { ...state, filterHideFailed: !state.filterHideFailed };

    case 'TOGGLE_OPEN_ROW':
      return { ...state, openRows: { ...state.openRows, [action.key]: !state.openRows[action.key] } };

    case 'TOGGLE_PER_LINE':
      return { ...state, perLineRows: { ...state.perLineRows, [action.key]: !state.perLineRows[action.key] } };

    case 'TOGGLE_DESCRIPTION': {
      const next = new Set(state.expandedDescIds);
      if (next.has(action.id)) next.delete(action.id);
      else next.add(action.id);
      return { ...state, expandedDescIds: next };
    }

    case 'TOGGLE_SOURCE_OPEN':
      return { ...state, sources: state.sources.map((s) => (s.key === action.key ? { ...s, open: !s.open } : s)) };

    case 'REMOVE_SOURCE':
      return { ...state, sources: state.sources.filter((s) => s.key !== action.key) };

    case 'SET_SOURCE_DRAFT':
      return {
        ...state,
        sources: state.sources.map((s) => (s.key === action.key ? { ...s, draft: action.value, draftError: '' } : s)),
      };

    case 'SET_SEARCH':
      return { ...state, search: action.value };

    case 'SET_INPUT_VALUE':
      return { ...state, inputValue: action.value };

    case 'TOGGLE_B42':
      return { ...state, b42Format: !state.b42Format };

    case 'SELECT_TAB':
      return { ...state, mobileTab: action.tab };

    case 'SET_COPIED_ROW':
      return { ...state, copiedRow: action.key, toast: 'Copied to clipboard.' };

    case 'CLEAR_COPIED_ROW':
      return { ...state, copiedRow: null };

    case 'SHOW_TOAST':
      return { ...state, toast: action.message };

    case 'HIDE_TOAST':
      return { ...state, toast: null };

    case 'SET_ERROR':
      return { ...state, errorMsg: action.message };

    case 'SUBMIT_START':
      return { ...state, loading: true, errorMsg: '' };

    case 'SUBMIT_RESULT':
      return applySubmitResult(state, action);

    case 'ADD_TO_CUSTOM_START':
      return {
        ...state,
        sources: state.sources.map((s) => (s.key === action.key ? { ...s, draftLoading: true, draftError: '' } : s)),
      };

    case 'ADD_TO_CUSTOM_SUCCESS':
      return {
        ...state,
        sources: state.sources.map((s) => {
          if (s.key !== action.key) return s;
          const already = s.items.some((m) => m.publishedfileid === action.mod.publishedfileid);
          return {
            ...s,
            draft: '',
            draftLoading: false,
            draftError: '',
            items: already ? s.items : [...s.items, action.mod],
            fetchedAt: new Date().toISOString(),
          };
        }),
        toast: `Added ${action.mod.title} to Custom.`,
      };

    case 'ADD_TO_CUSTOM_ERROR':
      return {
        ...state,
        sources: state.sources.map((s) => (s.key === action.key ? { ...s, draftLoading: false, draftError: action.error } : s)),
      };

    case 'IMPORT_PAYLOAD': {
      const sources: Source[] = action.payload.sources.map((s) => ({
        ...s,
        open: true,
        draft: '',
        draftLoading: false,
        draftError: '',
        loadError: '',
      }));
      return {
        ...state,
        loading: false,
        errorMsg: '',
        screen: 'results',
        sources,
        selectedModId: null,
        selectedCandidateIdx: 0,
        checkedNames: new Set(),
        expandedDescIds: new Set(),
        curated: action.payload.curated,
        selectedCuratedIdx: null,
        search: '',
        b42Format: action.payload.b42Format,
        toast: 'Modlist imported.',
      };
    }

    default:
      return state;
  }
}

// Split out of the reducer body only because it's the single largest case (folds
// two Promise.allSettled results plus the persistent Custom source into `sources`)
// — kept here rather than in lib/modLogic.ts since it directly mirrors the
// SUBMIT_RESULT action's shape.
function applySubmitResult(state: AppState, action: Extract<Action, { type: 'SUBMIT_RESULT' }>): AppState {
  const { cls, collectionResults, itemResults } = action;
  let sources = state.sources;
  let addedCollectionCount = 0;

  collectionResults.forEach((result, i) => {
    const token = cls.collections[i];
    if (result.status === 'fulfilled') {
      const { mods, source } = result.value;
      sources = [
        ...sources,
        {
          key: `c-${Date.now()}-${randomSuffix()}`,
          kind: 'collection',
          title: source?.title || `Collection ${token}`,
          sourceId: source?.id || token,
          url: source?.url || toCollectionUrl(token),
          items: mods,
          fetchedAt: new Date().toISOString(),
          open: true,
          draft: '',
          draftLoading: false,
          draftError: '',
          loadError: '',
        },
      ];
      addedCollectionCount += 1;
    } else {
      sources = [
        ...sources,
        {
          key: `c-${Date.now()}-${randomSuffix()}`,
          kind: 'collection',
          title: `Collection ${token}`,
          sourceId: token,
          url: toCollectionUrl(token),
          items: [],
          fetchedAt: null,
          open: true,
          draft: '',
          draftLoading: false,
          draftError: '',
          loadError: result.reason instanceof Error ? result.reason.message : 'Failed to load this collection.',
        },
      ];
    }
  });

  sources = ensureCustomSource(sources);
  let itemAdds = 0;
  let itemFailures = 0;
  itemResults.forEach((result, i) => {
    if (result.status !== 'fulfilled' || result.value.mods.length === 0) {
      itemFailures += 1;
      return;
    }
    const { mods, source } = result.value;
    if (mods.length > 1) {
      // The "item" token turned out to actually be a collection ID (Steam's
      // GetCollectionDetails returns every child, not just the ID itself) —
      // give it its own source panel like an explicit collection link would,
      // instead of silently dropping everything but the first mod.
      const token = cls.items[i];
      sources = [
        ...sources,
        {
          key: `c-${Date.now()}-${randomSuffix()}`,
          kind: 'collection',
          title: source?.title || `Collection ${token}`,
          sourceId: source?.id || token,
          url: source?.url || toCollectionUrl(token),
          items: mods,
          fetchedAt: new Date().toISOString(),
          open: true,
          draft: '',
          draftLoading: false,
          draftError: '',
          loadError: '',
        },
      ];
      addedCollectionCount += 1;
      return;
    }
    const mod = mods[0];
    sources = sources.map((s) => {
      if (s.kind !== 'custom') return s;
      if (s.items.some((m) => m.publishedfileid === mod.publishedfileid)) return s;
      return { ...s, items: [...s.items, mod], fetchedAt: new Date().toISOString() };
    });
    itemAdds += 1;
  });

  const errorParts: string[] = [];
  if (itemFailures > 0) errorParts.push(`${itemFailures} item${itemFailures === 1 ? '' : 's'} could not be loaded.`);

  let toast = state.toast;
  const addedTotal = addedCollectionCount + itemAdds;
  if (addedTotal > 0) {
    const parts: string[] = [];
    if (addedCollectionCount) parts.push(`${addedCollectionCount} collection${addedCollectionCount === 1 ? '' : 's'}`);
    if (itemAdds) parts.push(`${itemAdds} item${itemAdds === 1 ? '' : 's'}`);
    toast = `Added ${parts.join(' and ')}.`;
  }

  return {
    ...state,
    loading: false,
    errorMsg: errorParts.join(' '),
    screen: 'results',
    inputValue: '',
    sources,
    toast,
  };
}


export function useModExtractor() {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const steam = useSteamFetch(state, dispatch);
  const io = useExportImport(state, dispatch);

  // A new toast replaces any timer left over from the previous one — the effect's
  // cleanup fires (clearing the old timeout) whenever `state.toast` changes identity,
  // before the new timeout is scheduled, so there's no need to track a toast id.
  useEffect(() => {
    if (!state.toast) return;
    const t = setTimeout(() => dispatch({ type: 'HIDE_TOAST' }), 1600);
    return () => clearTimeout(t);
  }, [state.toast]);

  useEffect(() => {
    if (!state.copiedRow) return;
    const t = setTimeout(() => dispatch({ type: 'CLEAR_COPIED_ROW' }), 1200);
    return () => clearTimeout(t);
  }, [state.copiedRow]);

  function copyRow(key: string): void {
    const rows = outputRows(state.sources, state.curated, state.b42Format, state.perLineRows);
    const row = rows.find((r) => r.key === key);
    if (!row) return;
    const text = row.blockText;

    const showCopied = () => dispatch({ type: 'SET_COPIED_ROW', key });
    const fallback = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        // clipboard fallback best-effort only
      }
      showCopied();
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(showCopied).catch(fallback);
    } else {
      fallback();
    }
  }

  const actions = {
    selectMod: (id: string) => dispatch({ type: 'SELECT_MOD', id }),
    quickAdd: (id: string, srcKey: string) => dispatch({ type: 'QUICK_ADD', id, srcKey }),
    toggleCandidate: (id: string, idx: number) => dispatch({ type: 'TOGGLE_CANDIDATE', id, idx }),
    addAllFrom: (sourceKey: string) => dispatch({ type: 'ADD_ALL_FROM', sourceKey, singleOnly: false }),
    addSingleFrom: (sourceKey: string) => dispatch({ type: 'ADD_ALL_FROM', sourceKey, singleOnly: true }),
    clearSource: (sourceKey: string) => dispatch({ type: 'CLEAR_SOURCE', sourceKey }),
    addAll: () => dispatch({ type: 'ADD_ALL', singleOnly: false }),
    addAllSingle: () => dispatch({ type: 'ADD_ALL', singleOnly: true }),
    clearAll: () => dispatch({ type: 'CLEAR_ALL' }),
    reset: () => dispatch({ type: 'RESET' }),
    removeCuratedAt: (idx: number) => dispatch({ type: 'REMOVE_CURATED', idx }),
    moveCurated: (idx: number, dir: number) => dispatch({ type: 'MOVE_CURATED', idx, dir }),
    reorderCurated: (from: number, to: number) => dispatch({ type: 'REORDER_CURATED', from, to }),
    selectCurated: (idx: number | null) => dispatch({ type: 'SELECT_CURATED', idx }),
    toggleFilter: (filter: FilterKey) => dispatch({ type: 'TOGGLE_FILTER', filter }),
    setSearch: (value: string) => dispatch({ type: 'SET_SEARCH', value }),
    setInputValue: (value: string) => dispatch({ type: 'SET_INPUT_VALUE', value }),
    toggleOpenRow: (key: string) => dispatch({ type: 'TOGGLE_OPEN_ROW', key }),
    togglePerLine: (key: string) => dispatch({ type: 'TOGGLE_PER_LINE', key }),
    toggleDescription: (id: string) => dispatch({ type: 'TOGGLE_DESCRIPTION', id }),
    toggleSourceOpen: (key: string) => dispatch({ type: 'TOGGLE_SOURCE_OPEN', key }),
    removeSource: (key: string) => dispatch({ type: 'REMOVE_SOURCE', key }),
    setSourceDraft: (key: string, value: string) => dispatch({ type: 'SET_SOURCE_DRAFT', key, value }),
    toggleB42: () => dispatch({ type: 'TOGGLE_B42' }),
    selectTab: (tab: 'workshop' | 'modid') => dispatch({ type: 'SELECT_TAB', tab }),
    copyRow,
    addToCustom: steam.addToCustom,
  };

  return { state, dispatch, actions, ...steam, ...io };
}

export type ModExtractorHandle = ReturnType<typeof useModExtractor>;
export type ModExtractorActions = ModExtractorHandle['actions'];
