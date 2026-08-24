import { matchesFilters, type ModFilters } from '../lib/modLogic';
import { BTN_BASE, sourceActionStyle, sourceKindBadgeStyle, sourcePanelStyle } from '../lib/styles';
import type { Source } from '../lib/types';
import type { ModExtractorActions } from '../hooks/useModExtractor';
import { ModRow } from './ModRow';

interface Props {
  source: Source;
  filters: ModFilters;
  addedIds: Set<string>;
  curatedKeys: Set<string>;
  selectedModId: string | null;
  checkedNames: Set<string>;
  expandedDescIds: Set<string>;
  actions: ModExtractorActions;
}

export function SourcePanel({ source, filters, addedIds, curatedKeys, selectedModId, checkedNames, expandedDescIds, actions }: Props) {
  const visible = source.items.filter((m) => matchesFilters(m, addedIds, filters));
  const failedN = source.items.filter((m) => !m.ok || m.names.length === 0).length;
  const addedN = source.items.filter((m) => addedIds.has(m.publishedfileid)).length;

  const metaParts: { text: string; class?: string }[] = [{ text: `${source.items.length - failedN} loaded` }];
  if (addedN) metaParts.push({ text: `${addedN} added`, class: 'text-success font-semibold' });
  if (failedN) metaParts.push({ text: `${failedN} failed`, class: 'text-danger font-semibold' });

  const emptyText = source.loadError
    ? source.loadError
    : source.items.length === 0
      ? source.kind === 'custom'
        ? 'Nothing here yet — paste an item link or ID above.'
        : 'This collection came back empty.'
      : 'No items match the current filter.';

  return (
    <div class={sourcePanelStyle(source.kind)}>
      <div
        aria-label={`${source.open ? 'Collapse' : 'Expand'} source`}
        class="flex items-center gap-2.5 px-3.5 py-[11px] bg-header-slate border-b border-border-standard flex-wrap cursor-pointer transition-colors duration-150 hover:bg-selection-grey"
        onClick={() => actions.toggleSourceOpen(source.key)}
      >
        <span class="text-text-muted text-[11px]">{source.open ? '▾' : '▸'}</span>
        {source.kind === 'custom' ? (
          <span class={sourceKindBadgeStyle(source.kind)}>Custom</span>
        ) : (
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            title="View on Steam"
            class={sourceKindBadgeStyle(source.kind)}
            onClick={(e) => e.stopPropagation()}
          >
            Collection
          </a>
        )}
        <span class="flex-1 min-w-0 text-[13px] font-bold text-text-base whitespace-nowrap overflow-hidden text-ellipsis">{source.title}</span>
        <span class="text-[11px] text-text-muted whitespace-nowrap">
          {metaParts.map((part, i) => (
            <span key={i} class={part.class}>
              {i > 0 ? ' · ' : ''}
              {part.text}
            </span>
          ))}
        </span>
        <div class="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            class={sourceActionStyle('add')}
            onClick={(e) => {
              e.stopPropagation();
              actions.addAllFrom(source.key);
            }}
          >
            Add all
          </button>
          <button
            type="button"
            class={sourceActionStyle('add')}
            onClick={(e) => {
              e.stopPropagation();
              actions.addSingleFrom(source.key);
            }}
          >
            Single-ID only
          </button>
          <button
            type="button"
            class={sourceActionStyle('neutral')}
            onClick={(e) => {
              e.stopPropagation();
              actions.clearSource(source.key);
            }}
          >
            Clear
          </button>
        </div>
        {source.kind !== 'custom' && (
          <button
            type="button"
            aria-label="Remove source"
            class="bg-transparent border-none text-danger text-[15px] cursor-pointer leading-none px-0.5 transition-opacity duration-150 hover:opacity-70"
            onClick={(e) => {
              e.stopPropagation();
              actions.removeSource(source.key);
            }}
          >
            ×
          </button>
        )}
      </div>

      {source.open && (
        <div class="p-3.5">
          {source.kind === 'custom' && (
            <>
              <form
                class="flex gap-2 mb-2.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void actions.addToCustom(source.key);
                }}
              >
                <input
                  type="text"
                  aria-label="Add one item"
                  value={source.draft}
                  onInput={(e) => actions.setSourceDraft(source.key, (e.target as HTMLInputElement).value)}
                  placeholder="+ Add one item by link or ID"
                  disabled={source.draftLoading}
                  class="flex-1 min-w-0 box-border bg-knox-void border border-success text-text-base text-[13px] px-2.5 py-2"
                />
                <button
                  type="submit"
                  disabled={source.draftLoading || !source.draft.trim()}
                  class={`${BTN_BASE} ${source.draft.trim() && !source.draftLoading ? 'bg-success text-knox-void border-success hover:opacity-90' : 'bg-knox-void text-text-muted border-border-standard opacity-50 cursor-not-allowed'}`}
                >
                  {source.draftLoading ? '…' : 'Fetch'}
                </button>
              </form>
              {source.draftError && <div class="text-[11px] text-danger mb-2.5">{source.draftError}</div>}
            </>
          )}
          {visible.length === 0 && <div class="text-xs text-text-muted py-3.5 px-0.5 text-center">{emptyText}</div>}
          <div class="mx-scroll flex flex-col gap-2 max-h-[340px] overflow-y-auto">
            {visible.map((m) => (
              <ModRow
                key={m.publishedfileid}
                mod={m}
                source={source}
                isSelected={m.publishedfileid === selectedModId}
                isAdded={addedIds.has(m.publishedfileid)}
                checkedNames={checkedNames}
                curatedKeys={curatedKeys}
                isDescExpanded={expandedDescIds.has(m.publishedfileid)}
                actions={actions}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
