// Envelhecimento na tela (etapa 6): o visual do card no quadro (ENV-09), o que congela (ENV-03),
// o que zera (ENV-05) e o indicador do modal (ENV-08).
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { card as cardTable, setting } from '../../../../main/db/schema'
import type { MelloApi } from '../../../../shared/ipc/api'
import type { BoardSummary } from '../../../../shared/ipc/boards'
import { DAY_MS } from '../../../../shared/rules/aging'
import { App } from '../../app/App'
import { unwrap } from '../../lib/api'
import { installRealApi } from '../../test/realApi'

let api: MelloApi
let db: ReturnType<typeof installRealApi>['db']
let board: BoardSummary
let lists: Record<string, string>

beforeEach(async () => {
  ;({ api, db } = installRealApi())
  board = await unwrap(api.boards.create({ title: 'Casa' }))
  const detail = await unwrap(api.boards.get({ boardId: board.id }))
  lists = Object.fromEntries(detail.lists.map((l) => [l.title, l.id]))
})

// Card parado há `days` dias (a última alteração fica no passado).
async function idleCard(listTitle: string, title: string, days: number) {
  const { id } = await unwrap(api.cards.create({ listId: lists[listTitle]!, title }))
  db.update(cardTable)
    .set({ lastActivityAt: Date.now() - days * DAY_MS - 60_000 })
    .where(eq(cardTable.id, id))
    .run()
  return id
}

function renderBoard(search = '') {
  window.location.hash = `#/boards/${board.id}${search}`
  return render(<App />)
}

const face = (name: string | RegExp) => screen.findByRole('link', { name })

async function press(target: Element, code: string) {
  fireEvent.keyDown(target, { code, key: code === 'Space' ? ' ' : code })
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
}

describe('envelhecimento no quadro (ENV-09)', () => {
  it('card parado fica gasto, com o cinza do nível; o leitor de tela ouve há quantos dias', async () => {
    await idleCard('A fazer', 'Pintar a cerca', 9)
    await idleCard('A fazer', 'Regar', 0)
    renderBoard()
    const old = await face('Pintar a cerca, parado há 9 dias')
    expect(old.getAttribute('style')).toMatch(/radial-gradient\(circle .*var\(--fog3\)/)
    expect(old.getAttribute('style')).toContain('var(--aging-tone)')
    const fresh = await face('Regar')
    expect(fresh.getAttribute('style')).toBeNull()
  })

  it('FUN-09: o tom de baixo é o do fundo do quadro', async () => {
    renderBoard()
    const page = (await screen.findByRole('region', { name: 'A fazer' })).closest('[style]')!
    const detail = await unwrap(api.boards.get({ boardId: board.id }))
    expect(page.getAttribute('style')).toContain(`--aging-tone: ${detail.bgTone}`)
  })

  it('ENV-03: lista que não envelhece e envelhecimento desligado ficam normais', async () => {
    await idleCard('Concluído', 'Entregue ontem', 20)
    await idleCard('A fazer', 'Velho', 20)
    const { unmount } = renderBoard()
    expect(await face('Entregue ontem')).toBeTruthy()
    expect(await face('Velho, parado há 20 dias')).toBeTruthy()
    unmount()

    db.insert(setting).values({ key: 'aging.enabled', value: 'false' }).run()
    renderBoard()
    expect(await face('Velho')).toBeTruthy()
  })

  it('FIN-04: card com ✓ fora de lista de conclusão envelhece', async () => {
    const id = await idleCard('A fazer', 'Marcado', 6)
    db.update(cardTable).set({ isDone: true }).where(eq(cardTable.id, id)).run()
    renderBoard()
    expect(await face(/Marcado, parado há 6 dias/)).toBeTruthy()
  })

  it('ENV-05: mover o card o deixa novo na hora', async () => {
    const id = await idleCard('A fazer', 'Compras', 12)
    renderBoard()
    const card = await face('Compras, parado há 12 dias')
    await press(card, 'Space')
    await press(card, 'ArrowRight')
    await press(card, 'Space')
    const moved = await face('Compras')
    expect(moved.getAttribute('style')).toBeNull()
    await expect
      .poll(async () => (await unwrap(api.cards.get({ cardId: id }))).lastActivityAt)
      .toBeGreaterThan(Date.now() - DAY_MS)
  })
})

describe('indicador do modal (ENV-08)', () => {
  async function status(cardId: string) {
    renderBoard(`?card=${cardId}`)
    const modal = await screen.findByRole('dialog')
    return within(modal).findByText(/^(Parado há|Não envelhece)/)
  }

  it('mostra há quantos dias e o nível, com as barrinhas acesas', async () => {
    const id = await idleCard('A fazer', 'Compras', 9)
    const chip = await status(id)
    expect(chip.textContent).toBe('Parado há 9 dias · nível 3 de 5')
    const bars = chip.querySelector('[aria-hidden="true"]')!.children
    expect(bars).toHaveLength(5)
  })

  it('card novo: menos de 1 dia, nível 0', async () => {
    const id = await idleCard('A fazer', 'Compras', 0)
    expect((await status(id)).textContent).toBe('Parado há menos de 1 dia · nível 0 de 5')
  })

  it('congelado mostra "Não envelhece" e o motivo', async () => {
    const id = await idleCard('Concluído', 'Entregue', 20)
    expect((await status(id)).textContent).toBe('Não envelhece · lista congelada')
  })

  it('finalizado numa lista de conclusão que envelhece', async () => {
    await unwrap(api.lists.update({ listId: lists['Concluído']!, freezesAging: false }))
    const id = await idleCard('Concluído', 'Entregue', 20)
    db.update(cardTable).set({ isDone: true }).where(eq(cardTable.id, id)).run()
    expect((await status(id)).textContent).toBe('Não envelhece · finalizado')
  })

  it('desligado nas Configurações', async () => {
    db.insert(setting).values({ key: 'aging.enabled', value: 'false' }).run()
    const id = await idleCard('A fazer', 'Compras', 20)
    expect((await status(id)).textContent).toBe('Não envelhece · desligado nas Configurações')
  })
})
