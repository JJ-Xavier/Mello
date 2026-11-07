// Configurações (tabela setting: chave → valor JSON). Uma chave que não foi gravada, ou que tem
// um valor inválido, vale o padrão (shared/ipc/settings.ts). A tela grava a partir da etapa 10;
// até lá, só o próprio main grava (o aviso da bandeja, etapa 8).
import {
  SETTING_DEFAULTS,
  SETTING_SCHEMAS,
  type SettingKey,
  type Settings
} from '../../shared/ipc/settings'
import type { DbOrTx } from '../db/client'
import { setting } from '../db/schema'

const isKey = (key: string): key is SettingKey => Object.hasOwn(SETTING_SCHEMAS, key)

export function get(db: DbOrTx): Settings {
  const settings: Record<string, unknown> = { ...SETTING_DEFAULTS }
  for (const row of db.select().from(setting).all()) {
    if (!isKey(row.key)) continue
    let value: unknown
    try {
      value = JSON.parse(row.value)
    } catch {
      continue
    }
    const parsed = SETTING_SCHEMAS[row.key].safeParse(value)
    if (parsed.success) settings[row.key] = parsed.data
  }
  return settings as Settings
}

export function set<K extends SettingKey>(db: DbOrTx, key: K, value: Settings[K]): void {
  const json = JSON.stringify(SETTING_SCHEMAS[key].parse(value))
  db.insert(setting)
    .values({ key, value: json })
    .onConflictDoUpdate({ target: setting.key, set: { value: json } })
    .run()
}
