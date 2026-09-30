import React, { useState } from 'react';
import { Rnd } from 'react-rnd';
import { SystemStatsWidget } from './SystemStatsWidget';
import { RiDraggable } from '@remixicon/react';

interface DraggablePosition {
  x: number;
  y: number;
}

interface DraggableSystemStatsWidgetProps {
  enabled?: boolean;
  initialPosition?: DraggablePosition;
  onPositionChange?: (position: DraggablePosition) => void;
}

export const DraggableSystemStatsWidget: React.FC<DraggableSystemStatsWidgetProps> = ({
  enabled = true,
  initialPosition = { x: 0, y: 0 },
  onPositionChange,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  if (!enabled) return null;

  return (
    <Rnd
      default={{
        x: initialPosition.x,
        y: initialPosition.y,
        width: 320,
        height: 'auto',
      }}
      onDragStop={(e, d) => {
        setIsDragging(false);
        onPositionChange?.({ x: d.x, y: d.y });
      }}
      onDragStart={() => setIsDragging(true)}
      dragHandleClassName="drag-handle"
      disableResizing
      style={{
        zIndex: 9999,
      }}
    >
      <div className="w-80 cursor-grab rounded-3xl border border-border-button-default bg-background-secondary-default shadow-lg active:cursor-grabbing"
        style={{
          opacity: isDragging ? 0.95 : 1,
        }}
      >
        {/* Drag Handle */}
        <div className="drag-handle flex cursor-grab items-center gap-2 border-b border-separator-border px-4 py-2.5 active:cursor-grabbing">
          <RiDraggable className="size-4 text-foreground-icon-tertiary" aria-hidden />
          <span className="text-body-2-regular text-text-tertiary">Glisser pour déplacer</span>
        </div>

        {/* Widget Content */}
        <SystemStatsWidget enabled={true} />
      </div>
    </Rnd>
  );
};
