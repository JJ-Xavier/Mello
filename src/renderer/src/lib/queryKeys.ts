// Chaves do TanStack Query, na hierarquia dos dados. Invalidar uma chave curta invalida todas as
// que começam com ela (ex.: ['board', id] cobre ['board', id, 'cards']).
export const queryKeys = {
  appInfo: ['app', 'info'] as const
}
