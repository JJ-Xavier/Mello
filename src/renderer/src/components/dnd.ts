// Configuração comum do arrastar (dnd-kit): mouse com uma pequena distância antes de começar (para
// o clique continuar funcionando) e teclado (espaço pega e solta, setas movem, Esc cancela).
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type ScreenReaderInstructions,
  type UniqueIdentifier
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

export function useDragSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Enter fica livre para abrir o item (ex.: o quadro no Início).
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] }
    })
  )
}

export const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    'Para mover, aperte espaço. Use as setas para escolher o lugar e aperte espaço de novo para ' +
    'soltar, ou Esc para cancelar.'
}

// Avisos para leitores de tela, em português.
export function announcements(
  nameOf: (id: UniqueIdentifier) => string,
  positionOf: (id: UniqueIdentifier) => number
): Announcements {
  return {
    onDragStart: ({ active }) => `Pegou ${nameOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${nameOf(active.id)} na posição ${positionOf(over.id) + 1}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `${nameOf(active.id)} solto na posição ${positionOf(over.id) + 1}.`
        : `${nameOf(active.id)} solto.`,
    onDragCancel: ({ active }) => `Movimento de ${nameOf(active.id)} cancelado.`
  }
}
