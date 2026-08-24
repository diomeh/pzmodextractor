import type { JSX } from 'preact';
import { classifyInput } from '../lib/modLogic';
import { chipStyle, TEXT_BTN_STYLE } from '../lib/styles';

interface Props {
  inputValue: string;
  loading: boolean;
  errorMsg: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onTriggerImport: () => void;
}

export function LandingScreen({ inputValue, loading, errorMsg, onInputChange, onSubmit, onTriggerImport }: Props) {
  const cls = classifyInput(inputValue);
  const chips: JSX.Element[] = [];
  if (cls.collections.length) {
    chips.push(
      <span key="c" class={chipStyle('success')}>
        {cls.collections.length} collection{cls.collections.length > 1 ? 's' : ''}
      </span>,
    );
  }
  if (cls.items.length) {
    chips.push(
      <span key="i" class={chipStyle('muted')}>
        {cls.items.length} item{cls.items.length > 1 ? 's' : ''} → custom
      </span>,
    );
  }
  if (cls.bad.length) {
    chips.push(
      <span key="b" class={chipStyle('danger')}>
        {cls.bad.length} unrecognised
      </span>,
    );
  }

  return (
    <div class="flex flex-col items-center justify-center min-h-screen p-6">
      <div class="max-w-[680px] w-full text-center">
        <h1 class="font-header text-[48px] font-normal tracking-[-0.02em] text-text-base mb-3">PZ MOD EXTRACTOR</h1>
        <p class="text-[17px] text-text-muted mb-8 leading-[1.5]">
          Paste Steam Workshop collections, single items, or bare IDs — comma separated. Each collection becomes its own panel.
        </p>
        <form
          class="flex items-stretch bg-knox-void border border-border-standard rounded-none overflow-hidden"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <input
            id="collection-input"
            type="text"
            aria-label="Collections, items or IDs"
            value={inputValue}
            onInput={(e) => onInputChange((e.target as HTMLInputElement).value)}
            disabled={loading}
            placeholder="Collection links, item links, or IDs"
            class="flex-1 min-w-0 bg-transparent border-none outline-none text-text-base text-base px-5 py-[18px]"
          />
          <button
            type="submit"
            disabled={loading}
            aria-label="Convert"
            class="w-[60px] border-none bg-success text-knox-void text-xl cursor-pointer flex items-center justify-center transition-opacity duration-150 hover:opacity-90 disabled:hover:opacity-100"
          >
            {loading ? (
              <span class="w-[18px] h-[18px] border-2 border-knox-void border-t-transparent rounded-full inline-block animate-[pz-spin_0.7s_linear_infinite]" />
            ) : (
              '→'
            )}
          </button>
        </form>
        <div class="flex items-center justify-center gap-1.5 flex-wrap min-h-[26px] mt-3.5">{chips}</div>
        <div role="status" class="min-h-[22px] mt-1 text-sm text-danger">
          {errorMsg}
        </div>
        <button type="button" class={`${TEXT_BTN_STYLE} mt-1`} onClick={onTriggerImport}>
          or import a saved mod list
        </button>
      </div>
    </div>
  );
}
