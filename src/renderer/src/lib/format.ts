// Datas como no protótipo: "3 de set.", "15 de out." (mês abreviado do pt-BR, com ponto).
const shortDate = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' })

export function formatShortDate(epochMs: number): string {
  return shortDate.format(epochMs)
}
