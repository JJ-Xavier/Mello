// Configurações: chave → valor (JSON na tabela setting). Cada chave tem o schema e o valor padrão,
// que vale enquanto ela não foi gravada ou quando o que está gravado não é válido. A tela de
// Configurações (etapa 10) grava as chaves de USER_SETTING_KEYS; as outras só o main grava.
import { z } from 'zod'

export const SETTING_SCHEMAS = {
  // TEM-01: escuro (padrão), claro ou igual ao sistema.
  theme: z.enum(['dark', 'light', 'system']),
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
  'tray.noticeShown': z.boolean(),
  // P4: o Mello abre na bandeja quando o Windows inicia.
  'app.autoStart': z.boolean(),
  // DAD-04: a pasta de backup escolhida; null é a pasta padrão. Só muda pela janela do Windows
  // (data:chooseBackupFolder): a tela nunca manda um caminho.
  'backup.folder': z.string().min(1).nullable()
}

export type SettingKey = keyof typeof SETTING_SCHEMAS
export type Settings = { [K in SettingKey]: z.infer<(typeof SETTING_SCHEMAS)[K]> }
export type Theme = Settings['theme']

export const SETTING_DEFAULTS: Settings = {
  theme: 'dark',
  'aging.enabled': true,
  'calendar.showTasks': true,
  'calendar.strikeDone': true,
  'calendar.weekStart': 'sunday',
  'tray.keep': true,
  'tray.noticeShown': false,
  'app.autoStart': false,
  'backup.folder': null
}

// As chaves que a tela de Configurações grava (settings:set).
export const USER_SETTING_KEYS = [
  'theme',
  'aging.enabled',
  'calendar.showTasks',
  'calendar.strikeDone',
  'calendar.weekStart',
  'tray.keep',
  'app.autoStart'
] as const satisfies readonly SettingKey[]

export type UserSettingKey = (typeof USER_SETTING_KEYS)[number]

const entry = <K extends UserSettingKey>(key: K) =>
  z.object({ key: z.literal(key), value: SETTING_SCHEMAS[key] })

export const setSettingInput = z.discriminatedUnion('key', [
  entry('theme'),
  entry('aging.enabled'),
  entry('calendar.showTasks'),
  entry('calendar.strikeDone'),
  entry('calendar.weekStart'),
  entry('tray.keep'),
  entry('app.autoStart')
])

export type SetSettingInput = z.infer<typeof setSettingInput>
