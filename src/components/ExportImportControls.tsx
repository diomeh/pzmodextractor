import { headerCopyBtnStyle } from '../lib/styles';

interface Props {
  onExport: () => void;
  onTriggerImport: () => void;
}

export function ExportImportControls({ onExport, onTriggerImport }: Props) {
  return (
    <div class="flex flex-col justify-between gap-1.5 border border-border-standard rounded-none px-2.5 py-2">
      <span class="text-[10px] font-bold uppercase tracking-[0.05em] text-text-muted">Transfer</span>
      <div class="flex flex-wrap">
        <button type="button" aria-label="Export modlist as JSON" class={headerCopyBtnStyle(false)} onClick={onExport}>
          Export
        </button>
        <button type="button" aria-label="Import modlist from JSON" class={headerCopyBtnStyle(false)} onClick={onTriggerImport}>
          Import
        </button>
      </div>
    </div>
  );
}
