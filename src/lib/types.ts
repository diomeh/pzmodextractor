export interface ModEntry {
  publishedfileid: string;
  title: string;
  previewUrl: string;
  description: string;
  ok: boolean;
  ids: string[];
  names: string[];
}

export type SourceKind = 'collection' | 'custom';

export interface Source {
  key: string;
  kind: SourceKind;
  title: string;
  sourceId: string | null;
  url: string;
  items: ModEntry[];
  fetchedAt: string | null;
  open: boolean;
  draft: string;
  draftLoading: boolean;
  draftError: string;
  loadError: string;
}

export interface CuratedItem {
  key: string;
  publishedfileid: string;
  title: string;
  name: string;
  sources: string[];
}

export interface OutputRow {
  key: string;
  label: string;
  value: string;
  blockText: string;
}

export type Screen = 'landing' | 'results';
export type FilterKey = 'multiOnly' | 'hideAdded' | 'hideFailed';

export interface AppState {
  screen: Screen;
  loading: boolean;
  errorMsg: string;
  inputValue: string;
  sources: Source[];
  selectedModId: string | null;
  selectedCandidateIdx: number;
  checkedNames: Set<string>;
  expandedDescIds: Set<string>;
  curated: CuratedItem[];
  selectedCuratedIdx: number | null;
  search: string;
  filterMultiOnly: boolean;
  filterHideAdded: boolean;
  filterHideFailed: boolean;
  b42Format: boolean;
  mobileTab: 'workshop' | 'modid';
  copiedRow: string | null;
  toast: string | null;
  openRows: Record<string, boolean>;
  perLineRows: Record<string, boolean>;
}

export interface ExportedSource {
  key: string;
  kind: SourceKind;
  title: string;
  sourceId: string | null;
  url: string;
  items: ModEntry[];
  fetchedAt: string | null;
}

export interface ModExtractorExportPayload {
  schemaVersion: number;
  exportedAt: string;
  sources: ExportedSource[];
  curated: CuratedItem[];
  b42Format: boolean;
}
