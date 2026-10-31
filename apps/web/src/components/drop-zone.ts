'use client';

import { useCallback, type DragEvent, type RefCallback } from 'react';

// Arrastrar y soltar de los tableros de tarjetas (numeral 16.4): el embudo del CRM (B22) y el tablero
// de proyectos (B26). Es solo un atajo con el ratón; con el teclado cada tarjeta tiene «Mover a…»
// (numeral 16.6). Cada tablero usa su propio tipo para no recibir tarjetas de otro.

/** Lo que pone la tarjeta al empezar a arrastrarla. */
export function startDrag(dragType: string, id: string): (event: DragEvent<HTMLElement>) => void {
  return (event) => {
    event.dataTransfer.setData(dragType, id);
    event.dataTransfer.effectAllowed = 'move';
  };
}

/**
 * Tarjeta que se arrastra cuando se permite. La tarjeta no es un control: se mueve con el ratón y,
 * con el teclado, con su botón «Mover a…»; por eso el evento se escucha aquí y no en la etiqueta.
 */
export function useDragSource(
  dragType: string,
  id: string,
  enabled: boolean,
): RefCallback<HTMLElement> {
  return useCallback(
    (element: HTMLElement | null) => {
      if (element === null || !enabled) return undefined;
      const start = (event: globalThis.DragEvent): void => {
        event.dataTransfer?.setData(dragType, id);
        if (event.dataTransfer !== null) event.dataTransfer.effectAllowed = 'move';
      };
      element.draggable = true;
      element.addEventListener('dragstart', start);
      return () => {
        element.draggable = false;
        element.removeEventListener('dragstart', start);
      };
    },
    [dragType, id, enabled],
  );
}

/** Zona donde se suelta una tarjeta arrastrada: avisa qué registro llegó. */
export function useDropZone(
  dragType: string,
  enabled: boolean,
  onDrop: (id: string) => void,
): RefCallback<HTMLElement> {
  return useCallback(
    (element: HTMLElement | null) => {
      if (element === null || !enabled) return undefined;
      const allow = (event: globalThis.DragEvent): void => {
        if (event.dataTransfer?.types.includes(dragType) === true) event.preventDefault();
      };
      const drop = (event: globalThis.DragEvent): void => {
        const id = event.dataTransfer?.getData(dragType) ?? '';
        if (id === '') return;
        event.preventDefault();
        onDrop(id);
      };
      element.addEventListener('dragover', allow);
      element.addEventListener('drop', drop);
      return () => {
        element.removeEventListener('dragover', allow);
        element.removeEventListener('drop', drop);
      };
    },
    [dragType, enabled, onDrop],
  );
}
