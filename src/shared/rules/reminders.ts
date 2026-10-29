// Lembretes (LEM): quando cada um dispara e o texto da notificação. Funções puras; o "agora" chega
// por parâmetro.
import { dayOf, dueDate, splitDue } from './dates'

export type ReminderKind = 'none' | 'at_time' | 'day_before'

// LEM-06: ao abrir o app, os lembretes perdidos dos últimos 7 dias viram um aviso; os mais
// antigos são descartados. Com o app aberto, um lembrete atrasado mais do que isso também.
export const MISSED_WINDOW_MS = 7 * 24 * 3_600_000

// O instante em que o lembrete dispara, ou null sem lembrete. "No horário" é a hora da entrega;
// "1 dia antes", a mesma hora no dia anterior. Data sem hora considera 09:00 (LEM-02).
export function reminderAt(dueAt: string | null, reminder: ReminderKind): number | null {
  if (dueAt === null || reminder === 'none') return null
  const { day, time } = splitDue(dueAt)
  const at = dueDate(`${day}T${time ?? '09:00'}`)
  if (reminder === 'day_before') at.setDate(at.getDate() - 1)
  return at.getTime()
}

const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const shortDate = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' })
const longDay = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short'
})

// Embaixo do "Lembrete" no seletor de data: quando a notificação sai, "qui., 29 de out., 18:00",
// e se esse horário já passou. Null sem lembrete.
export function reminderPreview(
  dueAt: string | null,
  reminder: ReminderKind,
  now: number
): string | null {
  const at = reminderAt(dueAt, reminder)
  if (at === null) return null
  const when = `${longDay.format(at)}, ${time.format(at)}`
  return at < now ? `${when} (horário já passou)` : when
}

// "hoje, 18:00", "amanhã", "ontem, 18:00", "26 de out., 18:00" (NovosEstados.dc.html).
export function dueText(dueAt: string, now: number): string {
  const { day, time: hour } = splitDue(dueAt)
  const date = dueDate(day)
  const today = dueDate(dayOf(now))
  const diff = Math.round((date.getTime() - today.getTime()) / 86_400_000)
  const when =
    diff === 0 ? 'hoje' : diff === 1 ? 'amanhã' : diff === -1 ? 'ontem' : shortDate.format(date)
  return hour ? `${when}, ${time.format(dueDate(dueAt))}` : when
}

// LEM-03: título "Mello · <título do card>", texto "Entrega <data e hora> · <quadro>".
export function reminderNotification(
  card: { title: string; dueAt: string; boardTitle: string },
  now: number
): { title: string; body: string } {
  return {
    title: `Mello · ${card.title}`,
    body: `Entrega ${dueText(card.dueAt, now)} · ${card.boardTitle}`
  }
}
