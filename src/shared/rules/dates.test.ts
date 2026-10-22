import { describe, expect, it } from 'vitest'
import { dueDate, isOverdue } from './dates'

const at = (y: number, m: number, d: number, h = 0, min = 0, ms = 0) =>
  new Date(y, m - 1, d, h, min, 0, ms).getTime()

describe('data de entrega (DAT)', () => {
  it('lê a data com e sem hora, no horário local', () => {
    expect(dueDate('2026-10-20').getTime()).toBe(at(2026, 10, 20))
    expect(dueDate('2026-10-20T14:30').getTime()).toBe(at(2026, 10, 20, 14, 30))
  })

  it('DAT-02: sem hora, atrasa quando o dia acaba', () => {
    expect(isOverdue('2026-10-20', false, at(2026, 10, 20, 23, 59, 999))).toBe(false)
    expect(isOverdue('2026-10-20', false, at(2026, 10, 21))).toBe(true)
  })

  it('DAT-02: com hora, atrasa quando o instante passa', () => {
    expect(isOverdue('2026-10-20T14:30', false, at(2026, 10, 20, 14, 30))).toBe(false)
    expect(isOverdue('2026-10-20T14:30', false, at(2026, 10, 20, 14, 30, 1))).toBe(true)
  })

  it('DAT-02: card finalizado nunca atrasa', () => {
    expect(isOverdue('2026-01-01', true, at(2026, 10, 20))).toBe(false)
  })

  it('virada de mês e de ano', () => {
    expect(isOverdue('2026-10-31', false, at(2026, 11, 1))).toBe(true)
    expect(isOverdue('2026-12-31', false, at(2026, 12, 31, 12))).toBe(false)
    expect(isOverdue('2026-12-31', false, at(2027, 1, 1))).toBe(true)
  })
})
