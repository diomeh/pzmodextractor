import { looksExclusive } from '../lib/bbcode';
import { candidateKey } from '../lib/modLogic';
import { rowStyle } from '../lib/styles';
import type { ModEntry, Source } from '../lib/types';
import type { ModExtractorActions } from '../hooks/useModExtractor';
import { BBCodeDescription } from './BBCodeDescription';

interface Props {
  mod: ModEntry;
  source: Source;
  isSelected: boolean;
  isAdded: boolean;
  checkedNames: Set<string>;
  curatedKeys: Set<string>;
  isDescExpanded: boolean;
  actions: ModExtractorActions;
}

export function ModRow({ mod, source, isSelected, isAdded, checkedNames, curatedKeys, isDescExpanded, actions }: Props) {
  const addableMod = mod.ok && mod.names.length > 0;
  const statusText = !mod.ok
    ? 'Could not load details for this item.'
    : mod.names.length === 0
      ? 'No Mod ID declared for this item.'
      : '';
  const idsText = mod.ids.length ? mod.ids.join(', ') : '—';
  const exclusiveHint = mod.names.length > 1 && looksExclusive(mod.description);
  const hasDescription = mod.description.trim().length > 0;

  return (
    <div data-scroll-anchor={mod.publishedfileid} class={rowStyle(isSelected, addableMod)} onClick={() => actions.selectMod(mod.publishedfileid)}>
      <div class="flex gap-2.5 items-start w-full">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5">
            <div class="flex-1 min-w-0 text-[13px] font-semibold text-text-base whitespace-nowrap overflow-hidden text-ellipsis">{mod.title}</div>
            {mod.names.length > 1 && (
              <span class="flex-shrink-0 text-[10px] font-bold text-success bg-success/15 border border-border-standard rounded-none px-[7px] py-px">
                {mod.names.length} IDs
              </span>
            )}
            <div class="flex-shrink-0 flex items-center gap-1.5 ml-auto">
              {isAdded && (
                <span class="flex-shrink-0 text-[10px] font-bold text-text-muted bg-knox-void border border-border-standard rounded-none px-[7px] py-px">
                  Added
                </span>
              )}
              {addableMod && (
                <button
                  type="button"
                  aria-label={`Add ${mod.title}`}
                  class="flex-shrink-0 text-[10px] font-bold text-knox-void bg-success border-none rounded-none px-2 py-0.5 cursor-pointer transition-opacity duration-150 hover:opacity-90"
                  onClick={(e) => {
                    e.stopPropagation();
                    actions.quickAdd(mod.publishedfileid, source.key);
                  }}
                >
                  + Add
                </button>
              )}
            </div>
          </div>
          <div class="text-[11px] text-text-muted mt-0.5">Workshop: {idsText}</div>
          {statusText && <div class="text-[11px] text-danger mt-0.5">{statusText}</div>}

          {isSelected && mod.names.length > 1 && (
            <div class="mt-2">
              {exclusiveHint && (
                <div class="text-[11px] text-[#e0b052] bg-[#e0b052]/12 border border-[#e0b052]/35 rounded-none px-2 py-1.5 mb-1.5">
                  ⚠ These IDs look like alternative branches of this mod — usually only one should be enabled at a time.
                </div>
              )}
              <div class="text-[10px] font-bold uppercase tracking-[0.04em] text-text-muted mb-1">Select Mod ID(s) to add</div>
              <div class="flex flex-col gap-1">
                {mod.names.map((name, idx) => {
                  const isAddedName = curatedKeys.has(candidateKey(mod.publishedfileid, name));
                  const isChecked = isAddedName || checkedNames.has(candidateKey(mod.publishedfileid, name));
                  return (
                    <label
                      key={name}
                      class={`flex items-center gap-1.5 text-xs transition-colors duration-150 ${isChecked ? 'text-success' : 'text-text-base'} ${isAddedName ? 'cursor-default' : 'cursor-pointer hover:text-success'}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isAddedName}
                        class="accent-success"
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => actions.toggleCandidate(mod.publishedfileid, idx)}
                      />
                      {name}
                      {isAddedName && <span class="text-[10px] text-text-muted"> (added)</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {isSelected && (
            <div class="mt-2 pt-2 border-t border-border-standard flex gap-2.5">
              {mod.previewUrl ? (
                <img
                  src={mod.previewUrl}
                  alt=""
                  class="w-11 h-11 flex-shrink-0 rounded-md object-cover bg-knox-void"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                  }}
                />
              ) : (
                <div class="w-11 h-11 flex-shrink-0 rounded-md bg-knox-void border border-border-standard" />
              )}
              <div class="flex-1 min-w-0">
                <BBCodeDescription
                  description={mod.description}
                  className={`mx-scroll text-xs text-text-muted leading-[1.4] mb-1 ${isDescExpanded ? 'max-h-[220px] overflow-y-auto pr-1' : 'line-clamp-2'}`}
                />
                {hasDescription && (
                  <button
                    type="button"
                    class="text-[11px] text-success bg-transparent border-none p-0 mb-1 cursor-pointer underline transition-colors duration-150 hover:text-[#6ec96e]"
                    onClick={(e) => {
                      e.stopPropagation();
                      actions.toggleDescription(mod.publishedfileid);
                    }}
                  >
                    {isDescExpanded ? 'Show less' : 'Show more'}
                  </button>
                )}
                <div>
                  <a
                    href={`https://steamcommunity.com/sharedfiles/filedetails/?id=${mod.publishedfileid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-[11px]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View on Workshop ↗
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
