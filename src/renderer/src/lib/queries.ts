// Consultas e ações da tela. As consultas ficam no cache do TanStack Query; as ações chamam o main,
// invalidam o que mudou e, se falharem, mostram o aviso de erro.
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useNotify } from '../components/useNotify'
import { api, unwrap } from './api'
import { queryKeys } from './queryKeys'

export function useBoards() {
  return useQuery({ queryKey: queryKeys.boards, queryFn: () => unwrap(api().boards.list()) })
}

export function useClosedBoards() {
  return useQuery({
    queryKey: queryKeys.closedBoards,
    queryFn: () => unwrap(api().boards.listClosed())
  })
}

// Sem quadro escolhido (boardId vazio), não consulta.
export function useBoard(boardId: string) {
  return useQuery({
    queryKey: queryKeys.board(boardId),
    queryFn: () => unwrap(api().boards.get({ boardId })),
    enabled: boardId !== ''
  })
}

export function useCard(cardId: string) {
  return useQuery({
    queryKey: queryKeys.card(cardId),
    queryFn: () => unwrap(api().cards.get({ cardId }))
  })
}

export function useLabels(boardId: string) {
  return useQuery({
    queryKey: queryKeys.labels(boardId),
    queryFn: () => unwrap(api().labels.list({ boardId }))
  })
}

// FLT-01: os cards do quadro com a palavra-chave (o main procura sem acento e sem diferenciar
// maiúsculas). Sem palavra-chave, não consulta.
export function useMatching(boardId: string, keyword: string) {
  const trimmed = keyword.trim()
  return useQuery({
    queryKey: queryKeys.matching(boardId, trimmed),
    queryFn: () => unwrap(api().cards.matching({ boardId, keyword: trimmed })),
    enabled: trimmed !== ''
  })
}

export function useArchived(boardId: string) {
  return useQuery({
    queryKey: queryKeys.archived(boardId),
    queryFn: () => unwrap(api().boards.archived({ boardId }))
  })
}

// run(tarefa, chaves) executa a tarefa, invalida as chaves (mesmo se falhar, para a tela voltar ao
// estado real) e devolve o resultado, ou undefined se deu erro.
export function useAction() {
  const queryClient = useQueryClient()
  const notify = useNotify()
  return useCallback(
    async <T>(task: () => Promise<T>, invalidate: QueryKey[] = []): Promise<T | undefined> => {
      try {
        return await task()
      } catch (error) {
        notify(error instanceof Error ? error.message : String(error))
        return undefined
      } finally {
        await Promise.all(invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
      }
    },
    [queryClient, notify]
  )
}
