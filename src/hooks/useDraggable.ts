import { useState, useRef, useEffect } from "react";

/**
 * useDraggable — makes any element draggable (mouse + touch), like the GlobalTimer.
 * Position is clamped to the viewport, persisted to localStorage, and re-clamped
 * on restore. `didDrag()` lets a click handler tell a real click from the end of
 * a drag (so a draggable button doesn't fire its onClick after being moved).
 */
export function useDraggable(
  storageKey: string,
  opts: { width?: number; height?: number } = {}
) {
  const W = opts.width ?? 56;
  const H = opts.height ?? 56;
  const ref = useRef<HTMLButtonElement | HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const startRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);
  const didDragRef = useRef(false);

  // Restore saved position (clamped into the current viewport)
  useEffect(() => {
    try {
      const s = localStorage.getItem(storageKey);
      if (!s) return;
      const p = JSON.parse(s);
      if (typeof p.x === "number" && typeof p.y === "number") {
        setPosition({
          x: Math.max(8, Math.min(window.innerWidth - W - 8, p.x)),
          y: Math.max(8, Math.min(window.innerHeight - H - 8, p.y)),
        });
      }
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    const cx = "touches" in e ? e.touches[0].clientX : e.clientX;
    const cy = "touches" in e ? e.touches[0].clientY : e.clientY;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    startRef.current = { x: cx, y: cy, posX: rect.left, posY: rect.top };
    didDragRef.current = false;
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;
    const move = (e: MouseEvent | TouchEvent) => {
      if (!startRef.current) return;
      if ("touches" in e) e.preventDefault();
      const cx = "touches" in e ? e.touches[0].clientX : e.clientX;
      const cy = "touches" in e ? e.touches[0].clientY : e.clientY;
      const dx = cx - startRef.current.x;
      const dy = cy - startRef.current.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) didDragRef.current = true;
      const w = ref.current?.offsetWidth ?? W;
      const h = ref.current?.offsetHeight ?? H;
      setPosition({
        x: Math.max(8, Math.min(window.innerWidth - w - 8, startRef.current.posX + dx)),
        y: Math.max(8, Math.min(window.innerHeight - h - 8, startRef.current.posY + dy)),
      });
    };
    const end = () => { setIsDragging(false); startRef.current = null; };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", end);
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", end);
    return () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", end);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end);
    };
  }, [isDragging]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist once the drag settles
  useEffect(() => {
    if (position && !isDragging) {
      try { localStorage.setItem(storageKey, JSON.stringify(position)); } catch {}
    }
  }, [position, isDragging, storageKey]);

  return { ref, position, isDragging, onDragStart, didDrag: () => didDragRef.current };
}
