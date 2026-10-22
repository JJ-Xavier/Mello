// Datas de entrega (DAT). São "horário de relógio" local, sem fuso: "2026-10-20" (dia inteiro) ou
// "2026-10-20T14:30". O "agora" chega por parâmetro.

// O instante local da data de entrega. Sem hora, é o começo do dia.
export function dueDate(dueAt: string): Date {
  const [day = '', time] = dueAt.split('T')
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number)
  const [hours = 0, minutes = 0] = time ? time.split(':').map(Number) : []
  return new Date(year, month - 1, date, hours, minutes)
}

// DAT-02: atrasado quando não está finalizado e o prazo passou. Com hora, quando o instante
// passou; sem hora, quando o dia acabou.
export function isOverdue(dueAt: string, finished: boolean, now: number): boolean {
  if (finished) return false
  const due = dueDate(dueAt)
  if (dueAt.includes('T')) return now > due.getTime()
  const nextDay = new Date(due.getFullYear(), due.getMonth(), due.getDate() + 1)
  return now >= nextDay.getTime()
}
