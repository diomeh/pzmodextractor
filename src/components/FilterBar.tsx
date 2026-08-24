import { filterPillStyle } from '../lib/styles';
import type { FilterKey } from '../lib/types';

interface Props {
  search: string;
  filterMultiOnly: boolean;
  filterHideAdded: boolean;
  filterHideFailed: boolean;
  onSearchChange: (value: string) => void;
  onToggleFilter: (filter: FilterKey) => void;
}

export function FilterBar({ search, filterMultiOnly, filterHideAdded, filterHideFailed, onSearchChange, onToggleFilter }: Props) {
  return (
    <div class="flex gap-2 flex-wrap mb-3.5">
      <input
        id="search-input"
        type="text"
        aria-label="Filter items"
        value={search}
        onInput={(e) => onSearchChange((e.target as HTMLInputElement).value)}
        placeholder="Filter all sources…"
        class="flex-1 min-w-[160px] box-border bg-knox-void border border-border-standard rounded-none text-text-base text-[13px] px-2.5 py-2"
      />
      <button
        type="button"
        title="Multiple IDs only"
        class={filterPillStyle(filterMultiOnly)}
        onClick={() => onToggleFilter('multiOnly')}
      >
        2+ IDs
      </button>
      <button
        type="button"
        title="Hide added"
        class={filterPillStyle(filterHideAdded)}
        onClick={() => onToggleFilter('hideAdded')}
      >
        Hide added
      </button>
      <button
        type="button"
        title="Hide failed"
        class={filterPillStyle(filterHideFailed)}
        onClick={() => onToggleFilter('hideFailed')}
      >
        Hide failed
      </button>
    </div>
  );
}
