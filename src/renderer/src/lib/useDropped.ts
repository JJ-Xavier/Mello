// Arrastar: a ordem nova aparece na hora em que se solta. O setQueryData do TanStack Query só avisa
// a tela depois de um setTimeout (notifyManager); nesse intervalo, o dnd-kit desenhava o item no
// lugar antigo e a animação de soltar ia para lá (o card "voltava" para a origem, Release.txt
// itens 2 e 7). O valor solto vale enquanto o de fora (o cache) for o mesmo de quando se soltou;
// quando o cache muda, ele volta a valer.
import { useState } from 'react'

export function useDropped<T>(value: T): [T, (next: T) => void] {
  const [dropped, setDropped] = useState<{ from: T; next: T } | null>(null)
  const shown = dropped && dropped.from === value ? dropped.next : value
  return [shown, (next) => setDropped({ from: value, next })]
}
