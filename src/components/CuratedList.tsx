import { useRef } from 'preact/hooks';
import type { CuratedItem } from '../lib/types';
import type { ModExtractorActions } from '../hooks/useModExtractor';
import { CuratedRow } from './CuratedRow';

interface Props {
  curated: CuratedItem[];
  selectedCuratedIdx: number | null;
  actions: ModExtractorActions;
}

export function CuratedList({ curated, selectedCuratedIdx, actions }: Props) {
  // Transient drag source index — scoped to this component, not the shared reducer,
  // since it's meaningless once the drag gesture ends.
  const dragIndex = useRef<number | null>(null);

  return (
    <div class="mx-scroll flex flex-col gap-2 max-h-[620px] overflow-y-auto">
      {curated.map((item, idx) => (
        <CuratedRow
          key={item.key}
          item={item}
          idx={idx}
          isSelected={selectedCuratedIdx === idx}
          moveUpDisabled={idx === 0}
          moveDownDisabled={idx === curated.length - 1}
          onSelect={actions.selectCurated}
          onMoveUp={(i) => actions.moveCurated(i, -1)}
          onMoveDown={(i) => actions.moveCurated(i, 1)}
          onRemove={actions.removeCuratedAt}
          onDragStart={(i) => {
            dragIndex.current = i;
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(to) => {
            const from = dragIndex.current;
            dragIndex.current = null;
            if (from === null || from === to) return;
            actions.reorderCurated(from, to);
          }}
        />
      ))}
    </div>
  );
}
