// Checklist (CHK).
import { isOverdue } from './dates'

// CHK-02: porcentagem arredondada; checklist vazio mostra 0%.
export function progress(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100)
}

// CHK-06: o selo de data do item é cinza; vermelho quando a data passou e o item não está marcado;
// verde quando está marcado.
export type ItemDateState = 'normal' | 'late' | 'done'

export function itemDateState(dueDate: string, isDone: boolean, now: number): ItemDateState {
  if (isDone) return 'done'
  return isOverdue(dueDate, false, now) ? 'late' : 'normal'
}
