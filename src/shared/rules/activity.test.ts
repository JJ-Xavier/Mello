import { describe, expect, it } from 'vitest'
import type { ActivityEntry } from '../ipc/cards'
import { activityCount, activityText } from './activity'

const entry = (kind: ActivityEntry['kind'], data: Record<string, unknown> = {}): ActivityEntry => ({
  id: 'x',
  kind,
  data,
  createdAt: 0
})

describe('ATV-02: o texto de cada registro', () => {
  it('criado, movido (inclusive entre quadros), ✓, arquivado, restaurado e copiado', () => {
    expect(activityText(entry('created', { list: 'A fazer' }))).toBe('Criado em A fazer')
    expect(activityText(entry('moved', { from: 'A fazer', to: 'Feito' }))).toBe(
      'Movido de A fazer para Feito'
    )
    expect(
      activityText(
        entry('moved', { from: 'A fazer', to: 'Lido', fromBoard: 'Casa', toBoard: 'Estudos' })
      )
    ).toBe('Movido de A fazer (Casa) para Lido (Estudos)')
    expect(activityText(entry('done'))).toBe('Marcado como concluído')
    expect(activityText(entry('undone'))).toBe('Marcado como não concluído')
    expect(activityText(entry('archived'))).toBe('Arquivado')
    expect(activityText(entry('restored'))).toBe('Restaurado')
    expect(activityText(entry('copied', { from: 'Compras' }))).toBe('Copiado de “Compras”')
  })

  it('registro com os dados faltando não quebra', () => {
    expect(activityText(entry('created'))).toBe('Criado em ')
    expect(activityText(entry('from_recurrence'))).toBe('Criado pela repetição')
    expect(activityText(entry('recurrence_missed', { count: 3 }))).toBe(
      '3 repetições não criadas: app fechado'
    )
  })

  it('repetição: criado (REP-12), pulada (REP-08) e não criadas com o app fechado (REP-10)', () => {
    expect(activityText(entry('from_recurrence', { date: '2026-10-26T08:00' }))).toBe(
      'Criado pela repetição de seg., 26 de out.'
    )
    expect(activityText(entry('recurrence_skipped', { date: '2026-10-26T08:00' }))).toBe(
      'Repetição de seg., 26 de out. pulada: este card ainda não foi concluído'
    )
    expect(
      activityText(
        entry('recurrence_missed', { from: '2026-10-22T08:00', to: '2026-10-22T08:00', count: 1 })
      )
    ).toBe('Repetição de qui., 22 de out. não criada: app fechado')
    expect(
      activityText(
        entry('recurrence_missed', { from: '2026-10-22T08:00', to: '2026-10-30T08:00', count: 9 })
      )
    ).toBe('9 repetições não criadas, de qui., 22 de out. a sex., 30 de out.: app fechado')
  })

  it('ATV-01: "1 registro", "2 registros"', () => {
    expect(activityCount(1)).toBe('1 registro')
    expect(activityCount(2)).toBe('2 registros')
    expect(activityCount(0)).toBe('0 registros')
  })
})
