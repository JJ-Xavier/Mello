// Configurações: chave → valor (JSON na tabela setting). Cada chave tem o schema e o valor padrão,
// que vale enquanto ela não foi gravada ou quando o que está gravado não é válido. Por enquanto só
// as do calendário (etapa 7); a tela de Configurações, que grava, entra na etapa 10.
import { z } from 'zod'

export const SETTING_SCHEMAS = {
  // CAL-09: valor inicial do filtro "Tarefas do checklist".
  'calendar.showTasks': z.boolean(),
  // CAL-07: "Riscar itens finalizados".
  'calendar.strikeDone': z.boolean(),
  // CAL-03: primeiro dia da semana.
  'calendar.weekStart': z.enum(['sunday', 'monday'])
}

export type SettingKey = keyof typeof SETTING_SCHEMAS
export type Settings = { [K in SettingKey]: z.infer<(typeof SETTING_SCHEMAS)[K]> }

export const SETTING_DEFAULTS: Settings = {
  'calendar.showTasks': true,
  'calendar.strikeDone': true,
  'calendar.weekStart': 'sunday'
}
