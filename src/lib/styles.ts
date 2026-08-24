import type { SourceKind } from './types';

export function filterPillStyle(active: boolean): string {
  return `flex-shrink-0 whitespace-nowrap text-[11px] font-semibold px-[9px] py-[5px] rounded-none cursor-pointer border transition-colors duration-150 ${active ? 'border-success bg-success/15 text-success hover:bg-success/25' : 'border-border-standard bg-knox-void text-text-muted hover:border-text-muted hover:text-text-base hover:bg-selection-grey'}`;
}

export function tabStyle(active: boolean): string {
  return `flex-1 p-[10px] rounded-none text-xs font-bold cursor-pointer border transition-colors duration-150 ${active ? 'border-success bg-success/12 text-success hover:bg-success/20' : 'border-border-standard bg-knox-void text-text-muted hover:border-text-muted hover:text-text-base hover:bg-selection-grey'}`;
}

export const BTN_BASE = 'rounded-none px-[14px] py-[10px] text-xs font-bold tracking-[0.03em] cursor-pointer border transition-opacity duration-150';
export const TEXT_BTN_STYLE = 'bg-transparent border-none text-text-muted text-xs underline cursor-pointer p-1 transition-colors duration-150 hover:text-text-base';

export function rowStyle(selected: boolean, addable: boolean): string {
  return `flex p-[10px] rounded-none cursor-pointer border transition-colors duration-150 ${selected ? 'border-success bg-success/10' : 'border-transparent bg-transparent hover:bg-selection-grey'} ${addable ? 'opacity-100' : 'opacity-55'}`;
}

export function curatedRowStyle(selected: boolean): string {
  return `flex items-center gap-2 px-2.5 py-2 rounded-none cursor-pointer border transition-colors duration-150 ${selected ? 'border-success bg-success/10' : 'border-transparent bg-header-slate hover:bg-selection-grey'}`;
}

export function moveBtnStyle(disabled: boolean): string {
  return `bg-transparent border-none text-text-muted text-[11px] px-1 transition-colors duration-150 ${disabled ? 'cursor-not-allowed opacity-30' : 'cursor-pointer opacity-100 hover:text-success'}`;
}

export function headerCopyBtnStyle(active: boolean): string {
  return `rounded-none px-[13px] py-[7px] text-[11px] font-bold tracking-[0.03em] uppercase whitespace-nowrap cursor-pointer transition-[background,border-color,color] duration-[120ms] border ${active ? 'border-success bg-success/15 text-success hover:bg-success/25' : 'border-border-standard bg-knox-void text-text-muted hover:border-text-muted hover:text-text-base hover:bg-selection-grey'}`;
}

export function b42CheckboxStyle(active: boolean): string {
  return `w-4 h-4 flex-shrink-0 flex items-center justify-center rounded-none border transition-[background,border-color] duration-[120ms] ${active ? 'border-success bg-success' : 'border-border-standard bg-transparent'} group-hover:border-success`;
}

export const B42_CHECKMARK_SVG =
  '<svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#000000" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function openRowBtnStyle(active: boolean): string {
  return `flex-shrink-0 border border-border-standard rounded-none px-3 py-1.5 text-[10px] font-bold tracking-[0.05em] uppercase cursor-pointer transition-[background,color] duration-[120ms] ${active ? 'bg-success/15 text-success hover:bg-success/25' : 'bg-transparent text-text-muted hover:text-text-base hover:bg-selection-grey'}`;
}

export function rowCopyBtnStyle(active: boolean): string {
  return `flex-shrink-0 border border-border-standard rounded-none px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors duration-150 ${active ? 'bg-success text-knox-void hover:opacity-90' : 'bg-transparent text-success hover:bg-success/15'}`;
}

export function sourceKindBadgeStyle(kind: SourceKind): string {
  return `flex-shrink-0 text-[9px] font-extrabold tracking-[0.06em] uppercase px-[7px] py-[3px] border transition-colors duration-150 ${kind === 'custom' ? 'border-border-standard text-text-muted' : 'border-success text-success hover:bg-success/15'}`;
}

export function sourcePanelStyle(kind: SourceKind): string {
  return `border bg-knox-void ${kind === 'custom' ? 'border-success' : 'border-border-standard'}`;
}

export function sourceBadgeStyle(label: string): string {
  return `flex-shrink-0 max-w-[110px] overflow-hidden text-ellipsis whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.04em] px-[7px] py-px border ${label === 'Custom' ? 'border-border-standard text-text-muted' : 'border-success text-success'}`;
}

export function sourceActionStyle(tone: 'add' | 'neutral'): string {
  return `flex-shrink-0 whitespace-nowrap text-[10px] font-bold tracking-[0.04em] uppercase bg-transparent border border-border-standard rounded-none px-[9px] py-1 cursor-pointer transition-colors duration-150 ${tone === 'add' ? 'text-success hover:bg-success/15 hover:border-success' : 'text-text-muted hover:text-text-base hover:bg-selection-grey'}`;
}

export function chipStyle(tone: 'success' | 'muted' | 'danger'): string {
  const toneClass =
    tone === 'success' ? 'bg-success text-knox-void' : tone === 'danger' ? 'bg-danger text-knox-void' : 'bg-border-standard text-knox-void';
  return `text-[10px] font-extrabold tracking-[0.05em] uppercase px-2.5 py-1 ${toneClass}`;
}
