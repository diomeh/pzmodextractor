const MOBILE_BREAKPOINT = 880;

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
  showToggle: boolean;
  copyText: string;
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
  isMobile: boolean;
  mobileTab: 'workshop' | 'modid';
  copiedRow: string | null;
  collectionUrl: string;
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
  return `flex-shrink:0;white-space:nowrap;font-size:11px;font-weight:600;padding:5px 9px;border-radius:0;cursor:pointer;border:1px solid ${active ? '#45b545' : '#555555'};background:${active ? 'rgba(69,181,69,0.15)' : '#000000'};color:${active ? '#45b545' : '#999999'};`;
}

function tabStyle(active: boolean): string {
  return `flex:1;padding:10px;border-radius:0;font-size:12px;font-weight:700;border:1px solid ${active ? '#45b545' : '#555555'};background:${active ? 'rgba(69,181,69,0.12)' : '#000000'};color:${active ? '#45b545' : '#999999'};cursor:pointer;`;
}

const BTN_BASE =
  'border-radius:0;padding:10px 14px;font-size:12px;font-weight:700;letter-spacing:0.03em;cursor:pointer;border:1px solid #555555;';
const TEXT_BTN_STYLE =
  'background:transparent;border:none;color:#999999;font-size:12px;text-decoration:underline;cursor:pointer;padding:4px;';

function addBtnStyle(enabled: boolean): string {
  return (
    BTN_BASE +
    (enabled
      ? 'background:#45b545;color:#000000;border-color:#45b545;'
      : 'background:#000000;color:#999999;opacity:0.5;cursor:not-allowed;')
  );
}

function removeBtnStyle(enabled: boolean): string {
  return (
    BTN_BASE +
    (enabled
      ? 'background:#000000;color:#cc2222;border-color:#cc2222;'
      : 'background:#000000;color:#999999;opacity:0.5;cursor:not-allowed;')
  );
}

function rowStyle(selected: boolean, addable: boolean): string {
  return `display:flex;padding:10px;border-radius:0;cursor:pointer;border:1px solid ${selected ? '#45b545' : 'transparent'};background:${selected ? 'rgba(69,181,69,0.10)' : 'transparent'};opacity:${addable ? '1' : '0.55'};`;
}

function curatedRowStyle(selected: boolean): string {
  return `display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:0;cursor:pointer;border:1px solid ${selected ? '#45b545' : 'transparent'};background:${selected ? 'rgba(69,181,69,0.10)' : '#1c1c1c'};`;
}

function moveBtnStyle(disabled: boolean): string {
  return `background:transparent;border:none;color:#999999;font-size:11px;cursor:${disabled ? 'not-allowed' : 'pointer'};opacity:${disabled ? '0.3' : '1'};padding:0 4px;`;
}

function copyStyleFor(copied: boolean): string {
  return `flex-shrink:0;background:${copied ? '#45b545' : 'transparent'};color:${copied ? '#000000' : '#45b545'};border:1px solid #555555;border-radius:0;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;`;
}

function toggleStyleFor(active: boolean): string {
  return `flex-shrink:0;font-size:11px;font-weight:600;padding:5px 10px;border-radius:0;cursor:pointer;border:1px solid ${active ? '#45b545' : '#555555'};background:${active ? 'rgba(69,181,69,0.15)' : 'transparent'};color:${active ? '#45b545' : '#999999'};`;
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
      isMobile: window.innerWidth < MOBILE_BREAKPOINT,
      mobileTab: 'workshop',
      copiedRow: null,
      collectionUrl: '',
    };

    window.addEventListener('resize', () => {
      const isMobile = window.innerWidth < MOBILE_BREAKPOINT;
      if (isMobile !== this.state.isMobile) this.setState({ isMobile });
    });

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
      {
        key: 'workshop',
        label: 'WorkshopItems=',
        value: workshopItemsValue,
        showToggle: false,
        copyText: 'WorkshopItems=' + workshopItemsValue,
      },
      {
        key: 'mods',
        label: 'Mods=',
        value: modsValue,
        showToggle: true,
        copyText: 'Mods=' + modsValue,
      },
      {
        key: 'modlist',
        label: 'ModList=',
        value: modListValue,
        showToggle: false,
        copyText: 'ModList=' + modListValue,
      },
    ];
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

  private copyRow(key: string): void {
    const row = this.outputRows().find((r) => r.key === key);
    if (!row) return;
    const text = row.copyText;

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
      case 'copy-row':
        this.copyRow(actionEl.dataset.row as string);
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
      ? `<span style="width:18px;height:18px;border:2px solid #000000;border-top-color:transparent;border-radius:50%;display:inline-block;animation:pz-spin 0.7s linear infinite;"></span>`
      : '→';
    return `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:24px;">
        <div style="max-width:640px;width:100%;text-align:center;">
          <h1 style="font-size:48px;font-weight:800;letter-spacing:-0.02em;color:#e8e8e8;margin:0 0 12px;">PZ MOD EXTRACTOR</h1>
          <p style="font-size:17px;color:#999999;margin:0 0 32px;line-height:1.5;">Paste a Steam Workshop collection link or ID to generate a Project Zomboid mod string.</p>
          <form class="mx-form" style="display:flex;align-items:stretch;background:#000000;border:1px solid #555555;border-radius:0;overflow:hidden;">
            <input id="collection-input" type="text" aria-label="Steam collection URL or numeric ID" data-field="inputValue" value="${esc(s.inputValue)}" ${s.loading ? 'disabled' : ''} placeholder="Steam collection URL or numeric ID" style="flex:1;background:transparent;border:none;outline:none;color:#e8e8e8;font-size:16px;padding:18px 20px;" />
            <button type="submit" ${s.loading ? 'disabled' : ''} aria-label="Convert" style="width:60px;border:none;background:#45b545;color:#000000;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;">${spinner}</button>
          </form>
          <div role="status" style="min-height:22px;margin-top:14px;font-size:14px;color:#cc2222;">${esc(s.errorMsg)}</div>
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
          <div style="margin-top:8px;">
            ${
              exclusiveHint
                ? `<div style="font-size:11px;color:#e0b052;background:rgba(224,178,82,0.12);border:1px solid rgba(224,178,82,0.35);border-radius:0;padding:6px 8px;margin-bottom:6px;">⚠ These IDs look like alternative branches of this mod — usually only one should be enabled at a time.</div>`
                : ''
            }
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#999999;margin-bottom:4px;">Select Mod ID(s) to add</div>
            <div style="display:flex;flex-direction:column;gap:4px;">
              ${m.names
                .map((name, idx) => {
                  const isAdded = s.curated.some((c) => c.publishedfileid === m.publishedfileid && c.name === name);
                  const isChecked = isAdded || s.checkedNames.has(candidateKey(m.publishedfileid, name));
                  return `
                    <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:${isChecked ? '#45b545' : '#e8e8e8'};cursor:${isAdded ? 'default' : 'pointer'};">
                      <input type="checkbox" data-action="toggle-candidate" data-id="${esc(m.publishedfileid)}" data-idx="${idx}" ${isChecked ? 'checked' : ''} ${isAdded ? 'disabled' : ''} style="accent-color:#45b545;" />
                      ${esc(name)}${isAdded ? ' <span style="font-size:10px;color:#999999;">(added)</span>' : ''}
                    </label>
                  `;
                })
                .join('')}
            </div>
          </div>
        `
        : '';

    const thumb = m.previewUrl
      ? `<img src="${esc(m.previewUrl)}" alt="" style="width:72px;height:72px;flex-shrink:0;border-radius:6px;object-fit:cover;background:#000000;" onerror="this.style.visibility='hidden'" />`
      : `<div style="width:72px;height:72px;flex-shrink:0;border-radius:6px;background:#000000;border:1px solid #555555;"></div>`;

    const expanded = isSelected
      ? `
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid #555555;display:flex;gap:12px;">
          ${thumb}
          <div style="flex:1;min-width:0;">
            <div class="mx-scroll" data-scroll-id="desc-${esc(m.publishedfileid)}" style="font-size:12px;color:#999999;line-height:1.5;padding-right:4px;max-height:220px;overflow-y:auto;">${renderDescription(m.description)}</div>
          </div>
        </div>
      `
      : '';

    return `
      <div data-action="select-mod" data-id="${esc(m.publishedfileid)}" style="${rowStyle(isSelected, addableMod)}">
        <div style="display:flex;gap:10px;align-items:flex-start;width:100%;">
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;">
              <div style="flex:1;min-width:0;font-size:13px;font-weight:600;color:#e8e8e8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(m.title)}</div>
              ${m.names.length > 1 ? `<span style="flex-shrink:0;font-size:10px;font-weight:700;color:#45b545;background:rgba(69,181,69,0.15);border:1px solid #555555;border-radius:0;padding:1px 7px;">${m.names.length} IDs</span>` : ''}
              <div style="flex-shrink:0;display:flex;align-items:center;gap:6px;margin-left:auto;">
                <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=${esc(m.publishedfileid)}" target="_blank" rel="noopener noreferrer" data-action="view-workshop" aria-label="View ${esc(m.title)} on Workshop" title="View on Workshop" style="flex-shrink:0;font-size:10px;font-weight:700;color:#999999;background:#000000;border:1px solid #555555;border-radius:0;padding:1px 7px;">↗</a>
                ${isAdded ? `<span style="flex-shrink:0;font-size:10px;font-weight:700;color:#999999;background:#000000;border:1px solid #555555;border-radius:0;padding:1px 7px;">Added</span>` : ''}
                ${addableMod ? `<button type="button" data-action="quick-add" data-id="${esc(m.publishedfileid)}" aria-label="Add ${esc(m.title)}" style="flex-shrink:0;font-size:10px;font-weight:700;color:#000000;background:#45b545;border:none;border-radius:0;padding:2px 8px;cursor:pointer;">+ Add</button>` : ''}
              </div>
            </div>
            <div style="font-size:11px;color:#999999;margin-top:2px;">Workshop: ${esc(idsText)}</div>
            ${statusText ? `<div style="font-size:11px;color:#cc2222;margin-top:2px;">${esc(statusText)}</div>` : ''}
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
      <div draggable="true" data-action="select-curated" data-idx="${idx}" style="${curatedRowStyle(isSelected)}">
        <span style="cursor:grab;color:#999999;font-size:13px;padding:0 2px;">::</span>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:600;color:#45b545;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(item.name)}</div>
          <div style="font-size:11px;color:#999999;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(item.title)}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:2px;">
          <button type="button" data-action="move-curated-up" data-idx="${idx}" ${moveUpDisabled ? 'disabled' : ''} aria-label="Move up" style="${moveBtnStyle(moveUpDisabled)}">↑</button>
          <button type="button" data-action="move-curated-down" data-idx="${idx}" ${moveDownDisabled ? 'disabled' : ''} aria-label="Move down" style="${moveBtnStyle(moveDownDisabled)}">↓</button>
        </div>
        <button type="button" data-action="remove-curated" data-idx="${idx}" aria-label="Remove ${esc(item.name)}" style="background:transparent;border:none;color:#cc2222;font-size:16px;cursor:pointer;padding:0 4px;line-height:1;">×</button>
      </div>
    `;
  }

  private renderOutputRow(row: OutputRow): string {
    const copied = this.state.copiedRow === row.key;
    const toggle = row.showToggle
      ? `<button type="button" data-action="toggle-b42" style="${toggleStyleFor(this.state.b42Format)}">B42 format</button>`
      : '';
    return `
      <div style="display:flex;align-items:center;gap:12px;background:#000000;border:1px solid #555555;border-radius:0;padding:12px 14px;">
        <span style="font-size:11px;font-weight:700;color:#999999;text-transform:uppercase;width:118px;flex-shrink:0;">${esc(row.label)}</span>
        <input id="output-${row.key}" type="text" readonly aria-label="${esc(row.label)} output" value="${esc(row.value)}" style="flex:1;min-width:0;background:transparent;border:none;outline:none;color:#e8e8e8;font-family:'SF Mono',Consolas,monospace;font-size:13px;" />
        ${toggle}
        <button type="button" data-action="copy-row" data-row="${row.key}" style="${copyStyleFor(copied)}">${copied ? 'Copied!' : 'Copy'}</button>
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
      ? `<span style="width:14px;height:14px;border:2px solid #000000;border-top-color:transparent;border-radius:50%;display:inline-block;animation:pz-spin 0.7s linear infinite;"></span>`
      : '→';

    const mobileTabs = s.isMobile
      ? `
        <div style="display:flex;gap:8px;margin-bottom:16px;">
          <button type="button" data-action="select-tab" data-tab="workshop" style="${tabStyle(s.mobileTab === 'workshop')}">Workshop (${total})</button>
          <button type="button" data-action="select-tab" data-tab="modid" style="${tabStyle(s.mobileTab === 'modid')}">Mod ID (${s.curated.length})</button>
        </div>
      `
      : '';

    const showWorkshopPanel = !s.isMobile || s.mobileTab === 'workshop';
    const showModIdPanel = !s.isMobile || s.mobileTab === 'modid';

    const workshopPanel = showWorkshopPanel
      ? `
        <div style="background:#000000;border:1px solid #555555;border-radius:0;padding:16px;min-width:0;">
          <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#999999;margin-bottom:10px;">Workshop ID List</div>
          <div style="display:flex;gap:8px;margin-bottom:12px;">
            <input id="search-input" type="text" aria-label="Filter workshop items" data-field="search" value="${esc(s.search)}" placeholder="Filter…" style="flex:1;min-width:0;box-sizing:border-box;background:#000000;border:1px solid #555555;border-radius:0;color:#e8e8e8;font-size:13px;padding:8px 10px;" />
            <button type="button" data-action="toggle-filter" data-filter="multiOnly" title="Multiple IDs only" style="${filterPillStyle(s.filterMultiOnly)}">2+ IDs</button>
            <button type="button" data-action="toggle-filter" data-filter="hideAdded" title="Hide added" style="${filterPillStyle(s.filterHideAdded)}">Hide added</button>
            <button type="button" data-action="toggle-filter" data-filter="hideFailed" title="Hide failed" style="${filterPillStyle(s.filterHideFailed)}">Hide failed</button>
          </div>
          <div class="mx-scroll" data-scroll-id="workshop-list" style="display:flex;flex-direction:column;gap:8px;max-height:460px;overflow-y:auto;">
            ${
              filtered.length
                ? filtered.map((m) => this.renderModRow(m)).join('')
                : `<div style="font-size:12px;color:#999999;padding:20px 4px;text-align:center;">No items match your filters.</div>`
            }
          </div>
        </div>
      `
      : '';

    const middleControls = `
      <div style="display:flex;flex-direction:column;align-items:stretch;justify-content:center;gap:8px;padding:8px 0;">
        <button type="button" data-action="add-selected" ${this.addable() ? '' : 'disabled'} style="${addBtnStyle(this.addable())}">ADD →</button>
        <button type="button" data-action="remove-selected-curated" ${s.selectedCuratedIdx !== null ? '' : 'disabled'} style="${removeBtnStyle(s.selectedCuratedIdx !== null)}">← REMOVE</button>
        <div style="height:1px;background:#555555;margin:10px 0;"></div>
        <button type="button" data-action="add-all" style="${TEXT_BTN_STYLE}">Add all</button>
        <button type="button" data-action="add-all-single" style="${TEXT_BTN_STYLE}">Add single-ID only</button>
        <button type="button" data-action="clear-all" style="${TEXT_BTN_STYLE}">Clear all</button>
      </div>
    `;

    const modIdPanel = showModIdPanel
      ? `
        <div style="background:#000000;border:1px solid #555555;border-radius:0;padding:16px;min-width:0;">
          <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#999999;margin-bottom:10px;">Mod ID List (${s.curated.length})</div>
          ${s.curated.length === 0 ? `<div style="font-size:12px;color:#999999;padding:20px 4px;text-align:center;">Select a mod on the left, then ADD.</div>` : ''}
          <div class="mx-scroll" data-scroll-id="curated-list" style="display:flex;flex-direction:column;gap:8px;max-height:460px;overflow-y:auto;">
            ${s.curated.map((c, idx) => this.renderCuratedRow(c, idx)).join('')}
          </div>
        </div>
      `
      : '';

    const transferGridStyle = s.isMobile
      ? 'display:flex;flex-direction:column;gap:16px;'
      : 'display:grid;grid-template-columns:1fr 150px 1fr;gap:20px;align-items:start;';

    const outputRowsHtml = this.outputRows()
      .map((r) => this.renderOutputRow(r))
      .join('');

    return `
      <div>
        <div style="display:flex;align-items:center;gap:20px;padding:16px 32px;border-bottom:1px solid #555555;background:#1c1c1c;flex-wrap:wrap;">
          <button type="button" data-action="reset" aria-label="Start over" style="background:transparent;border:none;padding:0;font-weight:800;color:#45b545;font-size:17px;letter-spacing:-0.01em;white-space:nowrap;cursor:pointer;">PZ MOD EXTRACTOR</button>
          <form class="mx-form" style="flex:1;min-width:220px;display:flex;background:#000000;border:1px solid #555555;border-radius:0;overflow:hidden;">
            <input id="collection-input" type="text" aria-label="Steam collection URL or numeric ID" data-field="inputValue" value="${esc(s.inputValue)}" ${s.loading ? 'disabled' : ''} placeholder="Steam collection URL or numeric ID" style="flex:1;background:transparent;border:none;outline:none;color:#e8e8e8;font-size:14px;padding:10px 14px;" />
            <button type="submit" ${s.loading ? 'disabled' : ''} aria-label="Convert" style="width:44px;border:none;background:#45b545;color:#000000;font-size:16px;cursor:pointer;">${spinner}</button>
          </form>
        </div>
        <div role="status" style="padding:8px 32px 0;font-size:13px;color:#cc2222;">${esc(s.errorMsg)}</div>

        <div style="max-width:1200px;margin:0 auto;padding:24px 32px 64px;">
          <div style="display:flex;align-items:center;gap:28px;flex-wrap:wrap;margin-bottom:22px;">
            ${
              s.collectionUrl
                ? `<a href="${esc(s.collectionUrl)}" target="_blank" rel="noopener noreferrer" style="font-size:16px;font-weight:700;">Modlist</a>`
                : `<span style="font-size:16px;font-weight:700;color:#e8e8e8;">Modlist</span>`
            }
            <div style="display:flex;gap:20px;flex-wrap:wrap;">
              <div><span style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:#999999;">Total</span><div style="font-size:16px;font-weight:700;color:#e8e8e8;">${total}</div></div>
              <div><span style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:#999999;">Loaded</span><div style="font-size:16px;font-weight:700;color:#45b545;">${parsed}</div></div>
              <div><span style="font-size:11px;text-transform:uppercase;letter-spacing:0.04em;color:#999999;">Failed</span><div style="font-size:16px;font-weight:700;color:#cc2222;">${failed}</div></div>
            </div>
          </div>

          ${mobileTabs}

          <div style="${transferGridStyle}">
            ${workshopPanel}
            ${middleControls}
            ${modIdPanel}
          </div>

          <div style="margin-top:32px;">
            <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#999999;margin-bottom:12px;">Results</div>
            <div style="display:flex;flex-direction:column;gap:10px;">
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
