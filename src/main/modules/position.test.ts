import { describe, expect, it } from 'vitest'
import { keyAt, keysFor, rebalance, visibleIndex, type Positioned } from './position'

function order(items: Positioned[]): string[] {
  return [...items].sort((a, b) => (a.position < b.position ? -1 : 1)).map((i) => i.id)
}

function moveTo(items: Positioned[], id: string, index: number): string[] {
  const others = items.filter((i) => i.id !== id)
  const key = keyAt(others, index)
  expect(key).not.toBeNull()
  return order([...others, { id, position: key! }])
}

describe('posição fracionária', () => {
  const [a, b, c, d] = keysFor(4) as [string, string, string, string]
  const lists: Positioned[] = [
    { id: 'A', position: a },
    { id: 'B', position: b },
    { id: 'C', position: c },
    { id: 'D', position: d }
  ]

  it('as chaves geradas ficam em ordem', () => {
    expect(order(lists)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('mover para o início, para o meio e para o fim', () => {
    expect(moveTo(lists, 'D', 0)).toEqual(['D', 'A', 'B', 'C'])
    expect(moveTo(lists, 'A', 2)).toEqual(['B', 'C', 'A', 'D'])
    expect(moveTo(lists, 'B', 3)).toEqual(['A', 'C', 'D', 'B'])
  })

  it('um índice além do fim vai para o fim', () => {
    expect(moveTo(lists, 'A', 99)).toEqual(['B', 'C', 'D', 'A'])
  })

  it('mover muitas vezes para o mesmo lugar continua funcionando', () => {
    let items = lists
    for (let i = 0; i < 50; i++) {
      const ids = moveTo(items, 'D', 1)
      const others = items.filter((x) => x.id !== 'D')
      items = [...others, { id: 'D', position: keyAt(others, 1)! }]
      expect(ids).toEqual(['A', 'D', 'B', 'C'])
    }
  })

  it('itens ocultos (listas arquivadas) não contam no índice', () => {
    const withHidden: Positioned[] = [
      { id: 'A', position: a },
      { id: 'X', position: b, hidden: true },
      { id: 'C', position: c },
      { id: 'D', position: d }
    ]
    // índice 1 entre os visíveis = logo depois de A, antes do oculto X
    expect(moveTo(withHidden, 'D', 1)).toEqual(['A', 'D', 'X', 'C'])
    expect(visibleIndex(withHidden, 'C')).toBe(1)
  })

  it('posições repetidas pedem reorganização, que restaura a ordem', () => {
    const broken: Positioned[] = [
      { id: 'A', position: 'a0' },
      { id: 'B', position: 'a0' },
      { id: 'C', position: 'a1' }
    ]
    expect(keyAt(broken, 1)).toBeNull()
    const fixed = rebalance(broken)
    const rebuilt = broken.map((i) => ({ ...i, position: fixed.get(i.id)! }))
    expect(order(rebuilt)).toEqual(['A', 'B', 'C'])
    expect(keyAt(rebuilt, 1)).not.toBeNull()
  })
})
