// Datas como no protótipo, pelo Intl do navegador (pt-BR).
import { dueDate, splitDue } from '../../../shared/rules/dates'

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

// Data de uma tarefa do checklist: "10 set." (Card.dc.html).
export function formatItemDate(day: string): string {
  return shortDate.format(dueDate(day).getTime()).replace(' de ', ' ')
}

// "Última movimentação": "17 de out. de 2026, 18:06".
export function formatDateTime(epochMs: number): string {
  return dateTime.format(epochMs)
}

// Cabeçalho do seletor de data: "setembro de 2026".
export function formatMonth(year: number, month: number): string {
  return monthYear.format(new Date(year, month - 1, 1))
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
