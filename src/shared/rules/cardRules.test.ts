import { describe, expect, it } from 'vitest'
import { itemDateState, progress } from './checklist'
import { colorName, LABEL_COLORS, textOn } from './color'
import {
  formatDayInput,
  isDay,
  isDue,
  monthGrid,
  parseDayInput,
  parseTimeInput,
  sortByDue
} from './dates'
import { cardMatches, isFilterActive, NO_FILTER } from './filter'
import { PRIORITIES, priorityLevel, sortByPriority } from './priority'

const at = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h).getTime()

describe('prioridade (PRI)', () => {
  it('PRI-01: cinco níveis com os ícones e as cores do protótipo', () => {
    expect(PRIORITIES.map((p) => p.name)).toEqual([
      'Muito alta',
      'Alta',
      'Média',
      'Baixa',
      'Muito baixa'
    ])
    expect(priorityLevel(3)).toMatchObject({ path: 'M5 9h14M5 15h14', dark: '#f5cd47' })
    expect(priorityLevel(null)).toBeNull()
  })

  it('PRI-05: do 1 ao 5, sem prioridade no fim, empates estáveis', () => {
    const cards = [
      { id: 'a', priority: null },
      { id: 'b', priority: 3 },
      { id: 'c', priority: 1 },
      { id: 'd', priority: 3 }
    ]
    expect(sortByPriority(cards).map((c) => c.id)).toEqual(['c', 'b', 'd', 'a'])
    expect(cards.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('cores das etiquetas (ETQ)', () => {
  it('texto escuro no amarelo e no cinza, branco nas outras (como no protótipo)', () => {
    const dark = LABEL_COLORS.filter((c) => textOn(c.value) === '#1d2125').map((c) => c.name)
    expect(dark).toEqual(['amarelo', 'cinza'])
    expect(colorName('#6E5DC6')).toBe('roxo')
  })
})

describe('checklist (CHK)', () => {
  it('CHK-02: porcentagem arredondada; vazio é 0%', () => {
    expect(progress(0, 0)).toBe(0)
    expect(progress(1, 3)).toBe(33)
    expect(progress(2, 3)).toBe(67)
    expect(progress(4, 4)).toBe(100)
  })

  it('CHK-06: cinza, vermelho quando a data passou e não está marcado, verde marcado', () => {
    const now = at(2026, 10, 21, 12)
    expect(itemDateState('2026-10-22', false, now)).toBe('normal')
    expect(itemDateState('2026-10-21', false, now)).toBe('normal')
    expect(itemDateState('2026-10-20', false, now)).toBe('late')
    expect(itemDateState('2026-10-20', true, now)).toBe('done')
  })
})

describe('campos de data (DAT)', () => {
  it('lê "dd/mm/aaaa" e "hh:mm", recusando o que não existe', () => {
    expect(parseDayInput('19/09/2026')).toBe('2026-09-19')
    expect(parseDayInput(' 1/2/2027 ')).toBe('2027-02-01')
    expect(parseDayInput('29/02/2026')).toBeNull()
    expect(parseDayInput('29/02/2028')).toBe('2028-02-29')
    expect(parseDayInput('2026-09-19')).toBeNull()
    expect(formatDayInput('2026-09-19')).toBe('19/09/2026')
    expect(parseTimeInput('9:05')).toBe('09:05')
    expect(parseTimeInput('17:00')).toBe('17:00')
    expect(parseTimeInput('24:00')).toBeNull()
    expect(parseTimeInput('17h')).toBeNull()
  })

  it('valida o que chega pelo IPC', () => {
    expect(isDay('2026-10-20')).toBe(true)
    expect(isDay('2026-13-01')).toBe(false)
    expect(isDue('2026-10-20T09:30')).toBe(true)
    expect(isDue('2026-10-20T9:30')).toBe(false)
    expect(isDue('2026-10-20T25:00')).toBe(false)
  })

  it('DAT-04: prazo mais cedo primeiro; dia inteiro depois de um horário no mesmo dia', () => {
    const cards = [
      { id: 'sem', dueAt: null },
      { id: 'dia20', dueAt: '2026-10-20' },
      { id: 'dia20-10h', dueAt: '2026-10-20T10:00' },
      { id: 'dia18', dueAt: '2026-10-18' }
    ]
    expect(sortByDue(cards).map((c) => c.id)).toEqual(['dia18', 'dia20-10h', 'dia20', 'sem'])
  })

  it('grade do mês do seletor: domingo a sábado, 5 ou 6 semanas', () => {
    const outubro = monthGrid(2026, 10)
    expect(outubro).toHaveLength(5)
    expect(outubro[0]![0]).toEqual({ day: '2026-09-27', inMonth: false })
    expect(outubro[0]![4]).toEqual({ day: '2026-10-01', inMonth: true })
    expect(outubro.at(-1)!.at(-1)).toEqual({ day: '2026-10-31', inMonth: true })
    expect(monthGrid(2026, 8)).toHaveLength(6)
    expect(monthGrid(2026, 2)).toHaveLength(4)
  })
})

describe('filtro do quadro (FLT)', () => {
  const card = (id: string, priority: number | null, recurring = false) => ({
    id,
    priority,
    recurring
  })

  it('sem filtro, tudo aparece', () => {
    expect(isFilterActive(NO_FILTER)).toBe(false)
    expect(cardMatches(card('a', null), NO_FILTER, null)).toBe(true)
  })

  it('FLT-02: só as prioridades marcadas', () => {
    const filter = { ...NO_FILTER, priorities: [1, 2] }
    expect(isFilterActive(filter)).toBe(true)
    expect(cardMatches(card('a', 1), filter, null)).toBe(true)
    expect(cardMatches(card('b', 3), filter, null)).toBe(false)
    expect(cardMatches(card('c', null), filter, null)).toBe(false)
  })

  it('FLT-03 e FLT-04: só recorrentes; os critérios se somam', () => {
    const filter = { keyword: 'mercado', priorities: [1], recurringOnly: true }
    const matching = new Set(['a', 'b'])
    expect(cardMatches(card('a', 1, true), filter, matching)).toBe(true)
    expect(cardMatches(card('b', 1, false), filter, matching)).toBe(false)
    expect(cardMatches(card('c', 1, true), filter, matching)).toBe(false)
  })

  it('FLT-01: enquanto a busca não volta, a palavra-chave não esconde nada', () => {
    const filter = { ...NO_FILTER, keyword: 'mercado' }
    expect(cardMatches(card('a', null), filter, null)).toBe(true)
    expect(cardMatches(card('a', null), filter, new Set())).toBe(false)
  })
})
