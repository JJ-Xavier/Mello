// Datas como no protótipo, pelo Intl do navegador (pt-BR).
import { dayOf, dueDate, splitDue } from '../../../shared/rules/dates'

const shortDate = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' })
const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const dateTime = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
})
const monthYear = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
const fullDate = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric'
})
const oneDecimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const monthShortYear = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' })
const monthShort = new Intl.DateTimeFormat('pt-BR', { month: 'short' })
const weekdayShort = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
const dayLong = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: 'numeric',
  month: 'long'
})

// "3 de set.", "15 de out." (mês abreviado do pt-BR, com ponto).
export function formatShortDate(epochMs: number): string {
  return shortDate.format(epochMs)
}

// Data de entrega no modal: "19 de set." ou "19 de set., 17:00" (Card.dc.html).
export function formatDue(dueAt: string): string {
  const date = dueDate(dueAt).getTime()
  const { time: hour } = splitDue(dueAt)
  return hour ? `${shortDate.format(date)}, ${time.format(date)}` : shortDate.format(date)
}

// Data de uma tarefa do checklist: "10 set." ou "10 set. 18:00" (Card.dc.html e
// NovoDataHoraA.dc.html).
export function formatItemDate(due: string): string {
  const { day, time: hour } = splitDue(due)
  const date = shortDate.format(dueDate(day).getTime()).replace(' de ', ' ')
  return hour ? `${date} ${hour}` : date
}

// "Última movimentação": "17 de out. de 2026, 18:06".
export function formatDateTime(epochMs: number): string {
  return dateTime.format(epochMs)
}

// Cabeçalho do seletor de data: "setembro de 2026".
export function formatMonth(year: number, month: number): string {
  return monthYear.format(new Date(year, month - 1, 1))
}

// Calendário (Calendario.dc.html): o mês da barra, "out. de 2026".
export function formatMonthShort(year: number, month: number): string {
  return monthShortYear.format(new Date(year, month - 1, 1))
}

// Os meses do seletor de mês: "jan." a "dez.".
export const MONTH_NAMES = Array.from({ length: 12 }, (_, i) =>
  monthShort.format(new Date(2026, i, 1))
)

// Cabeçalho das colunas: "dom." a "sáb.", começando no domingo ou na segunda (CAL-03). O dia
// 4 de outubro de 2026 é um domingo.
export function weekdayNames(weekStart: 'sunday' | 'monday'): string[] {
  const first = weekStart === 'monday' ? 5 : 4
  return Array.from({ length: 7 }, (_, i) => weekdayShort.format(new Date(2026, 9, first + i)))
}

// A lista completa de um dia (NovoCalendarioTodos.dc.html): "qua., 21 de outubro".
export function formatDayLong(day: string): string {
  return dayLong.format(dueDate(day))
}

// Anexo "adicionado em 20 de out. de 2026" (NovoCardCapaAnexos.dc.html).
export function formatDate(epochMs: number): string {
  return fullDate.format(epochMs)
}

// Tamanho de arquivo: "312 KB", "1,8 MB", "1,2 GB" (NovoCardCapaAnexos.dc.html).
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} ${bytes === 1 ? 'byte' : 'bytes'}`
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 ** 3) return `${oneDecimal.format(bytes / 1024 ** 2)} MB`
  return `${oneDecimal.format(bytes / 1024 ** 3)} GB`
}

// Quando um backup foi feito (NovoConfig.dc.html): "Hoje, 14:00", "Ontem, 18:40" ou
// "27 de out., 09:12" (com o ano, se for de outro ano).
export function formatWhen(epochMs: number, now: number): string {
  const hour = time.format(epochMs)
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (dayOf(epochMs) === dayOf(now)) return `Hoje, ${hour}`
  if (dayOf(epochMs) === dayOf(yesterday.getTime())) return `Ontem, ${hour}`
  const sameYear = new Date(epochMs).getFullYear() === new Date(now).getFullYear()
  return `${(sameYear ? shortDate : fullDate).format(epochMs)}, ${hour}`
}
