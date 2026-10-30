import { describe, expect, it } from 'vitest'
import {
  addTarget,
  calendarWeeks,
  monthRange,
  shiftMonth,
  sortDayCards,
  sortDayTasks,
  visibleCount
} from './calendar'

const days = (weeks: { day: string; inMonth: boolean }[][]) => weeks.flat().map((d) => d.day)

describe('grade do mês (CAL-03)', () => {
  it('outubro de 2026 começando no domingo: 5 semanas, de 27/09 a 31/10', () => {
    const weeks = calendarWeeks(2026, 10, 'sunday')
    expect(weeks).toHaveLength(5)
    expect(weeks[0]![0]).toEqual({ day: '2026-09-27', inMonth: false })
    expect(weeks[0]![4]).toEqual({ day: '2026-10-01', inMonth: true })
    expect(weeks[4]![6]).toEqual({ day: '2026-10-31', inMonth: true })
  })

  it('começando na segunda, a semana vai de segunda a domingo', () => {
    const weeks = calendarWeeks(2026, 10, 'monday')
    expect(weeks[0]![0]).toEqual({ day: '2026-09-28', inMonth: false })
    expect(weeks[0]![3]).toEqual({ day: '2026-10-01', inMonth: true })
    expect(weeks.at(-1)!.at(-1)).toEqual({ day: '2026-11-01', inMonth: false })
  })

  it('o mesmo mês pode ter 6 semanas num início e 5 no outro (maio de 2026)', () => {
    expect(calendarWeeks(2026, 5, 'sunday')).toHaveLength(6)
    expect(calendarWeeks(2026, 5, 'monday')).toHaveLength(5)
  })

  it('agosto de 2026 tem 6 semanas nos dois inícios', () => {
    expect(calendarWeeks(2026, 8, 'sunday')).toHaveLength(6)
    expect(calendarWeeks(2026, 8, 'monday')).toHaveLength(6)
  })

  it('um mês que cabe em 4 semanas ganha a seguinte (fevereiro de 2026, no domingo)', () => {
    const weeks = calendarWeeks(2026, 2, 'sunday')
    expect(weeks).toHaveLength(5)
    expect(weeks[0]![0]).toEqual({ day: '2026-02-01', inMonth: true })
    expect(weeks[4]).toEqual(
      ['01', '02', '03', '04', '05', '06', '07'].map((d) => ({
        day: `2026-03-${d}`,
        inMonth: false
      }))
    )
  })

  it('ano bissexto: fevereiro de 2028 tem o dia 29', () => {
    const weeks = calendarWeeks(2028, 2, 'sunday')
    const inMonth = weeks.flat().filter((d) => d.inMonth)
    expect(inMonth).toHaveLength(29)
    expect(inMonth.at(-1)!.day).toBe('2028-02-29')
    expect(
      calendarWeeks(2026, 2, 'monday')
        .flat()
        .filter((d) => d.inMonth)
    ).toHaveLength(28)
  })

  it('virada de ano: dezembro de 2026 termina em janeiro de 2027', () => {
    const all = days(calendarWeeks(2026, 12, 'sunday'))
    expect(all).toContain('2026-12-31')
    expect(all.at(-1)).toBe('2027-01-02')
    expect(new Set(all).size).toBe(all.length)
  })
})

describe('intervalo e navegação do mês', () => {
  it('o intervalo vai do dia 1 ao dia 1 do mês seguinte, inclusive em dezembro', () => {
    expect(monthRange(2026, 10)).toEqual({ from: '2026-10-01', to: '2026-11-01' })
    expect(monthRange(2026, 12)).toEqual({ from: '2026-12-01', to: '2027-01-01' })
    const { from, to } = monthRange(2026, 10)
    expect('2026-10-31T23:59' >= from && '2026-10-31T23:59' < to).toBe(true)
    expect('2026-11-01' < to).toBe(false)
  })

  it('‹ e › passam pela virada do ano', () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 })
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 })
    expect(shiftMonth(2026, 10, 0)).toEqual({ year: 2026, month: 10 })
  })
})

describe('ordem dentro do dia (CAL-10)', () => {
  const card = (title: string, dueAt: string, priority: number | null = null) => ({
    title,
    dueAt,
    priority
  })

  it('sem hora primeiro, depois pela hora; empate pela prioridade e depois pelo título', () => {
    const sorted = sortDayCards([
      card('Reunião', '2026-10-21T15:00'),
      card('Dentista', '2026-10-21T09:30'),
      card('Banco', '2026-10-21'),
      card('Água', '2026-10-21', 3),
      card('Zelador', '2026-10-21', 1),
      card('Correio', '2026-10-21T09:30', 2)
    ])
    expect(sorted.map((c) => c.title)).toEqual([
      'Zelador',
      'Água',
      'Banco',
      'Correio',
      'Dentista',
      'Reunião'
    ])
  })

  it('tarefas juntas por card, na ordem em que chegam dentro do card', () => {
    const sorted = sortDayTasks([
      { cardTitle: 'Reforma', text: 'Tinta', dueDate: '2026-10-21' },
      { cardTitle: 'CNH', text: 'Documentos', dueDate: '2026-10-21' },
      { cardTitle: 'Reforma', text: 'Orçamento', dueDate: '2026-10-21' }
    ])
    expect(sorted.map((t) => t.text)).toEqual(['Documentos', 'Tinta', 'Orçamento'])
  })

  it('tarefas sem hora primeiro, depois pela hora; empate juntas por card', () => {
    const sorted = sortDayTasks([
      { cardTitle: 'Reforma', text: 'Pintar', dueDate: '2026-10-21T18:00' },
      { cardTitle: 'Reforma', text: 'Lixar', dueDate: '2026-10-21T09:00' },
      { cardTitle: 'Reforma', text: 'Tinta', dueDate: '2026-10-21' },
      { cardTitle: 'CNH', text: 'Foto', dueDate: '2026-10-21T09:00' }
    ])
    expect(sorted.map((t) => t.text)).toEqual(['Tinta', 'Foto', 'Lixar', 'Pintar'])
  })
})

describe('"Adicionar" (CAL-12)', () => {
  it('a primeira lista que não é de conclusão', () => {
    const lists = [
      { id: 'c', isDoneList: true },
      { id: 'a', isDoneList: false },
      { id: 'b', isDoneList: false }
    ]
    expect(addTarget(lists)?.id).toBe('a')
    expect(addTarget([{ id: 'c', isDoneList: true }])).toBeNull()
    expect(addTarget([])).toBeNull()
  })
})

describe('"+N mais" (CAL-13)', () => {
  // Itens de 30 px com 4 px entre eles terminam em 30, 64 e 98.
  it('todos cabem: aparecem todos, sem o "+N mais"', () => {
    expect(visibleCount([30, 64], 64, 4, 24)).toBe(2)
    expect(visibleCount([30, 64, 98], 98, 4, 24)).toBe(3)
    expect(visibleCount([], 64, 4, 24)).toBe(0)
  })

  it('não cabem: os que cabem deixando lugar para o "+N mais"', () => {
    // Com 70 px, o segundo item até caberia (64), mas aí o "+N mais" (4 + 24) não cabe.
    expect(visibleCount([30, 64, 98], 70, 4, 24)).toBe(1)
    expect(visibleCount([30, 64, 98], 92, 4, 24)).toBe(2)
  })

  it('um dia baixo demais mostra só o "+N mais"', () => {
    expect(visibleCount([40, 64], 30, 4, 24)).toBe(0)
  })

  it('sem medidas (tudo 0 px, como nos testes da tela), aparecem todos', () => {
    expect(visibleCount([0, 0, 0], 0, 4, 24)).toBe(3)
  })
})
