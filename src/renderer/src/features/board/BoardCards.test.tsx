import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { card as cardTable, label } from '../../../../main/db/schema'
import { insertCard } from '../../../../main/db/test-db'
import type { MelloApi } from '../../../../shared/ipc/api'
import type { BoardSummary } from '../../../../shared/ipc/boards'
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

function renderBoard(search = '') {
  window.location.hash = `#/boards/${board.id}${search}`
  return render(<App />)
}

function addCard(listTitle: string, title: string) {
  return unwrap(api.cards.create({ listId: lists[listTitle]!, title }))
}

async function titlesIn(listTitle: string): Promise<string[]> {
  const list = await screen.findByRole('region', { name: listTitle })
  return within(list)
    .queryAllByRole('link')
    .map((link) => link.textContent ?? '')
}

async function savedTitles(listTitle: string): Promise<string[]> {
  const detail = await unwrap(api.boards.get({ boardId: board.id }))
  return detail.lists.find((l) => l.title === listTitle)!.cards.map((c) => c.title)
}

// Teclado do dnd-kit: espaço pega, setas andam, espaço solta. Ele passa a ouvir as setas logo
// depois de pegar o card.
async function press(target: Element, code: string) {
  fireEvent.keyDown(target, { code, key: code === 'Space' ? ' ' : code })
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
}

describe('cards no quadro', () => {
  it('CAR-02: "Adicionar um cartão" põe o card no fim e deixa o campo aberto', async () => {
    await addCard('A fazer', 'Compras')
    renderBoard()
    const list = await screen.findByRole('region', { name: 'A fazer' })
    await within(list).findByRole('link', { name: 'Compras' })
    fireEvent.click(within(list).getByRole('button', { name: 'Adicionar um cartão' }))
    const input = within(list).getByLabelText('Título do card') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'Pagar a luz' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await within(list).findByRole('link', { name: 'Pagar a luz' })
    expect(await titlesIn('A fazer')).toEqual(['Compras', 'Pagar a luz'])
    expect(within(list).getByLabelText('2 cards')).toBeTruthy()
    expect(input.value).toBe('')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(within(list).queryByLabelText('Título do card')).toBeNull()
  })

  it('o menu da lista também abre o campo do card novo', async () => {
    renderBoard()
    const list = await screen.findByRole('region', { name: 'Em andamento' })
    fireEvent.click(within(list).getByRole('button', { name: 'Ações da lista' }))
    const menu = await screen.findByRole('dialog', { name: 'Ações da lista Em andamento' })
    fireEvent.click(within(menu).getByRole('button', { name: 'Adicionar cartão' }))
    expect(within(list).getByLabelText('Título do card')).toBeTruthy()
  })

  it('card criado numa lista de conclusão nasce sem ✓ (FIN-02, etapa 3)', async () => {
    renderBoard()
    const list = await screen.findByRole('region', { name: 'Concluído' })
    fireEvent.click(within(list).getByRole('button', { name: 'Adicionar um cartão' }))
    const input = within(list).getByLabelText('Título do card')
    fireEvent.change(input, { target: { value: 'Revisão' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    const created = await within(list).findByRole('link', { name: 'Revisão' })
    expect(within(created).queryByRole('img', { name: 'Concluído' })).toBeNull()
  })

  it('CAR-04: a face mostra etiqueta, ✓, data (verde ou em atraso) e os ícones', async () => {
    const urgent = db.select().from(label).where(eq(label.boardId, board.id)).all()[1]!
    db.update(label).set({ name: 'Urgente' }).where(eq(label.id, urgent.id)).run()
    const late = insertCard(db, lists['A fazer']!, {
      title: 'Contas',
      labelIds: [urgent.id],
      checklist: {
        title: 'Itens',
        items: [
          { text: 'Luz', isDone: true },
          { text: 'Água', isDone: false }
        ]
      }
    })
    db.update(cardTable)
      .set({ dueAt: '2020-01-10', descriptionText: 'Pagar até sexta', noteText: 'Ligar' })
      .where(eq(cardTable.id, late))
      .run()
    const done = insertCard(db, lists['Concluído']!, { title: 'Faxina', isDone: true })
    db.update(cardTable).set({ dueAt: '2020-01-10' }).where(eq(cardTable.id, done)).run()
    renderBoard()

    const contas = await screen.findByRole('link', { name: /Contas/ })
    expect(within(contas).getByTitle('Urgente')).toBeTruthy()
    expect(within(contas).getByText(', em atraso')).toBeTruthy()
    expect(within(contas).getByText('10 de jan.')).toBeTruthy()
    expect(within(contas).getByRole('img', { name: 'Tem descrição' })).toBeTruthy()
    expect(within(contas).getByRole('img', { name: 'Checklist: 1 de 2' })).toBeTruthy()
    expect(within(contas).getByRole('img', { name: 'Tem nota' })).toBeTruthy()
    expect(within(contas).queryByRole('img', { name: 'Concluído' })).toBeNull()

    const faxina = await screen.findByRole('link', { name: /Faxina/ })
    expect(within(faxina).getByRole('img', { name: 'Concluído' })).toBeTruthy()
    expect(within(faxina).getByText(', concluído')).toBeTruthy()
    expect(within(faxina).queryByText(', em atraso')).toBeNull()
  })

  it('clicar no card abre o modal com a lista e o título; fechar volta ao quadro', async () => {
    await addCard('A fazer', 'Compras')
    renderBoard()
    fireEvent.click(await screen.findByRole('link', { name: 'Compras' }))
    const modal = await screen.findByRole('dialog', { name: 'Compras' })
    expect(within(modal).getByText('A fazer')).toBeTruthy()
    fireEvent.click(within(modal).getByRole('button', { name: 'Fechar' }))
    await expect.poll(() => screen.queryByRole('dialog', { name: 'Compras' })).toBeNull()
    expect(window.location.hash).toBe(`#/boards/${board.id}`)
  })

  it('um card que não existe mais fecha o modal sozinho', async () => {
    renderBoard(`?card=${randomUUID()}`)
    await screen.findByRole('heading', { name: 'Casa' })
    await expect.poll(() => window.location.hash).toBe(`#/boards/${board.id}`)
  })

  it('"Criar card" no menu "Criar": escolhe a lista e o card aparece no quadro', async () => {
    renderBoard()
    fireEvent.click(await screen.findByRole('button', { name: 'Criar' }))
    const menu = await screen.findByRole('dialog', { name: 'Criar' })
    fireEvent.click(within(menu).getByRole('button', { name: /Criar card/ }))
    await within(menu).findByRole('option', { name: 'Em andamento' })
    fireEvent.change(within(menu).getByLabelText('Lista'), {
      target: { value: lists['Em andamento'] }
    })
    fireEvent.change(within(menu).getByLabelText('Título do card'), {
      target: { value: 'Ligar para o banco' }
    })
    fireEvent.click(within(menu).getByRole('button', { name: 'Adicionar cartão' }))
    const list = await screen.findByRole('region', { name: 'Em andamento' })
    expect(await within(list).findByRole('link', { name: 'Ligar para o banco' })).toBeTruthy()
  })
})

describe('arrastar cards pelo teclado', () => {
  it('setas escolhem a lista e a posição; espaço solta e grava', async () => {
    await addCard('A fazer', 'Compras')
    await addCard('Em andamento', 'Mudança')
    renderBoard()
    const card = await screen.findByRole('link', { name: 'Compras' })
    card.focus()
    await press(card, 'Space')
    await press(card, 'ArrowRight')
    expect(await screen.findByText('Em andamento, posição 1.')).toBeTruthy()
    await press(card, 'ArrowDown')
    expect(await screen.findByText('Em andamento, posição 2.')).toBeTruthy()
    await press(card, 'Space')

    await expect.poll(() => savedTitles('Em andamento')).toEqual(['Mudança', 'Compras'])
    expect(await titlesIn('Em andamento')).toEqual(['Mudança', 'Compras'])
    expect(await titlesIn('A fazer')).toEqual([])
  })

  it('FIN-02 e FIN-03: entrar na lista de conclusão marca o ✓; sair desmarca', async () => {
    const created = await addCard('Em andamento', 'Compras')
    renderBoard()
    let card = await screen.findByRole('link', { name: 'Compras' })
    await press(card, 'Space')
    await press(card, 'ArrowRight')
    await press(card, 'Space')
    await expect
      .poll(async () => (await unwrap(api.cards.get({ cardId: created.id }))).isDone)
      .toBe(true)
    card = await screen.findByRole('link', { name: /Compras/ })
    expect(within(card).getByRole('img', { name: 'Concluído' })).toBeTruthy()

    await press(card, 'Space')
    await press(card, 'ArrowLeft')
    await press(card, 'Space')
    await expect
      .poll(async () => (await unwrap(api.cards.get({ cardId: created.id }))).isDone)
      .toBe(false)
  })

  it('CAR-03: pegar e soltar no mesmo lugar não grava nada; Esc cancela', async () => {
    const created = await addCard('A fazer', 'Compras')
    await addCard('A fazer', 'Faxina')
    const before = db.select().from(cardTable).where(eq(cardTable.id, created.id)).get()
    renderBoard()
    const card = await screen.findByRole('link', { name: 'Compras' })
    await press(card, 'Space')
    await press(card, 'Space')
    expect(await screen.findByText('Compras voltou para o mesmo lugar.')).toBeTruthy()

    await press(card, 'Space')
    await press(card, 'ArrowDown')
    await press(card, 'Escape')
    expect(await titlesIn('A fazer')).toEqual(['Compras', 'Faxina'])
    expect(db.select().from(cardTable).where(eq(cardTable.id, created.id)).get()).toEqual(before)
  })
})
