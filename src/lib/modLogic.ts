import type { AppState, CuratedItem, ModEntry, OutputRow, Source } from './types';

export function randomSuffix(): string {
  return Math.random().toString(36).slice(2);
}

export function createInitialState(): AppState {
  return {
    screen: 'landing',
    loading: false,
    errorMsg: '',
    inputValue: '',
    sources: [],
    selectedModId: null,
    selectedCandidateIdx: 0,
    checkedNames: new Set(),
    expandedDescIds: new Set(),
    curated: [],
    selectedCuratedIdx: null,
    search: '',
    filterMultiOnly: false,
    filterHideAdded: false,
    filterHideFailed: false,
    b42Format: false,
    mobileTab: 'workshop',
    copiedRow: null,
    toast: null,
    openRows: {},
    perLineRows: {},
  };
}

export function makeCustomSource(): Source {
  return {
    key: 'custom',
    kind: 'custom',
    title: 'Custom items',
    sourceId: null,
    url: '',
    items: [],
    fetchedAt: null,
    open: true,
    draft: '',
    draftLoading: false,
    draftError: '',
    loadError: '',
  };
}

export function ensureCustomSource(sources: Source[]): Source[] {
  if (sources.some((s) => s.kind === 'custom')) return sources;
  return [...sources, makeCustomSource()];
}

export function findModAcrossSources(sources: Source[], id: string): ModEntry | undefined {
  for (const source of sources) {
    const mod = source.items.find((m) => m.publishedfileid === id);
    if (mod) return mod;
  }
  return undefined;
}

export function candidateKey(publishedfileid: string, name: string): string {
  return `${publishedfileid}::${name}`;
}

// Mirrors the server's extractCollectionId (src/lib/server/steamApi.ts) just enough to
// build a link back to the Steam Workshop collection page for whatever was submitted.
export function toCollectionUrl(input: string): string {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) {
    return `https://steamcommunity.com/sharedfiles/filedetails/?id=${trimmed}`;
  }
  try {
    const url = new URL(trimmed);
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.searchParams.get('id')) {
      return url.href;
    }
  } catch {
    // not an absolute URL
  }
  return '';
}

// Splits pasted text into collection tokens, item tokens, and unrecognised leftovers.
// A token that looks like a full workshop filedetails link gets its own source panel
// (kind:'collection'); a bare numeric ID is treated as a one-off item and merged into
// the persistent Custom source instead.
export function classifyInput(text: string): { collections: string[]; items: string[]; bad: string[] } {
  const parts = String(text || '')
    .split(/[,\n]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const collections: string[] = [];
  const items: string[] = [];
  const bad: string[] = [];
  parts.forEach((p) => {
    const id = (p.match(/\d{6,}/) || [])[0];
    if (!id) {
      bad.push(p);
      return;
    }
    if (/sharedfiles\/filedetails/.test(p)) collections.push(id);
    else items.push(id);
  });
  return { collections, items, bad };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function buildExportFilename(): string {
  const now = new Date();
  const stamp =
    `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}` +
    `-${pad2(now.getHours())}${pad2(now.getMinutes())}`;
  return `pz-modlist-${stamp}.json`;
}

export function sourceLabel(source: Source): string {
  return source.kind === 'custom' ? 'Custom' : source.title;
}

export interface ModFilters {
  search: string;
  filterMultiOnly: boolean;
  filterHideAdded: boolean;
  filterHideFailed: boolean;
}

export function matchesFilters(m: ModEntry, addedIds: Set<string>, filters: ModFilters): boolean {
  const search = filters.search.toLowerCase();
  return (
    (!search || m.title.toLowerCase().includes(search) || m.publishedfileid.includes(filters.search)) &&
    (!filters.filterMultiOnly || m.names.length > 1) &&
    (!filters.filterHideAdded || !addedIds.has(m.publishedfileid)) &&
    (!filters.filterHideFailed || (m.ok && m.names.length > 0))
  );
}

export function buildOutputRow(key: string, label: string, value: string, sep: string, perLine: boolean): OutputRow {
  const items = value ? value.split(sep) : [];
  const blockText = perLine
    ? `${label}\n${items.map((item, i) => (i < items.length - 1 ? item + sep.trim() : item)).join('\n')}`
    : label + value;
  return { key, label, value, blockText };
}

export function outputRows(
  sources: Source[],
  curated: CuratedItem[],
  b42Format: boolean,
  perLineRows: Record<string, boolean>,
): OutputRow[] {
  const allMods = sources.flatMap((s) => s.items);
  const workshopItemsValue = Array.from(new Set(allMods.flatMap((mod) => mod.ids))).join(';');
  const modsValue = curated.map((c) => (b42Format ? '\\' : '') + c.name).join(';');
  const modListValue = curated.map((c, i) => `${i + 1}. ${c.title} (${c.name})`).join(', ');
  return [
    buildOutputRow('workshop', 'WorkshopItems=', workshopItemsValue, ';', !!perLineRows['workshop']),
    buildOutputRow('mods', 'Mods=', modsValue, ';', !!perLineRows['mods']),
    buildOutputRow('modlist', 'ModList=', modListValue, ', ', !!perLineRows['modlist']),
  ];
}

// Adds/updates a curated entry for (mod, name), tagging it with sourceLabel. If the
// entry already exists, the source label is merged into its `sources` list instead of
// creating a duplicate; `added` reports whether a brand-new entry was created (as
// opposed to just tagging an existing one with another source).
export function mergeCurated(
  curated: CuratedItem[],
  mod: ModEntry,
  name: string,
  label: string,
): { curated: CuratedItem[]; added: boolean } {
  const ck = candidateKey(mod.publishedfileid, name);
  const idx = curated.findIndex((c) => candidateKey(c.publishedfileid, c.name) === ck);
  if (idx !== -1) {
    if (curated[idx].sources.includes(label)) return { curated, added: false };
    const next = [...curated];
    next[idx] = { ...next[idx], sources: [...next[idx].sources, label] };
    return { curated: next, added: false };
  }
  const item: CuratedItem = {
    key: `${mod.publishedfileid}-${name}-${Date.now()}-${randomSuffix()}`,
    publishedfileid: mod.publishedfileid,
    title: mod.title,
    name,
    sources: [label],
  };
  return { curated: [...curated, item], added: true };
}
