import { describe, expect, it } from 'vitest'
import { dueText, reminderAt, reminderNotification, reminderPreview } from './reminders'

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime()

describe('quando o lembrete dispara (LEM-01, LEM-02)', () => {
  it('"No horário" e "1 dia antes", com hora', () => {
    expect(reminderAt('2026-10-21T18:00', 'at_time')).toBe(at(21, 18))
    expect(reminderAt('2026-10-21T18:00', 'day_before')).toBe(at(20, 18))
  })

  it('LEM-02: data sem hora considera 09:00', () => {
    expect(reminderAt('2026-10-21', 'at_time')).toBe(at(21, 9))
    expect(reminderAt('2026-10-21', 'day_before')).toBe(at(20, 9))
  })

  it('LEM-01: sem lembrete, ou sem data, não dispara', () => {
    expect(reminderAt('2026-10-21', 'none')).toBeNull()
    expect(reminderAt(null, 'at_time')).toBeNull()
  })
})

describe('texto da notificação (LEM-03)', () => {
  const now = at(21, 10)

  it('hoje, ontem, amanhã ou a data', () => {
    expect(dueText('2026-10-21T18:00', now)).toBe('hoje, 18:00')
    expect(dueText('2026-10-20T18:00', now)).toBe('ontem, 18:00')
    expect(dueText('2026-10-22', now)).toBe('amanhã')
    expect(dueText('2026-10-26T09:00', now)).toBe('26 de out., 09:00')
  })

  it('título "Mello · <card>" e texto "Entrega <data> · <quadro>"', () => {
    expect(
      reminderNotification(
        { title: 'Pagar condomínio', dueAt: '2026-10-21T18:00', boardTitle: 'Casa' },
        now
      )
    ).toEqual({ title: 'Mello · Pagar condomínio', body: 'Entrega hoje, 18:00 · Casa' })
  })
})

describe('quando a notificação sai, no seletor de data', () => {
  const now = at(28, 14)

  it('o dia e a hora do lembrete; sem hora, 09:00 (LEM-02)', () => {
    expect(reminderPreview('2026-10-30T18:00', 'day_before', now)).toBe('qui., 29 de out., 18:00')
    expect(reminderPreview('2026-10-30', 'at_time', now)).toBe('sex., 30 de out., 09:00')
  })

  it('avisa quando o horário já passou; sem lembrete ou sem data, nada', () => {
    expect(reminderPreview('2026-10-28T11:00', 'at_time', now)).toBe(
      'qua., 28 de out., 11:00 (horário já passou)'
    )
    expect(reminderPreview('2026-10-30T18:00', 'none', now)).toBeNull()
    expect(reminderPreview(null, 'at_time', now)).toBeNull()
  })
})
