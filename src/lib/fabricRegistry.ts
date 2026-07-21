import type { Canvas } from "fabric";

/**
 * Fabric canvases are kept outside React state (one per PDF page) so that
 * mounting/unmounting and tool actions don't trigger re-renders. Components
 * register their canvas on mount and unregister on unmount.
 */
const canvases = new Map<number, Canvas>();

export function registerCanvas(pageIndex: number, canvas: Canvas) {
  canvases.set(pageIndex, canvas);
}

export function unregisterCanvas(pageIndex: number) {
  canvases.delete(pageIndex);
}

export function getCanvas(pageIndex: number): Canvas | undefined {
  return canvases.get(pageIndex);
}

export function getAllCanvases(): Map<number, Canvas> {
  return canvases;
}
