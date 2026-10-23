// Chaves do TanStack Query, na hierarquia dos dados. Invalidar uma chave curta invalida todas as
// que começam com ela (ex.: ['board', id] cobre ['board', id, 'archived']; ['boards'] cobre os
// fechados).
export const queryKeys = {
  appInfo: ['app', 'info'] as const,
  boards: ['boards'] as const,
  closedBoards: ['boards', 'closed'] as const,
  board: (boardId: string) => ['board', boardId] as const,
  archived: (boardId: string) => ['board', boardId, 'archived'] as const,
  labels: (boardId: string) => ['board', boardId, 'labels'] as const,
  matching: (boardId: string, keyword: string) => ['board', boardId, 'matching', keyword] as const,
  card: (cardId: string) => ['card', cardId] as const
}
