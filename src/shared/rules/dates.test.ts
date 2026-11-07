import { describe, expect, it } from 'vitest'
import { dueDate, dueStatus, durationText, isOverdue } from './dates'

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

describe('no prazo ou em atraso, e quanto falta (DAT-05)', () => {
  const now = at(2026, 10, 28, 14)

  it('a duração em dias, horas e minutos', () => {
    expect(durationText(40)).toBe('40 min')
    expect(durationText(60)).toBe('1 h')
    expect(durationText(200)).toBe('3 h e 20 min')
    expect(durationText(1440)).toBe('1 dia')
    expect(durationText(3120 + 15)).toBe('2 dias e 4 h')
  })

  it('com hora: quanto falta ou há quanto tempo venceu', () => {
    expect(dueStatus('2026-10-30T18:00', false, now)).toEqual({
      kind: 'onTime',
      text: 'faltam 2 dias e 4 h'
    })
    expect(dueStatus('2026-10-28T14:30', false, now)).toEqual({
      kind: 'onTime',
      text: 'faltam 30 min'
    })
    expect(dueStatus('2026-10-28T14:00', false, now)).toEqual({
      kind: 'onTime',
      text: 'vence agora'
    })
    expect(dueStatus('2026-10-28T11:00', false, now)).toEqual({ kind: 'late', text: 'há 3 h' })
    expect(dueStatus('2026-10-28T13:59', false, now + 30_000)).toEqual({
      kind: 'late',
      text: 'há 1 min'
    })
  })

  it('sem hora: em dias, e vale até o fim do dia', () => {
    expect(dueStatus('2026-10-28', false, now).text).toBe('vence hoje, até o fim do dia')
    expect(dueStatus('2026-10-29', false, now).text).toBe('vence amanhã')
    expect(dueStatus('2026-11-02', false, now).text).toBe('vence em 5 dias')
    expect(dueStatus('2026-10-27', false, now)).toEqual({ kind: 'late', text: 'venceu ontem' })
    expect(dueStatus('2026-10-24', false, now)).toEqual({
      kind: 'late',
      text: 'venceu há 4 dias'
    })
  })

  it('finalizado não conta atraso', () => {
    expect(dueStatus('2026-10-20T09:00', true, now)).toEqual({
      kind: 'done',
      text: 'não conta como atraso'
    })
  })
})
