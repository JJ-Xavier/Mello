import { useCallback } from 'react'
import { useAction } from '../../lib/queries'
import { queryKeys } from '../../lib/queryKeys'

// As ações do modal mudam o card aberto e a face dele no quadro: as duas consultas são recarregadas
// (a do quadro também refaz a busca do filtro, que fica embaixo dela).
export function useCardAction(card: { id: string; boardId: string }) {
  const run = useAction()
  return useCallback(
    <T>(task: () => Promise<T>) =>
      run(task, [queryKeys.card(card.id), queryKeys.board(card.boardId)]),
    [run, card.id, card.boardId]
  )
}
