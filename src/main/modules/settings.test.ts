import { beforeEach, describe, expect, it } from 'vitest'
import { SETTING_DEFAULTS } from '../../shared/ipc/settings'
import { createTestDb } from '../db/test-db'
import { setting } from '../db/schema'
import * as settings from './settings'

let t: ReturnType<typeof createTestDb>

beforeEach(() => {
  t = createTestDb()
})

const store = (key: string, value: string) =>
  t.db
    .insert(setting)
    .values({ key, value })
    .onConflictDoUpdate({ target: setting.key, set: { value } })
    .run()

describe('configurações', () => {
  it('sem nada gravado, valem os padrões (tarefas e riscado ligados, semana no domingo)', () => {
    expect(settings.get(t.db)).toEqual({
      'calendar.showTasks': true,
      'calendar.strikeDone': true,
      'calendar.weekStart': 'sunday'
    })
    expect(settings.get(t.db)).toEqual(SETTING_DEFAULTS)
  })

  it('o valor gravado vale', () => {
    store('calendar.showTasks', 'false')
    store('calendar.weekStart', '"monday"')
    expect(settings.get(t.db)).toMatchObject({
      'calendar.showTasks': false,
      'calendar.strikeDone': true,
      'calendar.weekStart': 'monday'
    })
  })

  it('valor inválido ou ilegível volta ao padrão; chave desconhecida é ignorada', () => {
    store('calendar.showTasks', 'talvez')
    store('calendar.weekStart', '"terça"')
    store('calendar.strikeDone', '1')
    store('outra.coisa', 'true')
    expect(settings.get(t.db)).toEqual(SETTING_DEFAULTS)
  })
})
