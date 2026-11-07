import { describe, expect, it } from 'vitest'
import {
  nextOccurrences,
  nextRepeatText,
  occurrenceDayText,
  occurrencesBetween,
  previewDayText,
  recurrenceSummary,
  stampOf,
  type RecurrenceRule
} from './recurrence'

// Máscara dos dias: dom = 1, seg = 2, ter = 4, qua = 8, qui = 16, sex = 32, sáb = 64.
const SEG = 2
const QUA = 8
const SAB = 64
const DOM = 1

const rule = (changes: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
  freq: 'daily',
  weekdays: 0,
  monthDay: null,
  intervalDays: null,
  anchorDate: '2026-10-21',
  time: '08:00',
  endsKind: 'never',
  endsOn: null,
  endsAfter: null,
  ...changes
})

describe('REP-01: frequências', () => {
  it('diária: todo dia no horário, depois do momento salvo', () => {
    expect(occurrencesBetween(rule(), 0, '2026-10-20T09:00', '2026-10-23T08:00')).toEqual([
      '2026-10-21T08:00',
      '2026-10-22T08:00',
      '2026-10-23T08:00'
    ])
    // Salva antes das 08:00: a primeira é no mesmo dia.
    expect(nextOccurrences(rule(), 0, '2026-10-20T07:00', 1)).toEqual(['2026-10-20T08:00'])
  })

  it('semanal com vários dias (segunda e quarta)', () => {
    expect(
      nextOccurrences(rule({ freq: 'weekly', weekdays: SEG | QUA }), 0, '2026-10-19T09:00', 3)
    ).toEqual(['2026-10-21T08:00', '2026-10-26T08:00', '2026-10-28T08:00'])
  })

  it('mensal no dia 31: o último dia nos meses mais curtos (fevereiro, abril)', () => {
    expect(
      nextOccurrences(rule({ freq: 'monthly', monthDay: 31 }), 0, '2026-01-31T09:00', 4)
    ).toEqual(['2026-02-28T08:00', '2026-03-31T08:00', '2026-04-30T08:00', '2026-05-31T08:00'])
    // Ano bissexto.
    expect(
      nextOccurrences(rule({ freq: 'monthly', monthDay: 30 }), 0, '2028-01-31T00:00', 1)
    ).toEqual(['2028-02-29T08:00'])
  })

  it('a cada N dias, contando do dia em que foi salva (nunca o próprio dia)', () => {
    const every3 = rule({ freq: 'every_n', intervalDays: 3, anchorDate: '2026-10-21' })
    expect(nextOccurrences(every3, 0, '2026-10-21T07:00', 3)).toEqual([
      '2026-10-24T08:00',
      '2026-10-27T08:00',
      '2026-10-30T08:00'
    ])
  })

  it('virada de ano', () => {
    expect(occurrencesBetween(rule(), 0, '2026-12-30T09:00', '2027-01-02T08:00')).toEqual([
      '2026-12-31T08:00',
      '2027-01-01T08:00',
      '2027-01-02T08:00'
    ])
  })
})

describe('REP-06: término', () => {
  it('em uma data: até ela, inclusive', () => {
    const until = rule({ endsKind: 'on_date', endsOn: '2026-10-23' })
    expect(occurrencesBetween(until, 0, '2026-10-20T09:00', '2026-10-30T23:59')).toEqual([
      '2026-10-21T08:00',
      '2026-10-22T08:00',
      '2026-10-23T08:00'
    ])
    expect(nextOccurrences(until, 0, '2026-10-23T08:00', 1)).toEqual([])
  })

  it('depois de N vezes: desconta as que já venceram', () => {
    const three = rule({ endsKind: 'after_count', endsAfter: 3 })
    expect(occurrencesBetween(three, 1, '2026-10-20T09:00', '2026-10-30T23:59')).toEqual([
      '2026-10-21T08:00',
      '2026-10-22T08:00'
    ])
    expect(nextOccurrences(three, 3, '2026-10-20T09:00', 1)).toEqual([])
  })
})

describe('REP-17: resumo da regra', () => {
  it('cada frequência', () => {
    expect(recurrenceSummary(rule())).toBe('Todo dia, 08:00')
    expect(recurrenceSummary(rule({ freq: 'weekly', weekdays: SEG }))).toBe('Toda segunda, 08:00')
    expect(recurrenceSummary(rule({ freq: 'weekly', weekdays: SEG | QUA }))).toBe(
      'Toda segunda, quarta, 08:00'
    )
    expect(recurrenceSummary(rule({ freq: 'monthly', monthDay: 5 }))).toBe('Todo dia 5, 08:00')
    expect(recurrenceSummary(rule({ freq: 'every_n', intervalDays: 3 }))).toBe(
      'A cada 3 dias, 08:00'
    )
    expect(recurrenceSummary(rule({ freq: 'every_n', intervalDays: 1 }))).toBe(
      'A cada 1 dia, 08:00'
    )
  })

  it('"Todo" com domingo e sábado; sem dias, pede para escolher', () => {
    expect(recurrenceSummary(rule({ freq: 'weekly', weekdays: SAB }))).toBe('Todo sábado, 08:00')
    expect(recurrenceSummary(rule({ freq: 'weekly', weekdays: DOM | QUA }))).toBe(
      'Todo domingo, quarta, 08:00'
    )
    expect(recurrenceSummary(rule({ freq: 'weekly', weekdays: 0 }))).toBe('Escolha os dias')
  })
})

describe('textos de data', () => {
  it('o agora como ocorrência, o aviso e a prévia "Próximas:"', () => {
    expect(stampOf(new Date(2026, 9, 21, 9, 5).getTime())).toBe('2026-10-21T09:05')
    expect(occurrenceDayText('2026-10-19T08:00')).toBe('seg., 19 de out.')
    expect(previewDayText('2026-10-26T08:00')).toBe('seg. 26/10')
  })

  it('REP-13: dia da semana nos próximos 6 dias; depois, a data', () => {
    const now = new Date(2026, 9, 21, 10, 0).getTime()
    expect(nextRepeatText('2026-10-26T08:00', now)).toBe('seg.')
    expect(nextRepeatText('2026-10-27T08:00', now)).toBe('ter.')
    expect(nextRepeatText('2026-10-28T08:00', now)).toBe('28 out.')
  })
})
