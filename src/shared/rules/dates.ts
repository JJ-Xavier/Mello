// Datas de entrega (DAT). São "horário de relógio" local, sem fuso: "2026-10-20" (dia inteiro) ou
// "2026-10-20T14:30". O "agora" chega por parâmetro.

const pad = (n: number) => String(n).padStart(2, '0')

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

// "AAAA-MM-DD" do dia local de um instante.
export function dayOf(epochMs: number): string {
  const date = new Date(epochMs)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Separa e junta o dia e a hora de uma data de entrega.
export function splitDue(dueAt: string): { day: string; time: string | null } {
  const [day = '', time] = dueAt.split('T')
  return { day, time: time ?? null }
}

export function joinDue(day: string, time: string | null): string {
  return time ? `${day}T${time}` : day
}

function validDay(year: number, month: number, date: number): boolean {
  const check = new Date(year, month - 1, date)
  return check.getFullYear() === year && check.getMonth() === month - 1 && check.getDate() === date
}

// "AAAA-MM-DD" de um dia que existe (as datas das tarefas do checklist).
export function isDay(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  return match !== null && validDay(Number(match[1]), Number(match[2]), Number(match[3]))
}

// Data de entrega válida: "AAAA-MM-DD" ou "AAAA-MM-DDTHH:mm" (DAT-01).
export function isDue(text: string): boolean {
  const { day, time } = splitDue(text)
  return isDay(day) && (time === null || parseTimeInput(time) === time)
}

// O campo "Data" do seletor, como no protótipo: "19/09/2026" (dia e mês com 1 ou 2 dígitos).
// Devolve "AAAA-MM-DD", ou null se não for uma data que existe.
export function parseDayInput(text: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim())
  if (!match) return null
  const [date, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])]
  if (!validDay(year, month, date)) return null
  return `${year}-${pad(month)}-${pad(date)}`
}

export function formatDayInput(day: string): string {
  const [year, month, date] = day.split('-')
  return `${date}/${month}/${year}`
}

// O campo "Hora": "17:00" ou "9:05". Devolve "HH:mm", ou null.
export function parseTimeInput(text: string): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim())
  if (!match) return null
  const [hours, minutes] = [Number(match[1]), Number(match[2])]
  if (hours > 23 || minutes > 59) return null
  return `${pad(hours)}:${pad(minutes)}`
}

// DAT-04: do prazo mais cedo para o mais tarde, sem data no fim; empates mantêm a ordem. Sem hora,
// o prazo é o fim do dia, então vem depois de um horário no mesmo dia.
export function sortByDue<T extends { dueAt: string | null }>(cards: readonly T[]): T[] {
  const key = (dueAt: string | null) =>
    dueAt === null ? '￿' : dueAt.includes('T') ? dueAt : `${dueAt}T24:00`
  return [...cards].sort((a, b) => {
    const [ka, kb] = [key(a.dueAt), key(b.dueAt)]
    return ka < kb ? -1 : ka > kb ? 1 : 0
  })
}

// As semanas de um mês, com os dias do mês anterior e do seguinte que completam a primeira e a
// última semana. O seletor de data começa no domingo (como no protótipo); o calendário pode
// começar na segunda (firstWeekday = 1, CAL-03).
export function monthGrid(
  year: number,
  month: number,
  firstWeekday: 0 | 1 = 0
): { day: string; inMonth: boolean }[][] {
  const first = new Date(year, month - 1, 1)
  const start = new Date(year, month - 1, 1 - ((first.getDay() - firstWeekday + 7) % 7))
  const weeks: { day: string; inMonth: boolean }[][] = []
  const cursor = new Date(start)
  do {
    const week = []
    for (let i = 0; i < 7; i++) {
      week.push({ day: dayOf(cursor.getTime()), inMonth: cursor.getMonth() === month - 1 })
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(week)
  } while (cursor.getMonth() === month - 1)
  return weeks
}
