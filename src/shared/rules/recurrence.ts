// Repetição (REP): quando uma regra cai, o resumo dela (REP-17) e os textos de data. Funções puras;
// o "agora" chega por parâmetro. As datas são "horário de relógio" local, sem fuso, como as de
// entrega: uma ocorrência é "AAAA-MM-DDTHH:mm" e fica em ordem cronológica comparada como texto.
import { dayOf, dueDate } from './dates'

export const FREQUENCIES = ['daily', 'weekly', 'monthly', 'every_n'] as const
export type Frequency = (typeof FREQUENCIES)[number]
export const ENDS = ['never', 'on_date', 'after_count'] as const
export type EndsKind = (typeof ENDS)[number]

export interface RecurrenceRule {
  freq: Frequency
  // Máscara dos dias da semana: dom = 1, seg = 2, ter = 4, … sáb = 64.
  weekdays: number
  monthDay: number | null
  intervalDays: number | null
  // Dia em que a regra foi salva: base do "a cada N dias" (REP-01).
  anchorDate: string
  time: string
  endsKind: EndsKind
  endsOn: string | null
  endsAfter: number | null
}

const pad = (n: number) => String(n).padStart(2, '0')

// "AAAA-MM-DDTHH:mm" local de um instante: o "agora" comparável com as ocorrências.
export function stampOf(epochMs: number): string {
  const date = new Date(epochMs)
  return `${dayOf(epochMs)}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function addDays(day: string, days: number): string {
  const [y = 0, m = 1, d = 1] = day.split('-').map(Number)
  return dayOf(new Date(y, m - 1, d + days).getTime())
}

function daysBetween(from: string, to: string): number {
  const utc = (day: string) => {
    const [y = 0, m = 1, d = 1] = day.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((utc(to) - utc(from)) / 86_400_000)
}

// REP-01: a regra cai neste dia?
function fallsOn(rule: RecurrenceRule, day: string): boolean {
  const [y = 0, m = 1, d = 1] = day.split('-').map(Number)
  switch (rule.freq) {
    case 'daily':
      return true
    case 'weekly':
      return (rule.weekdays & (1 << new Date(y, m - 1, d).getDay())) !== 0
    case 'monthly': {
      // Dia 31 num mês de 30 dias (ou fevereiro): o último dia do mês.
      const last = new Date(y, m, 0).getDate()
      return d === Math.min(rule.monthDay ?? 1, last)
    }
    case 'every_n': {
      const passed = daysBetween(rule.anchorDate, day)
      const n = rule.intervalDays ?? 1
      return passed > 0 && passed % n === 0
    }
  }
}

// Até quantos dias à frente procurar a próxima ocorrência (a mais espaçada, "a cada 365 dias",
// sempre cabe).
const HORIZON_DAYS = 3 * 366

// As ocorrências depois de `after` (exclusive) e até `until` (inclusive), no máximo `limit`.
// REP-06: corta pelo término; "depois de N vezes" desconta as que já venceram (dueCount).
export function occurrencesBetween(
  rule: RecurrenceRule,
  dueCount: number,
  after: string,
  until: string,
  limit = Infinity
): string[] {
  const found: string[] = []
  const remaining =
    rule.endsKind === 'after_count' ? Math.max((rule.endsAfter ?? 0) - dueCount, 0) : Infinity
  const lastDay = until.slice(0, 10)
  for (let day = after.slice(0, 10); day <= lastDay; day = addDays(day, 1)) {
    if (found.length >= Math.min(remaining, limit)) break
    if (rule.endsKind === 'on_date' && rule.endsOn !== null && day > rule.endsOn) break
    const occurrence = `${day}T${rule.time}`
    if (occurrence <= after || occurrence > until) continue
    if (fallsOn(rule, day)) found.push(occurrence)
  }
  return found
}

// As próximas `count` ocorrências depois de `after` (a prévia "Próximas:" e o próximo dia da face).
export function nextOccurrences(
  rule: RecurrenceRule,
  dueCount: number,
  after: string,
  count: number
): string[] {
  const until = `${addDays(after.slice(0, 10), HORIZON_DAYS)}T23:59`
  return occurrencesBetween(rule, dueCount, after, until, count)
}

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

// REP-17: "Todo dia, 08:00", "Toda segunda, quarta, 08:00", "Todo dia 5, 08:00",
// "A cada 3 dias, 08:00". O "Todo" ou "Toda" concorda com o primeiro dia (domingo e sábado).
export function recurrenceSummary(rule: RecurrenceRule): string {
  switch (rule.freq) {
    case 'daily':
      return `Todo dia, ${rule.time}`
    case 'weekly': {
      const days = WEEKDAYS.filter((_, i) => (rule.weekdays & (1 << i)) !== 0)
      if (days.length === 0) return 'Escolha os dias'
      const every = days[0] === 'domingo' || days[0] === 'sábado' ? 'Todo' : 'Toda'
      return `${every} ${days.join(', ')}, ${rule.time}`
    }
    case 'monthly':
      return `Todo dia ${rule.monthDay ?? 1}, ${rule.time}`
    case 'every_n': {
      const n = rule.intervalDays ?? 1
      return `A cada ${n} ${n === 1 ? 'dia' : 'dias'}, ${rule.time}`
    }
  }
}

const longDay = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short'
})
const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
const dayMonth = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })
const shortDay = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' })

// O dia de uma ocorrência no aviso e na atividade: "seg., 19 de out." (Repeticao.dc.html).
export function occurrenceDayText(occurrence: string): string {
  return longDay.format(dueDate(occurrence.slice(0, 10)))
}

// "Próximas:" do diálogo: "seg. 26/10" (Repeticao.dc.html).
export function previewDayText(occurrence: string): string {
  const date = dueDate(occurrence.slice(0, 10))
  return `${weekday.format(date)} ${dayMonth.format(date)}`
}

// REP-13: na face, o dia da semana ("seg.") quando a próxima é nos próximos 6 dias; senão, a
// data ("26 out.").
export function nextRepeatText(occurrence: string, now: number): string {
  const day = occurrence.slice(0, 10)
  const date = dueDate(day)
  const ahead = daysBetween(dayOf(now), day)
  if (ahead >= 0 && ahead <= 6) return weekday.format(date)
  return shortDay.format(date).replace(' de ', ' ')
}
