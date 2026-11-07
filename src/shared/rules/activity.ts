// O texto de cada registro da atividade do card (ATV-02), como aparece no modal. Os nomes de lista,
// quadro e card vêm guardados no registro, então renomear depois não muda o histórico.
import type { ActivityEntry } from '../ipc/cards'
import { occurrenceDayText } from './recurrence'

const text = (value: unknown) => (typeof value === 'string' ? value : '')
// O dia de uma repetição ("seg., 26 de out."), ou nada se o registro não tem a data.
const day = (value: unknown) => (typeof value === 'string' ? ` de ${occurrenceDayText(value)}` : '')

export function activityText({ kind, data }: ActivityEntry): string {
  switch (kind) {
    case 'created':
      return `Criado em ${text(data['list'])}`
    case 'moved': {
      const from = text(data['from'])
      const to = text(data['to'])
      if (data['fromBoard'] === undefined) return `Movido de ${from} para ${to}`
      return `Movido de ${from} (${text(data['fromBoard'])}) para ${to} (${text(data['toBoard'])})`
    }
    case 'done':
      return 'Marcado como concluído'
    case 'undone':
      return 'Marcado como não concluído'
    case 'archived':
      return 'Arquivado'
    case 'restored':
      return 'Restaurado'
    case 'copied':
      return `Copiado de “${text(data['from'])}”`
    // MOD-03 e MOD-05: o título do card-modelo ou do quadro-modelo.
    case 'from_template':
      return `Criado a partir do modelo “${text(data['from'])}”`
    // REP-12
    case 'from_recurrence':
      return `Criado pela repetição${day(data['date'])}`
    // REP-08
    case 'recurrence_skipped':
      return `Repetição${day(data['date'])} pulada: este card ainda não foi concluído`
    // REP-10: as perdidas de uma vez ficam num registro só.
    case 'recurrence_missed': {
      const count = typeof data['count'] === 'number' ? data['count'] : 1
      if (count === 1) return `Repetição${day(data['from'])} não criada: app fechado`
      const from = text(data['from'])
      const to = text(data['to'])
      const range = from && to ? `, de ${occurrenceDayText(from)} a ${occurrenceDayText(to)}` : ''
      return `${count} repetições não criadas${range}: app fechado`
    }
  }
}

// "1 registro", "2 registros" (ATV-01).
export function activityCount(total: number): string {
  return `${total} ${total === 1 ? 'registro' : 'registros'}`
}
