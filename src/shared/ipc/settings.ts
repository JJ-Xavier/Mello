// Configurações: chave → valor (JSON na tabela setting). Cada chave tem o schema e o valor padrão,
// que vale enquanto ela não foi gravada ou quando o que está gravado não é válido. Por enquanto só
// as do envelhecimento (etapa 6), do calendário (etapa 7) e da bandeja (etapa 8); a tela de
// Configurações, que grava, entra na etapa 10.
import { z } from 'zod'

export const SETTING_SCHEMAS = {
  // ENV-03: desligado, nenhum card envelhece.
  'aging.enabled': z.boolean(),
  // CAL-09: valor inicial do filtro "Tarefas do checklist".
  'calendar.showTasks': z.boolean(),
  // CAL-07: "Riscar itens finalizados".
  'calendar.strikeDone': z.boolean(),
  // CAL-03: primeiro dia da semana.
  'calendar.weekStart': z.enum(['sunday', 'monday']),
  // LEM-07 e P4: fechar a janela deixa o Mello na bandeja.
  'tray.keep': z.boolean(),
  // O aviso "O Mello continua na bandeja" já apareceu (só na primeira vez).
  'tray.noticeShown': z.boolean()
}

export type SettingKey = keyof typeof SETTING_SCHEMAS
export type Settings = { [K in SettingKey]: z.infer<(typeof SETTING_SCHEMAS)[K]> }

export const SETTING_DEFAULTS: Settings = {
  'aging.enabled': true,
  'calendar.showTasks': true,
  'calendar.strikeDone': true,
  'calendar.weekStart': 'sunday',
  'tray.keep': true,
  'tray.noticeShown': false
}
