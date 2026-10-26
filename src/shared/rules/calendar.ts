// Calendário (CAL): a grade do mês, a ordem dos itens de um dia, a lista que recebe o card do
// "Adicionar" e quantos itens cabem num dia. Funções puras.
import { dayOf, monthGrid } from './dates'

export type WeekStart = 'sunday' | 'monday'

export interface CalendarDay {
  day: string
  inMonth: boolean
}

// CAL-03: as semanas do mês, começando no domingo ou na segunda, com 5 ou 6 semanas. Um mês que
// cabe em 4 (fevereiro de 2026, começando no domingo) ganha a semana seguinte.
export function calendarWeeks(year: number, month: number, weekStart: WeekStart): CalendarDay[][] {
  const weeks = monthGrid(year, month, weekStart === 'monday' ? 1 : 0)
  while (weeks.length < 5) {
    const last = weeks[weeks.length - 1]![6]!.day
    const [y = 0, m = 1, d = 1] = last.split('-').map(Number)
    weeks.push(
      Array.from({ length: 7 }, (_, i) => ({
        day: dayOf(new Date(y, m - 1, d + 1 + i).getTime()),
        inMonth: false
      }))
    )
  }
  return weeks
}

// O mês como intervalo de texto, para a consulta: due_at >= from AND due_at < to. As datas sem
// fuso ficam em ordem cronológica quando comparadas como texto ("2026-10-31T23:00" < "2026-11-01").
export function monthRange(year: number, month: number): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, '0')
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
  return { from: `${year}-${pad(month)}-01`, to: `${next.year}-${pad(next.month)}-01` }
}

// O mês anterior e o seguinte ("‹" e "›").
export function shiftMonth(year: number, month: number, delta: number) {
  const date = new Date(year, month - 1 + delta, 1)
  return { year: date.getFullYear(), month: date.getMonth() + 1 }
}

const byTitle = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })

// CAL-10: entre os cards do dia, sem hora primeiro, depois pela hora; empate pela prioridade (sem
// prioridade no fim) e depois pelo título.
export function sortDayCards<T extends { dueAt: string; priority: number | null; title: string }>(
  cards: readonly T[]
): T[] {
  const time = (dueAt: string) => dueAt.split('T')[1] ?? ''
  return [...cards].sort(
    (a, b) =>
      time(a.dueAt).localeCompare(time(b.dueAt)) ||
      (a.priority ?? 6) - (b.priority ?? 6) ||
      byTitle.compare(a.title, b.title)
  )
}

// As tarefas do dia ficam juntas por card (pelo título do card); dentro do card, na ordem do
// checklist, que é a ordem em que chegam.
export function sortDayTasks<T extends { cardTitle: string }>(tasks: readonly T[]): T[] {
  return [...tasks].sort((a, b) => byTitle.compare(a.cardTitle, b.cardTitle))
}

// CAL-12: o card do "Adicionar" entra na primeira lista do quadro que não é de conclusão (as listas
// chegam ativas e em ordem).
export function addTarget<T extends { isDoneList: boolean }>(lists: readonly T[]): T | null {
  return lists.find((list) => !list.isDoneList) ?? null
}

// CAL-13: quantos itens do dia aparecem. bottoms[i] é onde o item i termina, medido do topo da
// área dos itens. Se todos cabem na altura livre, todos; senão, os que cabem deixando lugar para
// o "+N mais" (gap + moreHeight) embaixo deles.
export function visibleCount(
  bottoms: readonly number[],
  available: number,
  gap: number,
  moreHeight: number
): number {
  if (bottoms.length === 0 || bottoms.at(-1)! <= available) return bottoms.length
  let count = 0
  while (count < bottoms.length && bottoms[count]! + gap + moreHeight <= available) count++
  return count
}
