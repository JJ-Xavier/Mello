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
  })

  it('ATV-01: "1 registro", "2 registros"', () => {
    expect(activityCount(1)).toBe('1 registro')
    expect(activityCount(2)).toBe('2 registros')
    expect(activityCount(0)).toBe('0 registros')
  })
})
