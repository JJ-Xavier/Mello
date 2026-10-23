// Filtro do quadro (FLT). A palavra-chave (FLT-01) é procurada pelo main, no título, na descrição,
// na nota e no nome das etiquetas, sem acento e sem diferenciar maiúsculas; aqui chega o conjunto
// de cards que a contêm. Prioridades e "só recorrentes" são decididos aqui.

export interface BoardFilter {
  keyword: string
  priorities: number[]
  recurringOnly: boolean
}

export const NO_FILTER: BoardFilter = { keyword: '', priorities: [], recurringOnly: false }

export function isFilterActive(filter: BoardFilter): boolean {
  return filter.keyword.trim() !== '' || filter.priorities.length > 0 || filter.recurringOnly
}

// FLT-04: todos os critérios precisam valer. Enquanto a busca da palavra-chave não volta
// (matching = null), ela não esconde nada.
export function cardMatches(
  card: { id: string; priority: number | null; recurring: boolean },
  filter: BoardFilter,
  matching: ReadonlySet<string> | null
): boolean {
  if (filter.keyword.trim() !== '' && matching && !matching.has(card.id)) return false
  if (filter.priorities.length > 0 && !filter.priorities.includes(card.priority ?? 0)) return false
  if (filter.recurringOnly && !card.recurring) return false
  return true
}
