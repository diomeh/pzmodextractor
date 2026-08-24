import { curatedRowStyle, moveBtnStyle, sourceBadgeStyle } from '../lib/styles';
import type { CuratedItem } from '../lib/types';

interface Props {
  item: CuratedItem;
  idx: number;
  isSelected: boolean;
  moveUpDisabled: boolean;
  moveDownDisabled: boolean;
  onSelect: (idx: number) => void;
  onMoveUp: (idx: number) => void;
  onMoveDown: (idx: number) => void;
  onRemove: (idx: number) => void;
  onDragStart: (idx: number) => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (idx: number) => void;
}

export function CuratedRow({ item, idx, isSelected, moveUpDisabled, moveDownDisabled, onSelect, onMoveUp, onMoveDown, onRemove, onDragStart, onDragOver, onDrop }: Props) {
  return (
    <div
      draggable
      class={curatedRowStyle(isSelected)}
      onClick={() => onSelect(idx)}
      onDragStart={() => onDragStart(idx)}
      onDragOver={onDragOver}
      onDrop={() => onDrop(idx)}
    >
      <span class="cursor-grab text-text-muted text-[13px] px-0.5">::</span>
      <div class="flex-1 min-w-0">
        <div class="text-[13px] font-semibold text-success whitespace-nowrap overflow-hidden text-ellipsis">{item.name}</div>
        <div class="text-[11px] text-text-muted whitespace-nowrap overflow-hidden text-ellipsis">{item.title}</div>
        {item.sources.length > 0 && (
          <div class="flex gap-1 flex-wrap mt-1">
            {item.sources.map((label) => (
              <span key={label} class={sourceBadgeStyle(label)}>
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
      <div class="flex flex-col gap-0.5">
        <button
          type="button"
          disabled={moveUpDisabled}
          aria-label="Move up"
          class={moveBtnStyle(moveUpDisabled)}
          onClick={(e) => {
            e.stopPropagation();
            onMoveUp(idx);
          }}
        >
          ↑
        </button>
        <button
          type="button"
          disabled={moveDownDisabled}
          aria-label="Move down"
          class={moveBtnStyle(moveDownDisabled)}
          onClick={(e) => {
            e.stopPropagation();
            onMoveDown(idx);
          }}
        >
          ↓
        </button>
      </div>
      <button
        type="button"
        aria-label={`Remove ${item.name}`}
        class="bg-transparent border-none text-danger text-base cursor-pointer px-1 leading-none transition-opacity duration-150 hover:opacity-70"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(idx);
        }}
      >
        ×
      </button>
    </div>
  );
}
