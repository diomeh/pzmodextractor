import logoUrl from '../assets/logo.svg';
import { candidateKey, outputRows as buildOutputRows } from '../lib/modLogic';
import { B42_CHECKMARK_SVG, b42CheckboxStyle, headerCopyBtnStyle, tabStyle } from '../lib/styles';
import type { AppState } from '../lib/types';
import type { ModExtractorActions } from '../hooks/useModExtractor';
import { FilterBar } from './FilterBar';
import { SourcePanel } from './SourcePanel';
import { CuratedList } from './CuratedList';
import { OutputRow } from './OutputRow';
import { ExportImportControls } from './ExportImportControls';

interface Props {
  state: AppState;
  actions: ModExtractorActions;
  onSubmit: () => void;
  onExport: () => void;
  onTriggerImport: () => void;
}

export function ResultsScreen({ state: s, actions, onSubmit, onExport, onTriggerImport }: Props) {
  const allMods = s.sources.flatMap((src) => src.items);
  const total = allMods.length;
  const failed = allMods.filter((m) => !m.ok || m.names.length === 0).length;
  const addedIds = new Set(s.curated.map((c) => c.publishedfileid));
  const curatedKeys = new Set(s.curated.map((c) => candidateKey(c.publishedfileid, c.name)));
  const filters = {
    search: s.search,
    filterMultiOnly: s.filterMultiOnly,
    filterHideAdded: s.filterHideAdded,
    filterHideFailed: s.filterHideFailed,
  };
  const rows = buildOutputRows(s.sources, s.curated, s.b42Format, s.perLineRows);

  return (
    <div>
      <div class="flex items-center gap-4 px-8 py-4 border-b border-border-standard bg-header-slate flex-wrap">
        <button
          type="button"
          aria-label="Start over"
          class="flex items-center gap-2 flex-shrink-0 bg-transparent border-none p-0 cursor-pointer text-success transition-opacity duration-150 hover:opacity-80"
          onClick={() => actions.reset()}
        >
          <img src={logoUrl.src} alt="" aria-hidden="true" class="h-8 w-8 flex-shrink-0" />
          <span class="font-header text-success text-[17px] tracking-[-0.01em] whitespace-nowrap">PZ MOD EXTRACTOR</span>
        </button>
        <form
          class="flex-1 min-w-[260px] flex bg-knox-void border border-border-standard rounded-none overflow-hidden"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <input
            id="collection-input"
            type="text"
            aria-label="Add collections, items or IDs"
            value={s.inputValue}
            onInput={(e) => actions.setInputValue((e.target as HTMLInputElement).value)}
            disabled={s.loading}
            placeholder="Add collections, items, or IDs — comma separated"
            class="flex-1 bg-transparent border-none outline-none text-text-base text-sm px-3.5 py-2.5"
          />
          <button
            type="submit"
            disabled={s.loading}
            aria-label="Load"
            class="w-11 border-none bg-success text-knox-void text-base cursor-pointer flex items-center justify-center transition-opacity duration-150 hover:opacity-90 disabled:hover:opacity-100"
          >
            {s.loading ? (
              <span class="w-3.5 h-3.5 border-2 border-knox-void border-t-transparent rounded-full inline-block animate-[pz-spin_0.7s_linear_infinite]" />
            ) : (
              '→'
            )}
          </button>
        </form>
      </div>
      <div role="status" class="pt-2 px-8 text-[13px] text-danger">
        {s.errorMsg}
      </div>

      <div class="max-w-[1360px] mx-auto px-8 pt-6 pb-16">
        <div class="flex items-end justify-between gap-4 flex-wrap mb-[18px]">
          <div class="flex items-baseline gap-2.5 flex-wrap">
            <span class="text-base font-bold text-text-base">Modlist</span>
            <span class="text-[13px] text-text-muted">
              {s.sources.length} source{s.sources.length === 1 ? '' : 's'} · {total} item{total === 1 ? '' : 's'} ·{' '}
              <span class="text-success font-semibold">{s.curated.length} in list</span> ·{' '}
              <span class="text-danger font-semibold">{failed} failed</span>
            </span>
          </div>
          <div class="flex items-stretch gap-3 flex-wrap">
            <div class="flex flex-col justify-between gap-1.5 border border-border-standard rounded-none px-2.5 py-2">
              <span class="text-[10px] font-bold uppercase tracking-[0.05em] text-text-muted">List</span>
              <div class="flex flex-wrap">
                <button type="button" class={headerCopyBtnStyle(false)} onClick={() => actions.addAll()}>
                  Add all
                </button>
                <button type="button" class={headerCopyBtnStyle(false)} onClick={() => actions.addAllSingle()}>
                  Single-ID only
                </button>
                <button type="button" class={headerCopyBtnStyle(false)} onClick={() => actions.clearAll()}>
                  Clear
                </button>
              </div>
            </div>

            <div class="flex flex-col justify-between gap-1.5 border border-border-standard rounded-none px-2.5 py-2">
              <div class="flex items-center justify-between gap-4">
                <span class="text-[10px] font-bold uppercase tracking-[0.05em] text-text-muted">Copy</span>
                <button
                  type="button"
                  aria-pressed={s.b42Format}
                  class="group flex items-center gap-1.5 bg-transparent border-none p-0 cursor-pointer"
                  onClick={() => actions.toggleB42()}
                >
                  <span class={b42CheckboxStyle(s.b42Format)} dangerouslySetInnerHTML={{ __html: s.b42Format ? B42_CHECKMARK_SVG : '' }} />
                  <span class="text-[10px] font-bold uppercase tracking-[0.05em] text-text-muted transition-colors duration-150 group-hover:text-success">
                    B42 format
                  </span>
                </button>
              </div>
              <div class="flex flex-wrap">
                <button type="button" class={headerCopyBtnStyle(s.copiedRow === 'workshop')} onClick={() => actions.copyRow('workshop')}>
                  WorkshopItems
                </button>
                <button type="button" class={headerCopyBtnStyle(s.copiedRow === 'mods')} onClick={() => actions.copyRow('mods')}>
                  Mods
                </button>
                <button type="button" class={headerCopyBtnStyle(s.copiedRow === 'modlist')} onClick={() => actions.copyRow('modlist')}>
                  ModList
                </button>
              </div>
            </div>

            <ExportImportControls onExport={onExport} onTriggerImport={onTriggerImport} />
          </div>
        </div>

        <div class="flex gap-2 mb-4 md:hidden">
          <button type="button" class={tabStyle(s.mobileTab === 'workshop')} onClick={() => actions.selectTab('workshop')}>
            Sources ({total})
          </button>
          <button type="button" class={tabStyle(s.mobileTab === 'modid')} onClick={() => actions.selectTab('modid')}>
            Mod ID ({s.curated.length})
          </button>
        </div>

        <div class="flex flex-col gap-4 md:grid md:grid-cols-[1fr_380px] md:gap-5 md:items-start">
          <div class={`${s.mobileTab === 'workshop' ? 'block' : 'hidden'} md:block min-w-0`}>
            <FilterBar
              search={s.search}
              filterMultiOnly={s.filterMultiOnly}
              filterHideAdded={s.filterHideAdded}
              filterHideFailed={s.filterHideFailed}
              onSearchChange={actions.setSearch}
              onToggleFilter={actions.toggleFilter}
            />
            <div class="flex flex-col gap-3.5">
              {s.sources.map((src) => (
                <SourcePanel
                  key={src.key}
                  source={src}
                  filters={filters}
                  addedIds={addedIds}
                  curatedKeys={curatedKeys}
                  selectedModId={s.selectedModId}
                  checkedNames={s.checkedNames}
                  expandedDescIds={s.expandedDescIds}
                  actions={actions}
                />
              ))}
            </div>
          </div>

          <div
            class={`${s.mobileTab === 'modid' ? 'block' : 'hidden'} md:block bg-knox-void border border-border-standard rounded-none p-4 min-w-0 md:sticky md:top-4`}
          >
            <div class="flex items-baseline justify-between gap-2.5 mb-2.5">
              <span class="text-[13px] font-bold uppercase tracking-[0.04em] text-text-muted">Mod ID List ({s.curated.length})</span>
              <span class="text-[11px] text-text-muted">load order</span>
            </div>
            {s.curated.length === 0 && <div class="text-xs text-text-muted py-6 px-1 text-center">Add mods from any source panel.</div>}
            <CuratedList curated={s.curated} selectedCuratedIdx={s.selectedCuratedIdx} actions={actions} />
          </div>
        </div>

        <div class="mt-8">
          <div class="text-[13px] font-bold uppercase tracking-[0.04em] text-text-muted mb-3">Results</div>
          <div class="flex flex-col gap-2.5">
            {rows.map((row) => (
              <OutputRow
                key={row.key}
                row={row}
                isOpen={!!s.openRows[row.key]}
                perLine={!!s.perLineRows[row.key]}
                isCopied={s.copiedRow === row.key}
                b42Format={s.b42Format}
                actions={actions}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
