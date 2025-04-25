'use client';

import { useQuoteContext } from '@/contexts/quoteContext';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface Position {
  x: number;
  y: number;
  rotation: number;
}

const ROWS = 4; // Fixed number of rows
const FEET_TO_PIXELS = 10; // Conversion factor for feet to pixels at base zoom
const PANEL_WIDTH_FEET = 12; // 12 feet
const PANEL_HEIGHT_FEET = 6; // 6 feet

const SolarPanel = memo(() => {
  const { mapZoomPercentage, totalPanels } = useQuoteContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position>({ x: 0, y: 0, rotation: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [isSelected, setIsSelected] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; startPosition: Position } | null>(null);

  // Calculate the actual number of panels (rounded up to multiple of 4)
  const actualPanels = useMemo(() => {
    return Math.ceil(totalPanels / ROWS) * ROWS;
  }, [totalPanels]);

  const columns = useMemo(() => actualPanels / ROWS, [actualPanels]);

  // Calculate panel dimensions based on zoom
  const dynamicStyling = useMemo(() => {
    // Base dimensions at 100% zoom (when mapZoomPercentage is 100)
    const baseHeight = PANEL_HEIGHT_FEET * FEET_TO_PIXELS;
    const baseWidth = PANEL_WIDTH_FEET * FEET_TO_PIXELS;
    
    let scaleFactor = 1;
    if (mapZoomPercentage < 50) {
      scaleFactor = 0.5;
    } else if (mapZoomPercentage < 100) {
      scaleFactor = 0.75;
    } else if (mapZoomPercentage < 150) {
      scaleFactor = 1;
    } else {
      scaleFactor = 1.2;
    }

    return {
      height: baseHeight * scaleFactor,
      width: baseWidth * scaleFactor,
    };
  }, [mapZoomPercentage]);

  // Center the panel group initially
  useEffect(() => {
    if (containerRef.current && !position.x && !position.y) {
      const parentRect = containerRef.current.parentElement?.getBoundingClientRect();
      if (parentRect) {
        const centerX = (parentRect.width - dynamicStyling.width * columns) / 2;
        const centerY = (parentRect.height - dynamicStyling.height * ROWS) / 2;
        setPosition(prev => ({ ...prev, x: centerX, y: centerY }));
      }
    }
  }, [dynamicStyling.width, dynamicStyling.height, columns, position.x, position.y]);

  // Handle drag start
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startPosition: { ...position },
    };
  }, [position]);

  // Handle rotation start
  const handleRotateStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;

    setIsRotating(true);
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startPosition: { ...position },
    };

    const handleRotateMove = (e: MouseEvent) => {
      if (!isRotating || !dragStartRef.current) return;

      const startAngle = Math.atan2(
        dragStartRef.current.y - centerY,
        dragStartRef.current.x - centerX
      );
      const currentAngle = Math.atan2(
        e.clientY - centerY,
        e.clientX - centerX
      );
      const angleDiff = (currentAngle - startAngle) * (180 / Math.PI);
      
      setPosition(prev => ({
        ...prev,
        rotation: dragStartRef.current!.startPosition.rotation + angleDiff,
      }));
    };

    const handleRotateEnd = () => {
      setIsRotating(false);
      dragStartRef.current = null;
      document.removeEventListener('mousemove', handleRotateMove);
      document.removeEventListener('mouseup', handleRotateEnd);
    };

    document.addEventListener('mousemove', handleRotateMove);
    document.addEventListener('mouseup', handleRotateEnd);
  }, [isRotating, position]);

  // Handle mouse move for dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !dragStartRef.current) return;

      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;

      setPosition({
        ...dragStartRef.current.startPosition,
        x: dragStartRef.current.startPosition.x + dx,
        y: dragStartRef.current.startPosition.y + dy,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Handle click outside to deselect
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsSelected(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <div 
      ref={containerRef}
      className="relative"
      style={{
        width: `${dynamicStyling.width * columns}px`,
        height: `${dynamicStyling.height * ROWS}px`,
        transform: `translate(${position.x}px, ${position.y}px) rotate(${position.rotation}deg)`,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
    >
      {/* Grid of solar panels */}
      <div 
        className="absolute inset-0 grid"
        style={{
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gridTemplateRows: `repeat(${ROWS}, 1fr)`,
          gap: '2px',
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleDragStart(e);
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsSelected(true);
        }}
      >
        {Array.from({ length: actualPanels }).map((_, index) => (
          <div
            key={index}
            className="flex items-center justify-center"
            style={{
              backgroundColor: '#080440',
              border: '2px solid #ffffff',
              borderRadius: '2px',
            }}
          />
        ))}
      </div>

      {/* Selection box with rotation handles */}
      {isSelected && (
        <>
          <div className="absolute inset-0 border-2 border-white bg-white bg-opacity-10 pointer-events-none" />
          {/* Rotation handles */}
          {['nw', 'ne', 'se', 'sw'].map((position) => (
            <div
              key={position}
              className="absolute w-3 h-3 bg-white border-2 border-blue-500 cursor-pointer transform -translate-x-1/2 -translate-y-1/2 hover:scale-110 transition-transform shadow-lg"
              style={{
                top: position.includes('n') ? '-4px' : 'calc(100% + 4px)',
                left: position.includes('w') ? '-4px' : 'calc(100% + 4px)',
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleRotateStart(e);
              }}
            />
          ))}
        </>
      )}
    </div>
  );
});

SolarPanel.displayName = 'SolarPanel';

export default SolarPanel;
