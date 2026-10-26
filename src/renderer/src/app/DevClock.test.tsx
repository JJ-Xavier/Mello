// Relógio de teste do modo de desenvolvimento (decidido em 24/10/2026) e o aceite da etapa 6: com
// o relógio adiantado, o card passa pelos 5 níveis.
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { MelloApi } from '../../../shared/ipc/api'
import { DAY_MS } from '../../../shared/rules/aging'
import { unwrap } from '../lib/api'
import { setClockOffset } from '../lib/clock'
import { installRealApi } from '../test/realApi'
import { App } from './App'

afterEach(() => setClockOffset(0))

const keys = (code: string, shift = false, target: Element = document.body) =>
  fireEvent.keyDown(target, { code, key: code, ctrlKey: true, altKey: true, shiftKey: shift })

async function setup(dev = true) {
  const { api } = installRealApi({ dev })
  const board = await unwrap(api.boards.create({ title: 'Casa' }))
  const detail = await unwrap(api.boards.get({ boardId: board.id }))
  await unwrap(api.cards.create({ listId: detail.lists[0]!.id, title: 'Compras' }))
  window.location.hash = `#/boards/${board.id}`
  render(<App />)
  await screen.findByRole('link', { name: 'Compras' })
  return api
}

const offsetIn = async (api: MelloApi) => (await unwrap(api.dev.clock())).offset

describe('relógio de teste', () => {
  it('Ctrl+Alt+→ adianta 1 dia; com Shift, 1 hora; ← volta; o selo mostra quanto', async () => {
    const api = await setup()
    expect(screen.queryByText(/^Relógio/)).toBeNull()
    keys('ArrowRight')
    expect(await screen.findByText('Relógio +1 dia')).toBeTruthy()
    keys('ArrowRight', true)
    expect(await screen.findByText('Relógio +1 dia e 1 h')).toBeTruthy()
    keys('ArrowLeft')
    expect(await screen.findByText('Relógio +1 h')).toBeTruthy()
    expect(await offsetIn(api)).toBe(3_600_000)
    keys('ArrowLeft')
    await expect.poll(() => screen.queryByText(/^Relógio/)).toBeNull()
    expect(await offsetIn(api)).toBe(0)
  })

  it('Ctrl+Alt+0 volta ao relógio real, menos dentro de um campo de texto', async () => {
    const api = await setup()
    keys('ArrowRight')
    keys('ArrowRight')
    expect(await screen.findByText('Relógio +2 dias')).toBeTruthy()
    const search = screen.getByRole('textbox', { name: 'Pesquisar' })
    keys('Digit0', false, search)
    expect(await offsetIn(api)).toBe(2 * DAY_MS)
    keys('Digit0')
    await expect.poll(() => screen.queryByText(/^Relógio/)).toBeNull()
    expect(await offsetIn(api)).toBe(0)
  })

  it('aceite: com o relógio adiantado, o card passa pelos 5 níveis', async () => {
    await setup()
    const levels: string[] = []
    for (let day = 1; day <= 14; day++) {
      keys('ArrowRight')
      await screen.findByText(day === 1 ? 'Relógio +1 dia' : `Relógio +${day} dias`)
      const card = await screen.findByRole('link', { name: /^Compras/ })
      levels.push(/var\(--fog(\d)\)/.exec(card.getAttribute('style') ?? '')?.[1] ?? '0')
    }
    expect(levels.join('')).toBe('00111222333445')
  })

  it('o que é gravado com o relógio adiantado nasce novo', async () => {
    const api = await setup()
    for (let day = 1; day <= 5; day++) keys('ArrowRight')
    await expect.poll(() => offsetIn(api)).toBe(5 * DAY_MS)
    const board = (await unwrap(api.boards.list()))[0]!
    const detail = await unwrap(api.boards.get({ boardId: board.id }))
    const created = await unwrap(api.cards.create({ listId: detail.lists[0]!.id, title: 'Depois' }))
    expect((await unwrap(api.cards.get({ cardId: created.id }))).lastActivityAt).toBeGreaterThan(
      Date.now() + 4 * DAY_MS
    )
  })

  it('o app instalado não tem o relógio de teste', async () => {
    const api = await setup(false)
    keys('ArrowRight')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByText(/^Relógio/)).toBeNull()
    expect(await offsetIn(api)).toBe(0)
  })
})
