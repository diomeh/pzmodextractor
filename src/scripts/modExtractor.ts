interface ModEntry {
  publishedfileid: string;
  title: string;
  previewUrl: string;
  description: string;
  ok: boolean;
  ids: string[];
  names: string[];
}

interface CuratedItem {
  key: string;
  publishedfileid: string;
  title: string;
  name: string;
}

interface OutputRow {
  key: string;
  label: string;
  value: string;
  blockText: string;
}

type Screen = 'landing' | 'results';
type FilterKey = 'multiOnly' | 'hideAdded' | 'hideFailed';

interface AppState {
  screen: Screen;
  loading: boolean;
  errorMsg: string;
  inputValue: string;
  mods: ModEntry[];
  selectedModId: string | null;
  selectedCandidateIdx: number;
  checkedNames: Set<string>;
  curated: CuratedItem[];
  selectedCuratedIdx: number | null;
  search: string;
  filterMultiOnly: boolean;
  filterHideAdded: boolean;
  filterHideFailed: boolean;
  b42Format: boolean;
  mobileTab: 'workshop' | 'modid';
  copiedRow: string | null;
  collectionUrl: string;
  openRows: Record<string, boolean>;
  perLineRows: Record<string, boolean>;
  fetchedAt: string | null;
}

const EXPORT_SCHEMA_VERSION = 1;

interface ModExtractorExportPayload {
  schemaVersion: number;
  exportedAt: string;
  fetchedAt: string | null;
  collectionUrl: string;
  inputValue: string;
  b42Format: boolean;
  mods: ModEntry[];
  curated: CuratedItem[];
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---- BBCode -> safe HTML for Steam Workshop descriptions ----

type BBTag = 'b' | 'i' | 'u' | 's' | 'strike' | 'h1' | 'h2' | 'h3' | 'url' | 'img' | 'hr' | 'list' | 'olist' | 'li';

interface BBTextNode {
  type: 'text';
  value: string;
}

interface BBElementNode {
  type: BBTag | 'root';
  arg?: string;
  children: BBNode[];
}

type BBNode = BBTextNode | BBElementNode;

const BB_ALLOWED_TAGS: ReadonlySet<string> = new Set([
  'b',
  'i',
  'u',
  's',
  'strike',
  'h1',
  'h2',
  'h3',
  'url',
  'img',
  'hr',
  'list',
  'olist',
]);
const BB_BLOCK_TAGS: ReadonlySet<string> = new Set(['h1', 'h2', 'h3', 'list', 'olist', 'hr']);

function parseBBCode(raw: string): BBElementNode {
  const root: BBElementNode = { type: 'root', children: [] };
  const stack: BBElementNode[] = [root];
  const tagRe = /\[(\/)?([a-zA-Z0-9]+|\*)(=[^\]]*)?\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const pushText = (text: string) => {
    if (!text) return;
    stack[stack.length - 1].children.push({ type: 'text', value: text });
  };

  while ((match = tagRe.exec(raw))) {
    pushText(raw.slice(lastIndex, match.index));
    lastIndex = tagRe.lastIndex;

    const isClose = !!match[1];
    const rawName = match[2].toLowerCase();
    const arg = match[3] ? match[3].slice(1) : undefined;

    if (rawName === '*') {
      const top = stack[stack.length - 1];
      if (top.type === 'li') stack.pop();
      const container = stack[stack.length - 1];
      if (container.type === 'list' || container.type === 'olist') {
        const li: BBElementNode = { type: 'li', children: [] };
        container.children.push(li);
        stack.push(li);
      } else {
        pushText('[*]');
      }
      continue;
    }

    if (!BB_ALLOWED_TAGS.has(rawName)) {
      pushText(match[0]);
      continue;
    }

    if (rawName === 'hr') {
      if (!isClose) stack[stack.length - 1].children.push({ type: 'hr', children: [] });
      continue;
    }

    if (!isClose) {
      const node: BBElementNode = { type: rawName as BBTag, arg, children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    } else {
      let idx = -1;
      for (let i = stack.length - 1; i >= 1; i--) {
        if (stack[i].type === rawName) {
          idx = i;
          break;
        }
      }
      if (idx !== -1) stack.length = idx;
    }
  }
  pushText(raw.slice(lastIndex));
  return root;
}

function bbExtractText(nodes: BBNode[]): string {
  return nodes.map((n) => (n.type === 'text' ? n.value : bbExtractText(n.children))).join('');
}

function bbSafeUrl(value: string): string | null {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
  } catch {
    // not a valid absolute URL
  }
  return null;
}

function bbRenderNodes(nodes: BBNode[]): string {
  return nodes.map(bbRenderNode).join('');
}

function bbRenderNode(node: BBNode): string {
  if (node.type === 'text') return esc(node.value).replace(/\n/g, '<br>');

  switch (node.type) {
    case 'b':
      return `<strong>${bbRenderNodes(node.children)}</strong>`;
    case 'i':
      return `<em>${bbRenderNodes(node.children)}</em>`;
    case 'u':
      return `<u>${bbRenderNodes(node.children)}</u>`;
    case 's':
    case 'strike':
      return `<s>${bbRenderNodes(node.children)}</s>`;
    case 'url': {
      const href = bbSafeUrl(node.arg ?? bbExtractText(node.children));
      const inner = bbRenderNodes(node.children);
      return href
        ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
        : inner;
    }
    case 'img': {
      const src = bbSafeUrl(bbExtractText(node.children));
      return src
        ? `<img src="${esc(src)}" alt="" loading="lazy" style="max-width:100%;border-radius:0;margin:4px 0;" />`
        : '';
    }
    case 'h1':
      return `<div style="font-size:15px;font-weight:800;color:#e8e8e8;margin:10px 0 4px;">${bbRenderNodes(node.children)}</div>`;
    case 'h2':
      return `<div style="font-size:13px;font-weight:700;color:#e8e8e8;margin:8px 0 4px;">${bbRenderNodes(node.children)}</div>`;
    case 'h3':
      return `<div style="font-size:12px;font-weight:700;color:#999999;margin:6px 0 3px;">${bbRenderNodes(node.children)}</div>`;
    case 'hr':
      return `<hr style="border:none;border-top:1px solid #555555;margin:8px 0;" />`;
    case 'list':
    case 'olist': {
      const tag = node.type === 'olist' ? 'ol' : 'ul';
      const items = node.children
        .filter((c): c is BBElementNode => c.type === 'li')
        .map((li) => `<li>${bbRenderNodes(li.children)}</li>`)
        .join('');
      return `<${tag} style="margin:4px 0 8px;padding-left:18px;">${items}</${tag}>`;
    }
    default:
      return bbRenderNodes(node.children);
  }
}

function bbRenderParagraph(paragraph: string): string {
  const tree = parseBBCode(paragraph);
  const meaningful = tree.children.filter((c) => !(c.type === 'text' && !c.value.trim()));
  if (meaningful.length === 1 && meaningful[0].type !== 'text' && BB_BLOCK_TAGS.has(meaningful[0].type)) {
    return bbRenderNode(meaningful[0]);
  }
  return `<p style="margin:0 0 8px;">${bbRenderNodes(tree.children)}</p>`;
}

function renderDescription(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '<span>No description available.</span>';
  return trimmed
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(bbRenderParagraph)
    .join('');
}

// Fuzzy hint only: Steam Workshop has no structured way for an author to mark a
// multi-ID item's IDs as alternative branches, so this just scans the description's
// prose for the phrasing authors commonly use to warn about it (e.g. Authentic Z's
// "only use ONE" branch split). False negatives/positives are expected and fine —
// it's a hint, not a guarantee.
const EXCLUSIVE_HINT_PATTERN =
  /only (?:use|enable|run|activate) one|only one (?:should|can) be|choose one|pick one|mutually exclusive|do not (?:use|enable|run) (?:both|more than one)|not (?:both|together)|branch(?:es)?\b/i;

function looksExclusive(description: string): boolean {
  return EXCLUSIVE_HINT_PATTERN.test(description);
}

function filterPillStyle(active: boolean): string {
  return `flex-shrink-0 whitespace-nowrap text-[11px] font-semibold px-[9px] py-[5px] rounded-none cursor-pointer border ${active ? 'border-success bg-success/15 text-success' : 'border-border-standard bg-knox-void text-text-muted'}`;
}

function tabStyle(active: boolean): string {
  return `flex-1 p-[10px] rounded-none text-xs font-bold cursor-pointer border ${active ? 'border-success bg-success/12 text-success' : 'border-border-standard bg-knox-void text-text-muted'}`;
}

const BTN_BASE = 'rounded-none px-[14px] py-[10px] text-xs font-bold tracking-[0.03em] cursor-pointer border';
const TEXT_BTN_STYLE = 'bg-transparent border-none text-text-muted text-xs underline cursor-pointer p-1';

function addBtnStyle(enabled: boolean): string {
  return `${BTN_BASE} ${enabled ? 'bg-success text-knox-void border-success' : 'bg-knox-void text-text-muted border-border-standard opacity-50 cursor-not-allowed'}`;
}

function removeBtnStyle(enabled: boolean): string {
  return `${BTN_BASE} ${enabled ? 'bg-knox-void text-danger border-danger' : 'bg-knox-void text-text-muted border-border-standard opacity-50 cursor-not-allowed'}`;
}

function rowStyle(selected: boolean, addable: boolean): string {
  return `flex p-[10px] rounded-none cursor-pointer border ${selected ? 'border-success bg-success/10' : 'border-transparent bg-transparent'} ${addable ? 'opacity-100' : 'opacity-55'}`;
}

function curatedRowStyle(selected: boolean): string {
  return `flex items-center gap-2 px-2.5 py-2 rounded-none cursor-pointer border ${selected ? 'border-success bg-success/10' : 'border-transparent bg-header-slate'}`;
}

function moveBtnStyle(disabled: boolean): string {
  return `bg-transparent border-none text-text-muted text-[11px] px-1 ${disabled ? 'cursor-not-allowed opacity-30' : 'cursor-pointer opacity-100'}`;
}

function headerCopyBtnStyle(active: boolean): string {
  return `rounded-none px-[13px] py-[7px] text-[11px] font-bold tracking-[0.03em] uppercase whitespace-nowrap cursor-pointer transition-[background,border-color,color] duration-[120ms] border ${active ? 'border-success bg-success/15 text-success' : 'border-border-standard bg-knox-void text-text-muted'}`;
}

function b42CheckboxStyle(active: boolean): string {
  return `w-4 h-4 flex-shrink-0 flex items-center justify-center rounded-none border transition-[background,border-color] duration-[120ms] ${active ? 'border-success bg-success' : 'border-border-standard bg-transparent'}`;
}

const B42_CHECKMARK_SVG =
  '<svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#000000" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function openRowBtnStyle(active: boolean): string {
  return `flex-shrink-0 border border-border-standard rounded-none px-3 py-1.5 text-[10px] font-bold tracking-[0.05em] uppercase cursor-pointer transition-[background,color] duration-[120ms] ${active ? 'bg-success/15 text-success' : 'bg-transparent text-text-muted'}`;
}

function rowCopyBtnStyle(active: boolean): string {
  return `flex-shrink-0 border border-border-standard rounded-none px-3 py-1.5 text-xs font-semibold cursor-pointer ${active ? 'bg-success text-knox-void' : 'bg-transparent text-success'}`;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2);
}

function candidateKey(publishedfileid: string, name: string): string {
  return `${publishedfileid}::${name}`;
}

// Mirrors the server's extractCollectionId (src/pages/api/convert.ts) just enough to
// build a link back to the Steam Workshop collection page for whatever was submitted.
function toCollectionUrl(input: string): string {
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

function buildExportPayload(state: AppState): ModExtractorExportPayload {
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    fetchedAt: state.fetchedAt,
    collectionUrl: state.collectionUrl,
    inputValue: state.inputValue,
    b42Format: state.b42Format,
    mods: state.mods,
    curated: state.curated,
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function buildExportFilename(state: AppState): string {
  const idMatch = state.collectionUrl.match(/[?&]id=(\d+)/);
  const fallbackId = /^\d+$/.test(state.inputValue.trim()) ? state.inputValue.trim() : null;
  const id = idMatch?.[1] || fallbackId || 'modlist';
  const now = new Date();
  const stamp =
    `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}` +
    `-${pad2(now.getHours())}${pad2(now.getMinutes())}`;
  return `pz-modlist-${id}-${stamp}.json`;
}

function isModEntry(value: unknown): value is ModEntry {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.publishedfileid === 'string' &&
    typeof v.title === 'string' &&
    typeof v.previewUrl === 'string' &&
    typeof v.description === 'string' &&
    typeof v.ok === 'boolean' &&
    Array.isArray(v.ids) &&
    v.ids.every((x) => typeof x === 'string') &&
    Array.isArray(v.names) &&
    v.names.every((x) => typeof x === 'string')
  );
}

function isCuratedItem(value: unknown): value is CuratedItem {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.key === 'string' &&
    typeof v.publishedfileid === 'string' &&
    typeof v.title === 'string' &&
    typeof v.name === 'string'
  );
}

function parseImportPayload(
  raw: unknown,
): { ok: true; payload: ModExtractorExportPayload } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: "This doesn't look like a PZ Mod Extractor export file." };
  }
  const v = raw as Record<string, unknown>;

  if (typeof v.schemaVersion !== 'number') {
    return { ok: false, error: "This doesn't look like a PZ Mod Extractor export file." };
  }
  if (v.schemaVersion !== EXPORT_SCHEMA_VERSION) {
    return { ok: false, error: "This file was exported from an incompatible version of this tool and can't be imported." };
  }
  if (!Array.isArray(v.mods) || !v.mods.every(isModEntry)) {
    return { ok: false, error: 'Import file is malformed (invalid mod entry).' };
  }
  if (!Array.isArray(v.curated) || !v.curated.every(isCuratedItem)) {
    return { ok: false, error: 'Import file is malformed (invalid curated entry).' };
  }
  if (
    typeof v.collectionUrl !== 'string' ||
    typeof v.inputValue !== 'string' ||
    typeof v.b42Format !== 'boolean' ||
    typeof v.exportedAt !== 'string' ||
    (v.fetchedAt !== null && typeof v.fetchedAt !== 'string')
  ) {
    return { ok: false, error: 'Import file is missing required fields.' };
  }

  return {
    ok: true,
    payload: {
      schemaVersion: v.schemaVersion,
      exportedAt: v.exportedAt,
      fetchedAt: v.fetchedAt as string | null,
      collectionUrl: v.collectionUrl,
      inputValue: v.inputValue,
      b42Format: v.b42Format,
      mods: v.mods,
      curated: v.curated,
    },
  };
}

class ModExtractorApp {
  private root: HTMLElement;
  private state: AppState;
  private dragIndex: number | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.state = {
      screen: 'landing',
      loading: false,
      errorMsg: '',
      inputValue: '',
      mods: [],
      selectedModId: null,
      selectedCandidateIdx: 0,
      checkedNames: new Set(),
      curated: [],
      selectedCuratedIdx: null,
      search: '',
      filterMultiOnly: false,
      filterHideAdded: false,
      filterHideFailed: false,
      b42Format: false,
      mobileTab: 'workshop',
      copiedRow: null,
      collectionUrl: '',
      openRows: {},
      perLineRows: {},
      fetchedAt: null,
    };

    this.root.addEventListener('click', (e) => this.handleClick(e as MouseEvent));
    this.root.addEventListener('submit', (e) => this.handleFormSubmit(e));
    this.root.addEventListener('input', (e) => this.handleInput(e));
    this.root.addEventListener('dragstart', (e) => this.handleDragStart(e as DragEvent));
    this.root.addEventListener('dragover', (e) => this.handleDragOver(e as DragEvent));
    this.root.addEventListener('drop', (e) => this.handleDrop(e as DragEvent));

    this.render();
  }

  private setState(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    this.render();
  }

  // ---- derived data ----

  private filteredMods(): ModEntry[] {
    const s = this.state;
    const addedIds = new Set(s.curated.map((c) => c.publishedfileid));
    const search = s.search.toLowerCase();
    return s.mods
      .filter((m) => !search || m.title.toLowerCase().includes(search))
      .filter((m) => !s.filterMultiOnly || m.names.length > 1)
      .filter((m) => !s.filterHideAdded || !addedIds.has(m.publishedfileid))
      .filter((m) => !s.filterHideFailed || (m.ok && m.names.length > 0));
  }

  private addable(): boolean {
    const mod = this.state.mods.find((m) => m.publishedfileid === this.state.selectedModId);
    return !!(mod && mod.ok && mod.names.length > 0);
  }

  private outputRows(): OutputRow[] {
    const s = this.state;
    const workshopItemsValue = s.mods.flatMap((m) => m.ids).join(';');
    const modsValue = s.curated.map((c) => (s.b42Format ? '\\' : '') + c.name).join(';');
    const modListValue = s.curated.map((c, i) => `${i + 1}. ${c.title} (${c.name})`).join(', ');
    return [
      this.buildOutputRow('workshop', 'WorkshopItems=', workshopItemsValue, ';'),
      this.buildOutputRow('mods', 'Mods=', modsValue, ';'),
      this.buildOutputRow('modlist', 'ModList=', modListValue, ', '),
    ];
  }

  private buildOutputRow(key: string, label: string, value: string, sep: string): OutputRow {
    const perLine = !!this.state.perLineRows[key];
    const items = value ? value.split(sep) : [];
    const blockText = perLine
      ? `${label}\n${items.map((item, i) => (i < items.length - 1 ? item + sep.trim() : item)).join('\n')}`
      : label + value;
    return { key, label, value, blockText };
  }

  // ---- state mutators ----

  private selectMod(id: string): void {
    if (this.state.selectedModId === id) return;
    this.setState({ selectedModId: id, selectedCandidateIdx: 0 });
  }

  // Adds every checked (but not-yet-curated) candidate name for a mod. If none are
  // checked, falls back to the single name at idxFallback so the plain "+ Add" click
  // on a single-ID mod (or a multi-ID mod with nothing checked yet) still works.
  private commitAdd(mod: ModEntry, idxFallback: number): void {
    if (!mod.ok || mod.names.length === 0) return;
    const checked = mod.names.filter((name) => this.state.checkedNames.has(candidateKey(mod.publishedfileid, name)));
    const namesToAdd = checked.length > 0 ? checked : [mod.names[Math.min(idxFallback, mod.names.length - 1)]];
    const existingKeys = new Set(this.state.curated.map((c) => candidateKey(c.publishedfileid, c.name)));
    const additions: CuratedItem[] = namesToAdd
      .filter((name) => !existingKeys.has(candidateKey(mod.publishedfileid, name)))
      .map((name) => ({
        key: `${mod.publishedfileid}-${name}-${Date.now()}-${randomSuffix()}`,
        publishedfileid: mod.publishedfileid,
        title: mod.title,
        name,
      }));
    const nextChecked = new Set(this.state.checkedNames);
    namesToAdd.forEach((name) => nextChecked.delete(candidateKey(mod.publishedfileid, name)));
    if (additions.length === 0 && nextChecked.size === this.state.checkedNames.size) return;
    this.setState({
      curated: additions.length ? [...this.state.curated, ...additions] : this.state.curated,
      checkedNames: nextChecked,
    });
  }

  private quickAdd(id: string): void {
    const mod = this.state.mods.find((m) => m.publishedfileid === id);
    if (!mod) return;
    const idx = this.state.selectedModId === id ? this.state.selectedCandidateIdx : 0;
    this.commitAdd(mod, idx);
  }

  private addSelected(): void {
    const mod = this.state.mods.find((m) => m.publishedfileid === this.state.selectedModId);
    if (!mod) return;
    this.commitAdd(mod, this.state.selectedCandidateIdx);
  }

  // Multi-ID items (2+) are picked via checkboxes in the expanded row instead of a
  // single-select radio, so a mod that genuinely needs more than one of its own IDs
  // enabled together isn't blocked, while the exclusivity warning still flags the
  // common "these are alternative branches" case. Checking a box only stages the name
  // for the next Add — it does not add or remove curated entries by itself, so toggling
  // it can't yank the row out from under you when "Hide added" is on.
  private toggleCandidate(id: string, idx: number): void {
    const mod = this.state.mods.find((m) => m.publishedfileid === id);
    if (!mod || !mod.ok || !mod.names[idx]) return;
    const name = mod.names[idx];
    if (this.state.curated.some((c) => c.publishedfileid === id && c.name === name)) return;
    const key = candidateKey(id, name);
    const next = new Set(this.state.checkedNames);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.setState({ checkedNames: next });
  }

  private addAll(): void {
    const existing = new Set(this.state.curated.map((c) => c.publishedfileid));
    const additions = this.state.mods
      .filter((m) => m.ok && m.names.length > 0 && !existing.has(m.publishedfileid))
      .map((m) => ({
        key: `${m.publishedfileid}-${m.names[0]}-${Date.now()}-${randomSuffix()}`,
        publishedfileid: m.publishedfileid,
        title: m.title,
        name: m.names[0],
      }));
    if (additions.length) this.setState({ curated: [...this.state.curated, ...additions] });
  }

  private addAllSingle(): void {
    const existing = new Set(this.state.curated.map((c) => c.publishedfileid));
    const additions = this.state.mods
      .filter((m) => m.ok && m.names.length === 1 && !existing.has(m.publishedfileid))
      .map((m) => ({
        key: `${m.publishedfileid}-${m.names[0]}-${Date.now()}-${randomSuffix()}`,
        publishedfileid: m.publishedfileid,
        title: m.title,
        name: m.names[0],
      }));
    if (additions.length) this.setState({ curated: [...this.state.curated, ...additions] });
  }

  private clearAll(): void {
    this.setState({ curated: [], selectedCuratedIdx: null });
  }

  private resetToLanding(): void {
    this.setState({
      screen: 'landing',
      loading: false,
      errorMsg: '',
      inputValue: '',
      mods: [],
      selectedModId: null,
      selectedCandidateIdx: 0,
      checkedNames: new Set(),
      curated: [],
      selectedCuratedIdx: null,
      search: '',
      filterMultiOnly: false,
      filterHideAdded: false,
      filterHideFailed: false,
      b42Format: false,
      mobileTab: 'workshop',
      copiedRow: null,
      collectionUrl: '',
      openRows: {},
      perLineRows: {},
      fetchedAt: null,
    });
  }

  private removeCuratedAt(idx: number): void {
    const arr = [...this.state.curated];
    arr.splice(idx, 1);
    this.setState({ curated: arr, selectedCuratedIdx: null });
  }

  private removeSelectedCurated(): void {
    if (this.state.selectedCuratedIdx === null) return;
    this.removeCuratedAt(this.state.selectedCuratedIdx);
  }

  private moveCurated(idx: number, dir: number): void {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= this.state.curated.length) return;
    const arr = [...this.state.curated];
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    this.setState({ curated: arr, selectedCuratedIdx: newIdx });
  }

  private toggleFilter(filter: FilterKey): void {
    if (filter === 'multiOnly') this.setState({ filterMultiOnly: !this.state.filterMultiOnly });
    else if (filter === 'hideAdded') this.setState({ filterHideAdded: !this.state.filterHideAdded });
    else this.setState({ filterHideFailed: !this.state.filterHideFailed });
  }

  private toggleOpenRow(key: string): void {
    this.setState({ openRows: { ...this.state.openRows, [key]: !this.state.openRows[key] } });
  }

  private togglePerLine(key: string): void {
    this.setState({ perLineRows: { ...this.state.perLineRows, [key]: !this.state.perLineRows[key] } });
  }

  private copyRow(key: string): void {
    const row = this.outputRows().find((r) => r.key === key);
    if (!row) return;
    const text = row.blockText;

    const showCopied = () => {
      this.setState({ copiedRow: key });
      setTimeout(() => {
        if (this.state.copiedRow === key) this.setState({ copiedRow: null });
      }, 1200);
    };
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

  private exportModlist(): void {
    const payload = buildExportPayload(this.state);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildExportFilename(this.state);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  private triggerImport(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      void this.handleImportFile(file);
    });
    document.body.appendChild(input);
    input.click();
  }

  private async handleImportFile(file: File): Promise<void> {
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      this.setState({ errorMsg: 'Could not read that file — it may not be valid JSON.' });
      return;
    }
    const result = parseImportPayload(raw);
    if (!result.ok) {
      this.setState({ errorMsg: result.error });
      return;
    }
    this.applyImportedPayload(result.payload);
  }

  private applyImportedPayload(payload: ModExtractorExportPayload): void {
    this.setState({
      loading: false,
      errorMsg: '',
      screen: 'results',
      mods: payload.mods,
      selectedModId: null,
      selectedCandidateIdx: 0,
      checkedNames: new Set(),
      curated: payload.curated,
      selectedCuratedIdx: null,
      search: '',
      collectionUrl: payload.collectionUrl,
      inputValue: payload.inputValue,
      b42Format: payload.b42Format,
      fetchedAt: payload.fetchedAt,
    });
  }

  private async submit(): Promise<void> {
    const value = this.state.inputValue.trim();
    if (!value || this.state.loading) return;
    this.setState({ loading: true, errorMsg: '' });

    try {
      const res = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: value }),
      });
      const data: { mods?: ModEntry[]; error?: string } = await res.json();

      if (!res.ok) {
        this.setState({ loading: false, errorMsg: data.error || 'Something went wrong.' });
        return;
      }

      const mods = data.mods || [];
      if (mods.length === 0) {
        this.setState({ loading: false, errorMsg: 'No items found in this collection.' });
        return;
      }

      this.setState({
        loading: false,
        errorMsg: '',
        screen: 'results',
        mods,
        selectedModId: null,
        selectedCandidateIdx: 0,
        checkedNames: new Set(),
        curated: [],
        selectedCuratedIdx: null,
        search: '',
        collectionUrl: toCollectionUrl(value),
        fetchedAt: new Date().toISOString(),
      });
    } catch (err) {
      this.setState({
        loading: false,
        errorMsg: err instanceof Error ? err.message : 'Request failed.',
      });
    }
  }

  // ---- event delegation ----

  private handleClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const actionEl = target.closest<HTMLElement>('[data-action]');
    if (!actionEl) return;

    const idx = Number(actionEl.dataset.idx);
    switch (actionEl.dataset.action) {
      case 'select-mod':
        this.selectMod(actionEl.dataset.id as string);
        break;
      case 'quick-add':
        this.quickAdd(actionEl.dataset.id as string);
        break;
      case 'toggle-candidate':
        this.toggleCandidate(actionEl.dataset.id as string, idx);
        break;
      case 'toggle-filter':
        this.toggleFilter(actionEl.dataset.filter as FilterKey);
        break;
      case 'add-selected':
        this.addSelected();
        break;
      case 'remove-selected-curated':
        this.removeSelectedCurated();
        break;
      case 'add-all':
        this.addAll();
        break;
      case 'add-all-single':
        this.addAllSingle();
        break;
      case 'clear-all':
        this.clearAll();
        break;
      case 'select-curated':
        this.setState({ selectedCuratedIdx: idx });
        break;
      case 'move-curated-up':
        this.moveCurated(idx, -1);
        break;
      case 'move-curated-down':
        this.moveCurated(idx, 1);
        break;
      case 'remove-curated':
        this.removeCuratedAt(idx);
        break;
      case 'select-tab':
        this.setState({ mobileTab: actionEl.dataset.tab as 'workshop' | 'modid' });
        break;
      case 'toggle-b42':
        this.setState({ b42Format: !this.state.b42Format });
        break;
      case 'toggle-open-row':
        this.toggleOpenRow(actionEl.dataset.row as string);
        break;
      case 'toggle-per-line':
        this.togglePerLine(actionEl.dataset.row as string);
        break;
      case 'copy-row':
        this.copyRow(actionEl.dataset.row as string);
        break;
      case 'export-modlist':
        this.exportModlist();
        break;
      case 'import-modlist':
        this.triggerImport();
        break;
      case 'reset':
        this.resetToLanding();
        break;
    }
  }

  private handleFormSubmit(e: Event): void {
    const target = e.target;
    if (!(target instanceof HTMLFormElement) || !target.classList.contains('mx-form')) return;
    e.preventDefault();
    void this.submit();
  }

  private handleInput(e: Event): void {
    const target = e.target;
    if (!(target instanceof HTMLInputElement) || !target.dataset.field) return;
    if (target.dataset.field === 'inputValue') this.setState({ inputValue: target.value });
    else if (target.dataset.field === 'search') this.setState({ search: target.value });
  }

  private handleDragStart(e: DragEvent): void {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[draggable="true"]');
    if (!row || row.dataset.idx === undefined) return;
    this.dragIndex = Number(row.dataset.idx);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  private handleDragOver(e: DragEvent): void {
    if ((e.target as HTMLElement).closest('[draggable="true"]')) e.preventDefault();
  }

  private handleDrop(e: DragEvent): void {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[draggable="true"]');
    if (!row || row.dataset.idx === undefined || this.dragIndex === null) return;
    e.preventDefault();
    const to = Number(row.dataset.idx);
    const from = this.dragIndex;
    this.dragIndex = null;
    if (from === to) return;
    const arr = [...this.state.curated];
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    this.setState({ curated: arr, selectedCuratedIdx: to });
  }

  // ---- rendering ----

  private render(): void {
    const activeEl = document.activeElement;
    let focusId: string | null = null;
    let selStart: number | null = null;
    let selEnd: number | null = null;
    if (activeEl instanceof HTMLElement && activeEl.id && this.root.contains(activeEl)) {
      focusId = activeEl.id;
      if (activeEl instanceof HTMLInputElement) {
        selStart = activeEl.selectionStart;
        selEnd = activeEl.selectionEnd;
      }
    }

    // Every state change rebuilds the DOM via innerHTML, which would otherwise reset
    // scrollTop to 0 on the scrollable list panels (e.g. clicking a mod near the bottom
    // of a long, scrolled workshop list snaps it back to the top) — so scroll offsets
    // are captured by a stable key and restored after the rebuild, the same way focus is.
    const scrollPositions = new Map<string, number>();
    this.root.querySelectorAll<HTMLElement>('[data-scroll-id]').forEach((el) => {
      const key = el.dataset.scrollId;
      if (key) scrollPositions.set(key, el.scrollTop);
    });

    this.root.innerHTML = this.state.screen === 'landing' ? this.renderLanding() : this.renderResults();

    if (focusId) {
      const el = document.getElementById(focusId);
      if (el) {
        el.focus();
        if (el instanceof HTMLInputElement && selStart !== null && selEnd !== null) {
          try {
            el.setSelectionRange(selStart, selEnd);
          } catch {
            // some input types don't support selection ranges
          }
        }
      }
    }

    this.root.querySelectorAll<HTMLElement>('[data-scroll-id]').forEach((el) => {
      const key = el.dataset.scrollId;
      const pos = key ? scrollPositions.get(key) : undefined;
      if (pos !== undefined) el.scrollTop = pos;
    });
  }

  private renderLanding(): string {
    const s = this.state;
    const spinner = s.loading
      ? `<span class="w-[18px] h-[18px] border-2 border-knox-void border-t-transparent rounded-full inline-block animate-[pz-spin_0.7s_linear_infinite]"></span>`
      : '→';
    return `
      <div class="flex flex-col items-center justify-center min-h-screen p-6">
        <div class="max-w-[640px] w-full text-center">
          <h1 class="font-header text-[48px] font-normal tracking-[-0.02em] text-text-base mb-3">PZ MOD EXTRACTOR</h1>
          <p class="text-[17px] text-text-muted mb-8 leading-[1.5]">Paste a Steam Workshop collection link or ID and get a ready-to-use Project Zomboid mod list.</p>
          <form class="mx-form flex items-stretch bg-knox-void border border-border-standard rounded-none overflow-hidden">
            <input id="collection-input" type="text" aria-label="Steam collection URL or numeric ID" data-field="inputValue" value="${esc(s.inputValue)}" ${s.loading ? 'disabled' : ''} placeholder="Steam collection URL or numeric ID" class="flex-1 bg-transparent border-none outline-none text-text-base text-base px-5 py-[18px]" />
            <button type="submit" ${s.loading ? 'disabled' : ''} aria-label="Convert" class="w-[60px] border-none bg-success text-knox-void text-xl cursor-pointer flex items-center justify-center">${spinner}</button>
          </form>
          <div role="status" class="min-h-[22px] mt-3.5 text-sm text-danger">${esc(s.errorMsg)}</div>
          <button type="button" data-action="import-modlist" class="${TEXT_BTN_STYLE} mt-1">or import a saved mod list</button>
        </div>
      </div>
    `;
  }

  private renderModRow(m: ModEntry): string {
    const s = this.state;
    const addedIds = new Set(s.curated.map((c) => c.publishedfileid));
    const isSelected = m.publishedfileid === s.selectedModId;
    const addableMod = m.ok && m.names.length > 0;
    const isAdded = addedIds.has(m.publishedfileid);
    const statusText = !m.ok
      ? 'Could not load details for this item.'
      : m.names.length === 0
        ? 'No Mod ID declared for this item.'
        : '';
    const idsText = m.ids.length ? m.ids.join(', ') : '—';

    const exclusiveHint = m.names.length > 1 && looksExclusive(m.description);

    const candidates =
      isSelected && m.names.length > 1
        ? `
          <div class="mt-2">
            ${
              exclusiveHint
                ? `<div class="text-[11px] text-[#e0b052] bg-[#e0b052]/12 border border-[#e0b052]/35 rounded-none px-2 py-1.5 mb-1.5">⚠ These IDs look like alternative branches of this mod — usually only one should be enabled at a time.</div>`
                : ''
            }
            <div class="text-[10px] font-bold uppercase tracking-[0.04em] text-text-muted mb-1">Select Mod ID(s) to add</div>
            <div class="flex flex-col gap-1">
              ${m.names
                .map((name, idx) => {
                  const isAdded = s.curated.some((c) => c.publishedfileid === m.publishedfileid && c.name === name);
                  const isChecked = isAdded || s.checkedNames.has(candidateKey(m.publishedfileid, name));
                  return `
                    <label class="flex items-center gap-1.5 text-xs ${isChecked ? 'text-success' : 'text-text-base'} ${isAdded ? 'cursor-default' : 'cursor-pointer'}">
                      <input type="checkbox" data-action="toggle-candidate" data-id="${esc(m.publishedfileid)}" data-idx="${idx}" ${isChecked ? 'checked' : ''} ${isAdded ? 'disabled' : ''} class="accent-success" />
                      ${esc(name)}${isAdded ? ' <span class="text-[10px] text-text-muted">(added)</span>' : ''}
                    </label>
                  `;
                })
                .join('')}
            </div>
          </div>
        `
        : '';

    const thumb = m.previewUrl
      ? `<img src="${esc(m.previewUrl)}" alt="" class="w-11 h-11 flex-shrink-0 rounded-md object-cover bg-knox-void" onerror="this.style.visibility='hidden'" />`
      : `<div class="w-11 h-11 flex-shrink-0 rounded-md bg-knox-void border border-border-standard"></div>`;

    const expanded = isSelected
      ? `
        <div class="mt-2 pt-2 border-t border-border-standard flex gap-2.5">
          ${thumb}
          <div class="flex-1 min-w-0">
            <div class="text-xs text-text-muted leading-[1.4] line-clamp-2 mb-1">${renderDescription(m.description)}</div>
            <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=${esc(m.publishedfileid)}" target="_blank" rel="noopener noreferrer" class="text-[11px]">View on Workshop ↗</a>
          </div>
        </div>
      `
      : '';

    return `
      <div data-action="select-mod" data-id="${esc(m.publishedfileid)}" class="${rowStyle(isSelected, addableMod)}">
        <div class="flex gap-2.5 items-start w-full">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
              <div class="flex-1 min-w-0 text-[13px] font-semibold text-text-base whitespace-nowrap overflow-hidden text-ellipsis">${esc(m.title)}</div>
              ${m.names.length > 1 ? `<span class="flex-shrink-0 text-[10px] font-bold text-success bg-success/15 border border-border-standard rounded-none px-[7px] py-px">${m.names.length} IDs</span>` : ''}
              <div class="flex-shrink-0 flex items-center gap-1.5 ml-auto">
                ${isAdded ? `<span class="flex-shrink-0 text-[10px] font-bold text-text-muted bg-knox-void border border-border-standard rounded-none px-[7px] py-px">Added</span>` : ''}
                ${addableMod ? `<button type="button" data-action="quick-add" data-id="${esc(m.publishedfileid)}" aria-label="Add ${esc(m.title)}" class="flex-shrink-0 text-[10px] font-bold text-knox-void bg-success border-none rounded-none px-2 py-0.5 cursor-pointer">+ Add</button>` : ''}
              </div>
            </div>
            <div class="text-[11px] text-text-muted mt-0.5">Workshop: ${esc(idsText)}</div>
            ${statusText ? `<div class="text-[11px] text-danger mt-0.5">${esc(statusText)}</div>` : ''}
            ${candidates}
            ${expanded}
          </div>
        </div>
      </div>
    `;
  }

  private renderCuratedRow(item: CuratedItem, idx: number): string {
    const s = this.state;
    const isSelected = s.selectedCuratedIdx === idx;
    const moveUpDisabled = idx === 0;
    const moveDownDisabled = idx === s.curated.length - 1;
    return `
      <div draggable="true" data-action="select-curated" data-idx="${idx}" class="${curatedRowStyle(isSelected)}">
        <span class="cursor-grab text-text-muted text-[13px] px-0.5">::</span>
        <div class="flex-1 min-w-0">
          <div class="text-[13px] font-semibold text-success whitespace-nowrap overflow-hidden text-ellipsis">${esc(item.name)}</div>
          <div class="text-[11px] text-text-muted whitespace-nowrap overflow-hidden text-ellipsis">${esc(item.title)}</div>
        </div>
        <div class="flex flex-col gap-0.5">
          <button type="button" data-action="move-curated-up" data-idx="${idx}" ${moveUpDisabled ? 'disabled' : ''} aria-label="Move up" class="${moveBtnStyle(moveUpDisabled)}">↑</button>
          <button type="button" data-action="move-curated-down" data-idx="${idx}" ${moveDownDisabled ? 'disabled' : ''} aria-label="Move down" class="${moveBtnStyle(moveDownDisabled)}">↓</button>
        </div>
        <button type="button" data-action="remove-curated" data-idx="${idx}" aria-label="Remove ${esc(item.name)}" class="bg-transparent border-none text-danger text-base cursor-pointer px-1 leading-none">×</button>
      </div>
    `;
  }

  private renderOutputRow(row: OutputRow): string {
    const s = this.state;
    const isOpen = !!s.openRows[row.key];
    const perLine = !!s.perLineRows[row.key];
    const isCopied = s.copiedRow === row.key;
    const showB42 = row.key === 'mods';

    const expanded = isOpen
      ? `
        <div class="border-t border-border-standard px-3.5 py-3">
          <div class="flex items-center justify-between gap-4 mb-2.5">
            <button type="button" data-action="toggle-per-line" data-row="${row.key}" aria-pressed="${perLine}" class="flex items-center gap-1.5 bg-transparent border-none p-0 cursor-pointer">
              <span class="${b42CheckboxStyle(perLine)}">${perLine ? B42_CHECKMARK_SVG : ''}</span>
              <span class="text-[10px] font-bold uppercase tracking-[0.05em] text-text-base">One per line</span>
            </button>
            ${
              showB42
                ? `<button type="button" data-action="toggle-b42" aria-pressed="${s.b42Format}" class="flex items-center gap-1.5 bg-transparent border-none p-0 cursor-pointer mr-auto">
                    <span class="${b42CheckboxStyle(s.b42Format)}">${s.b42Format ? B42_CHECKMARK_SVG : ''}</span>
                    <span class="text-[10px] font-bold uppercase tracking-[0.05em] text-text-base">B42 format</span>
                  </button>`
                : ''
            }
            <button type="button" data-action="copy-row" data-row="${row.key}" class="${rowCopyBtnStyle(isCopied)}">${isCopied ? 'Copied!' : 'Copy'}</button>
          </div>
          <pre class="m-0 bg-header-slate border border-border-standard rounded-none px-3.5 py-3 max-h-[280px] overflow-auto text-text-base font-data text-xs leading-[1.6] whitespace-pre-wrap break-all">${esc(row.blockText)}</pre>
        </div>
      `
      : '';

    return `
      <div class="bg-knox-void border border-border-standard rounded-none">
        <div class="flex items-center gap-3 px-3.5 py-3">
          <span class="text-[11px] font-bold text-text-muted uppercase w-[118px] flex-shrink-0">${esc(row.label)}</span>
          <input id="output-${row.key}" type="text" readonly aria-label="${esc(row.label)} output" value="${esc(row.value)}" class="flex-1 min-w-0 bg-transparent border-none outline-none text-text-base font-data text-[13px]" />
          <button type="button" data-action="toggle-open-row" data-row="${row.key}" aria-label="${isOpen ? 'Close' : 'Open'} ${esc(row.label)}" class="${openRowBtnStyle(isOpen)}">${isOpen ? 'Close' : 'Open'}</button>
        </div>
        ${expanded}
      </div>
    `;
  }

  private renderResults(): string {
    const s = this.state;
    const filtered = this.filteredMods();
    const total = s.mods.length;
    const parsed = s.mods.filter((m) => m.ok && m.names.length > 0).length;
    const failed = total - parsed;
    const spinner = s.loading
      ? `<span class="w-3.5 h-3.5 border-2 border-knox-void border-t-transparent rounded-full inline-block animate-[pz-spin_0.7s_linear_infinite]"></span>`
      : '→';

    const mobileTabs = `
      <div class="flex gap-2 mb-4 md:hidden">
        <button type="button" data-action="select-tab" data-tab="workshop" class="${tabStyle(s.mobileTab === 'workshop')}">Workshop (${total})</button>
        <button type="button" data-action="select-tab" data-tab="modid" class="${tabStyle(s.mobileTab === 'modid')}">Mod ID (${s.curated.length})</button>
      </div>
    `;

    const workshopPanelVisibility = s.mobileTab === 'workshop' ? 'block' : 'hidden';
    const modIdPanelVisibility = s.mobileTab === 'modid' ? 'block' : 'hidden';

    const workshopPanel = `
      <div class="${workshopPanelVisibility} md:block bg-knox-void border border-border-standard rounded-none p-4 min-w-0">
        <div class="text-[13px] font-bold uppercase tracking-[0.04em] text-text-muted mb-2.5">Workshop ID List</div>
        <div class="flex gap-2 mb-3">
          <input id="search-input" type="text" aria-label="Filter workshop items" data-field="search" value="${esc(s.search)}" placeholder="Filter…" class="flex-1 min-w-0 box-border bg-knox-void border border-border-standard rounded-none text-text-base text-[13px] px-2.5 py-2" />
          <button type="button" data-action="toggle-filter" data-filter="multiOnly" title="Multiple IDs only" class="${filterPillStyle(s.filterMultiOnly)}">2+ IDs</button>
          <button type="button" data-action="toggle-filter" data-filter="hideAdded" title="Hide added" class="${filterPillStyle(s.filterHideAdded)}">Hide added</button>
          <button type="button" data-action="toggle-filter" data-filter="hideFailed" title="Hide failed" class="${filterPillStyle(s.filterHideFailed)}">Hide failed</button>
        </div>
        <div class="mx-scroll flex flex-col gap-2 max-h-[460px] overflow-y-auto" data-scroll-id="workshop-list">
          ${
            filtered.length
              ? filtered.map((m) => this.renderModRow(m)).join('')
              : `<div class="text-xs text-text-muted py-5 px-1 text-center">No items match your filters.</div>`
          }
        </div>
      </div>
    `;

    const middleControls = `
      <div class="flex flex-col items-stretch justify-center gap-2 py-2">
        <button type="button" data-action="add-selected" ${this.addable() ? '' : 'disabled'} class="${addBtnStyle(this.addable())}">ADD →</button>
        <button type="button" data-action="remove-selected-curated" ${s.selectedCuratedIdx !== null ? '' : 'disabled'} class="${removeBtnStyle(s.selectedCuratedIdx !== null)}">← REMOVE</button>
        <div class="flex flex-col gap-0.5 mt-2 items-center">
          <button type="button" data-action="add-all" class="${TEXT_BTN_STYLE}">Add all</button>
          <button type="button" data-action="add-all-single" class="${TEXT_BTN_STYLE}">Add single-ID only</button>
          <button type="button" data-action="clear-all" class="${TEXT_BTN_STYLE}">Clear all</button>
        </div>
      </div>
    `;

    const modIdPanel = `
      <div class="${modIdPanelVisibility} md:block bg-knox-void border border-border-standard rounded-none p-4 min-w-0">
        <div class="text-[13px] font-bold uppercase tracking-[0.04em] text-text-muted mb-2.5">Mod ID List (${s.curated.length})</div>
        ${s.curated.length === 0 ? `<div class="text-xs text-text-muted py-5 px-1 text-center">Select a mod on the left, then ADD.</div>` : ''}
        <div class="mx-scroll flex flex-col gap-2 max-h-[460px] overflow-y-auto" data-scroll-id="curated-list">
          ${s.curated.map((c, idx) => this.renderCuratedRow(c, idx)).join('')}
        </div>
      </div>
    `;

    const outputRowsHtml = this.outputRows()
      .map((r) => this.renderOutputRow(r))
      .join('');

    const toastHtml = s.copiedRow
      ? `
        <div role="status" aria-live="polite" class="fixed bottom-6 right-6 flex items-center gap-2 bg-header-slate border border-success rounded-none px-4 py-2.5 text-[13px] font-semibold text-success shadow-[0_4px_16px_rgba(0,0,0,0.5)] animate-[pz-toast_1.2s_ease_forwards] z-50">
          <svg width="14" height="11" viewBox="0 0 14 11" fill="none"><path d="M1 5.5L5 9.5L13 1" stroke="#45b545" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Copied to clipboard
        </div>
      `
      : '';

    return `
      <div>
        ${toastHtml}
        <div class="flex items-center gap-5 px-8 py-4 border-b border-border-standard bg-header-slate flex-wrap">
          <button type="button" data-action="reset" aria-label="Start over" class="font-header bg-transparent border-none p-0 font-normal text-success text-[17px] tracking-[-0.01em] whitespace-nowrap cursor-pointer">PZ MOD EXTRACTOR</button>
          <form class="mx-form flex-1 min-w-[220px] flex bg-knox-void border border-border-standard rounded-none overflow-hidden">
            <input id="collection-input" type="text" aria-label="Steam collection URL or numeric ID" data-field="inputValue" value="${esc(s.inputValue)}" ${s.loading ? 'disabled' : ''} placeholder="Steam collection URL or numeric ID" class="flex-1 bg-transparent border-none outline-none text-text-base text-sm px-3.5 py-2.5" />
            <button type="submit" ${s.loading ? 'disabled' : ''} aria-label="Convert" class="w-11 border-none bg-success text-knox-void text-base cursor-pointer">${spinner}</button>
          </form>
        </div>
        <div role="status" class="pt-2 px-8 text-[13px] text-danger">${esc(s.errorMsg)}</div>

        <div class="max-w-[1200px] mx-auto px-8 pt-6 pb-16">
          <div class="flex items-end justify-between gap-4 flex-wrap mb-[18px]">
            <div class="flex items-baseline gap-2.5 flex-wrap">
              ${
                s.collectionUrl
                  ? `<a href="${esc(s.collectionUrl)}" target="_blank" rel="noopener noreferrer" class="text-base font-bold">Modlist</a>`
                  : `<span class="text-base font-bold text-text-base">Modlist</span>`
              }
              <span class="text-[13px] text-text-muted">${total} total · <span class="text-success font-semibold">${parsed} loaded</span> · <span class="text-danger font-semibold">${failed} failed</span></span>
            </div>
            <div class="flex items-end gap-3.5 flex-wrap">
              <div class="flex flex-col gap-1.5 border border-border-standard rounded-none px-2.5 py-2">
                <div class="flex items-center justify-between gap-4">
                  <span class="text-[10px] font-bold uppercase tracking-[0.05em] text-text-muted">Copy</span>
                  <button type="button" data-action="toggle-b42" aria-pressed="${s.b42Format}" class="flex items-center gap-1.5 bg-transparent border-none p-0 cursor-pointer">
                    <span class="${b42CheckboxStyle(s.b42Format)}">${s.b42Format ? B42_CHECKMARK_SVG : ''}</span>
                    <span class="text-[10px] font-bold uppercase tracking-[0.05em] text-text-base">B42 format</span>
                  </button>
                </div>
                <div class="flex gap-1.5 flex-wrap">
                  <button type="button" data-action="copy-row" data-row="workshop" class="${headerCopyBtnStyle(s.copiedRow === 'workshop')}">WorkshopItems</button>
                  <button type="button" data-action="copy-row" data-row="mods" class="${headerCopyBtnStyle(s.copiedRow === 'mods')}">Mods</button>
                  <button type="button" data-action="copy-row" data-row="modlist" class="${headerCopyBtnStyle(s.copiedRow === 'modlist')}">ModList</button>
                </div>
              </div>
              <div class="flex flex-col gap-1.5 border border-border-standard rounded-none px-2.5 py-2">
                <span class="text-[10px] font-bold uppercase tracking-[0.05em] text-text-muted">Transfer</span>
                <div class="flex gap-1.5 flex-wrap">
                  <button type="button" data-action="export-modlist" aria-label="Export modlist as JSON" class="${headerCopyBtnStyle(false)}">Export</button>
                  <button type="button" data-action="import-modlist" aria-label="Import modlist from JSON" class="${headerCopyBtnStyle(false)}">Import</button>
                </div>
              </div>
            </div>
          </div>

          ${mobileTabs}

          <div class="flex flex-col gap-4 md:grid md:grid-cols-[1fr_150px_1fr] md:gap-5 md:items-start">
            ${workshopPanel}
            ${middleControls}
            ${modIdPanel}
          </div>

          <div class="mt-8">
            <div class="text-[13px] font-bold uppercase tracking-[0.04em] text-text-muted mb-3">Results</div>
            <div class="flex flex-col gap-2.5">
              ${outputRowsHtml}
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

export function mount(root: HTMLElement): void {
  new ModExtractorApp(root);
}
