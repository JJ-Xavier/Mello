import { beforeEach, describe, expect, it } from 'vitest'
import { CHANNELS } from '../../shared/ipc/api'
import { SETTING_DEFAULTS } from '../../shared/ipc/settings'
import { createClock } from '../clock'
import { createTestDb } from '../db/test-db'
import { setting } from '../db/schema'
import { createRoutes } from '../ipc/routes'
import * as settings from './settings'
import { createTestFiles } from './test-files'

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
  it('sem nada gravado, valem os padrões (tema escuro, envelhecimento, tarefas e riscado ligados, semana no domingo, bandeja ligada, sem iniciar com o Windows, pasta de backup padrão)', () => {
    expect(settings.get(t.db)).toEqual({
      theme: 'dark',
      'aging.enabled': true,
      'calendar.showTasks': true,
      'calendar.strikeDone': true,
      'calendar.weekStart': 'sunday',
      'tray.keep': true,
      'tray.noticeShown': false,
      'app.autoStart': false,
      'backup.folder': null
    })
    expect(settings.get(t.db)).toEqual(SETTING_DEFAULTS)
  })

  it('o main grava uma chave (o aviso da bandeja); valor fora do schema é recusado', () => {
    settings.set(t.db, 'tray.noticeShown', true)
    settings.set(t.db, 'tray.noticeShown', true)
    expect(settings.get(t.db)['tray.noticeShown']).toBe(true)
    expect(() => settings.set(t.db, 'calendar.weekStart', 'terça' as 'monday')).toThrow()
  })

  it('o valor gravado vale', () => {
    store('calendar.showTasks', 'false')
    store('calendar.weekStart', '"monday"')
    store('aging.enabled', 'false')
    expect(settings.get(t.db)).toMatchObject({
      'aging.enabled': false,
      'calendar.showTasks': false,
      'calendar.strikeDone': true,
      'calendar.weekStart': 'monday'
    })
  })

  it('valor inválido ou ilegível volta ao padrão; chave desconhecida é ignorada', () => {
    store('calendar.showTasks', 'talvez')
    store('calendar.weekStart', '"terça"')
    store('calendar.strikeDone', '1')
    store('aging.enabled', 'null')
    store('outra.coisa', 'true')
    expect(settings.get(t.db)).toEqual(SETTING_DEFAULTS)
  })
})

describe('settings:set (etapa 10)', () => {
  function routes() {
    const files = createTestFiles()
    const applied: unknown[] = []
    const call = createRoutes({
      db: t.db,
      app: { version: '0', dataDir: '', dev: true },
      clock: createClock(),
      files: files.store,
      desktop: {
        applyTheme: (theme) => applied.push(['tema', theme]),
        setAutoStart: (enabled) => applied.push(['iniciar', enabled])
      }
    })
    return { set: (input: unknown) => call.get(CHANNELS.settingsSet)!(input), applied, files }
  }

  it('grava a opção da tela e devolve todas; o tema e o "Iniciar com o Windows" vão para o Windows', async () => {
    const r = routes()
    expect(await r.set({ key: 'calendar.weekStart', value: 'monday' })).toMatchObject({
      ok: true,
      data: { 'calendar.weekStart': 'monday', theme: 'dark' }
    })
    await r.set({ key: 'theme', value: 'system' })
    await r.set({ key: 'app.autoStart', value: true })
    expect(settings.get(t.db)).toMatchObject({ theme: 'system', 'app.autoStart': true })
    expect(r.applied).toEqual([
      ['tema', 'system'],
      ['iniciar', true]
    ])
    r.files.cleanup()
  })

  it('a pasta de backup e o aviso da bandeja não mudam pela tela; valor errado é recusado', async () => {
    const r = routes()
    for (const input of [
      { key: 'backup.folder', value: 'D:\\Backups' },
      { key: 'tray.noticeShown', value: true },
      { key: 'theme', value: 'azul' }
    ]) {
      expect(await r.set(input)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    }
    expect(settings.get(t.db)).toEqual(SETTING_DEFAULTS)
    r.files.cleanup()
  })
})
