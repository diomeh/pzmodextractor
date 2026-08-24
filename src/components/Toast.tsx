interface Props {
  message: string | null;
}

export function Toast({ message }: Props) {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      class="fixed bottom-6 right-6 flex items-center gap-2 bg-header-slate border border-success rounded-none px-4 py-2.5 text-[13px] font-semibold text-success shadow-[0_4px_16px_rgba(0,0,0,0.5)] animate-[pz-toast_1.6s_ease_forwards] z-50"
    >
      <svg width="14" height="11" viewBox="0 0 14 11" fill="none">
        <path d="M1 5.5L5 9.5L13 1" stroke="#45b545" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      {message}
    </div>
  );
}
