import { B42_CHECKMARK_SVG, b42CheckboxStyle, openRowBtnStyle, rowCopyBtnStyle } from '../lib/styles';
import type { OutputRow as OutputRowData } from '../lib/types';
import type { ModExtractorActions } from '../hooks/useModExtractor';

interface Props {
  row: OutputRowData;
  isOpen: boolean;
  perLine: boolean;
  isCopied: boolean;
  b42Format: boolean;
  actions: ModExtractorActions;
}

export function OutputRow({ row, isOpen, perLine, isCopied, b42Format, actions }: Props) {
  const showB42 = row.key === 'mods';

  return (
    <div class="bg-knox-void border border-border-standard rounded-none">
      <div class="flex items-center gap-3 px-3.5 py-3">
        <span class="text-[11px] font-bold text-text-muted uppercase w-[118px] flex-shrink-0">{row.label}</span>
        <input
          id={`output-${row.key}`}
          type="text"
          readOnly
          aria-label={`${row.label} output`}
          value={row.value}
          class="flex-1 min-w-0 bg-transparent border-none outline-none text-text-base font-data text-[13px]"
        />
        <button
          type="button"
          aria-label={`${isOpen ? 'Close' : 'Open'} ${row.label}`}
          class={openRowBtnStyle(isOpen)}
          onClick={() => actions.toggleOpenRow(row.key)}
        >
          {isOpen ? 'Close' : 'Open'}
        </button>
      </div>
      {isOpen && (
        <div class="border-t border-border-standard px-3.5 py-3">
          <div class="flex items-center justify-between gap-4 mb-2.5">
            <button
              type="button"
              aria-pressed={perLine}
              class="group flex items-center gap-1.5 bg-transparent border-none p-0 cursor-pointer"
              onClick={() => actions.togglePerLine(row.key)}
            >
              <span class={b42CheckboxStyle(perLine)} dangerouslySetInnerHTML={{ __html: perLine ? B42_CHECKMARK_SVG : '' }} />
              <span class="text-[10px] font-bold uppercase tracking-[0.05em] text-text-muted transition-colors duration-150 group-hover:text-success">One per line</span>
            </button>
            {showB42 && (
              <button
                type="button"
                aria-pressed={b42Format}
                class="group flex items-center gap-1.5 bg-transparent border-none p-0 cursor-pointer mr-auto"
                onClick={() => actions.toggleB42()}
              >
                <span class={b42CheckboxStyle(b42Format)} dangerouslySetInnerHTML={{ __html: b42Format ? B42_CHECKMARK_SVG : '' }} />
                <span class="text-[10px] font-bold uppercase tracking-[0.05em] text-text-muted transition-colors duration-150 group-hover:text-success">B42 format</span>
              </button>
            )}
            <button type="button" class={rowCopyBtnStyle(isCopied)} onClick={() => actions.copyRow(row.key)}>
              {isCopied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre class="m-0 bg-header-slate border border-border-standard rounded-none px-3.5 py-3 max-h-[280px] overflow-auto text-text-base font-data text-xs leading-[1.6] whitespace-pre-wrap break-all">
            {row.blockText}
          </pre>
        </div>
      )}
    </div>
  );
}
