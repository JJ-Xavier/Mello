import { describe, expect, it } from 'vitest'
import { agingOf, DAY_MS, levelForDays, type AgingCard, type AgingList } from './aging'

const NOW = 1_800_000_000_000
const common: AgingList = { freezesAging: false, isDoneList: false }
const frozenList: AgingList = { freezesAging: true, isDoneList: false }
const doneList: AgingList = { freezesAging: false, isDoneList: true }

// Card parado há `ms` milissegundos.
const idle = (ms: number, extra: Partial<AgingCard> = {}): AgingCard => ({
  lastActivityAt: NOW - ms,
  isDone: false,
  isTemplate: false,
  ...extra
})
const levelAfter = (ms: number) => agingOf(idle(ms), common, true, NOW).level

describe('envelhecimento (ENV)', () => {
  it.each([
    [3, 1],
    [6, 2],
    [9, 3],
    [12, 4],
    [14, 5]
  ])('ENV-02: no dia %i passa para o nível %i (1 ms antes ainda não)', (day, level) => {
    expect(levelAfter(day * DAY_MS - 1)).toBe(level - 1)
    expect(levelAfter(day * DAY_MS)).toBe(level)
  })

  it('ENV-01: conta dias inteiros; o card novo é nível 0', () => {
    expect(agingOf(idle(0), common, true, NOW)).toEqual({ level: 0, days: 0, frozen: null })
    expect(agingOf(idle(5 * DAY_MS - 1), common, true, NOW)).toEqual({
      level: 1,
      days: 4,
      frozen: null
    })
  })

  it('100 dias parado é nível 5; um relógio atrás da alteração conta 0 dias', () => {
    expect(levelAfter(100 * DAY_MS)).toBe(5)
    expect(agingOf(idle(-DAY_MS), common, true, NOW)).toEqual({ level: 0, days: 0, frozen: null })
  })

  it('ENV-02: tabela completa de dias', () => {
    expect(Array.from({ length: 16 }, (_, days) => levelForDays(days))).toEqual([
      0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5, 5
    ])
  })

  it('ENV-03: cada motivo congela no nível 0, sem perder os dias (ENV-04)', () => {
    const old = 20 * DAY_MS
    expect(agingOf(idle(old), common, false, NOW)).toEqual({
      level: 0,
      days: 20,
      frozen: 'disabled'
    })
    expect(agingOf(idle(old), frozenList, true, NOW).frozen).toBe('list')
    expect(agingOf(idle(old, { isDone: true }), doneList, true, NOW).frozen).toBe('finished')
    expect(agingOf(idle(old, { isTemplate: true }), common, true, NOW).frozen).toBe('template')
    // ENV-04: a condição deixou de valer, e o nível volta pela última alteração.
    expect(agingOf(idle(old), doneList, true, NOW)).toEqual({ level: 5, days: 20, frozen: null })
  })

  it('FIN-04: card com ✓ fora de lista de conclusão envelhece', () => {
    expect(agingOf(idle(9 * DAY_MS, { isDone: true }), common, true, NOW)).toEqual({
      level: 3,
      days: 9,
      frozen: null
    })
  })
})
