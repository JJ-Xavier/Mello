// Prioridade (PRI): os 5 níveis do protótipo, com o ícone (path SVG) e as cores dos dois temas.
// A prioridade é separada das etiquetas (PRI-04). null = "Sem prioridade".

export type PriorityValue = 1 | 2 | 3 | 4 | 5

export interface PriorityLevel {
  value: PriorityValue
  name: string
  path: string
  dark: string
  light: string
}

// PRI-01
export const PRIORITIES: readonly PriorityLevel[] = [
  {
    value: 1,
    name: 'Muito alta',
    path: 'M6 13l6-6 6 6M6 19l6-6 6 6',
    dark: '#f87168',
    light: '#c9372c'
  },
  { value: 2, name: 'Alta', path: 'M6 15l6-6 6 6', dark: '#fea362', light: '#c25100' },
  { value: 3, name: 'Média', path: 'M5 9h14M5 15h14', dark: '#f5cd47', light: '#946f00' },
  { value: 4, name: 'Baixa', path: 'M6 9l6 6 6-6', dark: '#85b8ff', light: '#0c66e4' },
  {
    value: 5,
    name: 'Muito baixa',
    path: 'M6 5l6 6 6-6M6 11l6 6 6-6',
    dark: '#9fadbc',
    light: '#626f86'
  }
]

export function priorityLevel(value: number | null): PriorityLevel | null {
  return PRIORITIES.find((p) => p.value === value) ?? null
}

// PRI-05: do 1 ao 5, sem prioridade no fim; empates mantêm a ordem (o sort do JavaScript é estável).
export function sortByPriority<T extends { priority: number | null }>(cards: readonly T[]): T[] {
  return [...cards].sort((a, b) => (a.priority ?? 6) - (b.priority ?? 6))
}
