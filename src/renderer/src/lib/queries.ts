// Consultas e ações da tela. As consultas ficam no cache do TanStack Query; as ações chamam o main,
// invalidam o que mudou e, se falharem, mostram o aviso de erro.
import { keepPreviousData, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useCallback } from 'react'
import { SEARCH_MIN } from '../../../shared/ipc/search'
import { useNotify } from '../components/useNotify'
import { api, unwrap } from './api'
import { queryKeys } from './queryKeys'

export function useAppInfo() {
  return useQuery({ queryKey: queryKeys.appInfo, queryFn: () => unwrap(api().app.info()) })
}

export function useBoards() {
  return useQuery({ queryKey: queryKeys.boards, queryFn: () => unwrap(api().boards.list()) })
}

export function useClosedBoards() {
  return useQuery({
    queryKey: queryKeys.closedBoards,
    queryFn: () => unwrap(api().boards.listClosed())
  })
}

// Os quadros-modelo da seção "Modelos" do Início (MOD-04).
export function useBoardTemplates() {
  return useQuery({
    queryKey: queryKeys.boardTemplates,
    queryFn: () => unwrap(api().templates.listBoards())
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

// Um mês do calendário, de um quadro ou de todos (boardId null), CAL-02.
export function useCalendar(boardId: string | null, year: number, month: number) {
  return useQuery({
    queryKey: queryKeys.calendar(boardId ?? 'all', year, month),
    queryFn: () => unwrap(api().calendar.month({ year, month, boardId }))
  })
}

// Busca do topo (BUS-01): a partir de 2 caracteres. Sempre consulta de novo (staleTime 0): a busca
// junta tudo, e nenhuma ação a invalida. Enquanto a nova não chega, fica a anterior na tela.
export function useSearch(text: string) {
  const trimmed = text.trim()
  return useQuery({
    queryKey: queryKeys.search(trimmed),
    queryFn: () => unwrap(api().search.query({ text: trimmed })),
    enabled: trimmed.length >= SEARCH_MIN,
    staleTime: 0,
    placeholderData: keepPreviousData
  })
}

export function useSettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: () => unwrap(api().settings.get()) })
}

// run(tarefa, chaves) executa a tarefa, invalida as chaves (mesmo se falhar, para a tela voltar ao
// estado real) e devolve o resultado, ou undefined se deu erro. O calendário junta cards de todos
// os quadros, então toda ação que muda dados também invalida o calendário: aberto, ele recarrega o
// mês; fechado, recarrega quando abrir.
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
        const keys = invalidate.length > 0 ? [...invalidate, queryKeys.calendarAll] : []
        await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
      }
    },
    [queryClient, notify]
  )
}
