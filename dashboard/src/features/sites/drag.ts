// A site being dragged in the switcher carries its id in the drag itself,
// under its own type, so a drop reads it there and nothing else is dropped in.
export const DRAG = 'application/x-trckable-site'

/** Whether what is dragged over is one of the switcher's sites. */
export const dragging = (e: React.DragEvent) => e.dataTransfer.types.includes(DRAG)
