// O texto de cada registro da atividade do card (ATV-02), como aparece no modal. Os nomes de lista,
// quadro e card vêm guardados no registro, então renomear depois não muda o histórico.
// Modelo (etapa 11) e repetição (etapa 8) ganham o texto completo, com título e data, nas etapas
// deles.
import type { ActivityEntry } from '../ipc/cards'

const text = (value: unknown) => (typeof value === 'string' ? value : '')

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
    case 'from_template':
      return 'Criado a partir de um modelo'
    case 'from_recurrence':
      return 'Criado pela repetição'
    case 'recurrence_skipped':
      return 'Repetição pulada'
    case 'recurrence_missed':
      return 'Repetição não criada porque o app estava fechado'
  }
}

// "1 registro", "2 registros" (ATV-01).
export function activityCount(total: number): string {
  return `${total} ${total === 1 ? 'registro' : 'registros'}`
}
