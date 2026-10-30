import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MelloApi } from '../../../../shared/ipc/api'
import type { BoardSummary } from '../../../../shared/ipc/boards'
import { App } from '../../app/App'
import { unwrap } from '../../lib/api'
import { installRealApi } from '../../test/realApi'

let api: MelloApi
let board: BoardSummary
let lists: Record<string, string>

beforeEach(async () => {
  api = installRealApi().api
  board = await unwrap(api.boards.create({ title: 'Casa' }))
  const detail = await unwrap(api.boards.get({ boardId: board.id }))
  lists = Object.fromEntries(detail.lists.map((l) => [l.title, l.id]))
})

function renderHome() {
  window.location.hash = '#/'
  render(<App />)
  return screen.findByRole('combobox', { name: 'Pesquisar' })
}

async function type(box: HTMLElement, text: string) {
  fireEvent.focus(box)
  fireEvent.change(box, { target: { value: text } })
}

const results = () => screen.findByRole('listbox', { name: 'Resultados da busca' })

describe('busca do topo (BUS)', () => {
  it('BUS-01: a partir de 2 caracteres; "acao" encontra "Ação"', async () => {
    await unwrap(api.cards.create({ listId: lists['A fazer']!, title: 'Plano de ação' }))
    const box = await renderHome()
    await type(box, 'a')
    expect(screen.queryByRole('listbox')).toBeNull()
    await type(box, 'acao')
    const panel = await results()
    expect(await within(panel).findByRole('option', { name: /Plano de ação/ })).toBeTruthy()
    expect(within(panel).getByText('Casa · A fazer')).toBeTruthy()
  })

  it('BUS-03: grupos Cards, Tarefas e Quadros, com o card e a data da tarefa', async () => {
    const card = await unwrap(api.cards.create({ listId: lists['A fazer']!, title: 'Pintar' }))
    const checklist = await unwrap(api.checklists.create({ cardId: card.id, title: 'Passos' }))
    const item = await unwrap(
      api.items.create({ checklistId: checklist.id, text: 'Pintar a porta' })
    )
    await unwrap(
      api.items.update({
        itemId: item.id,
        due: { dueDate: '2026-09-15', showInCalendar: true }
      })
    )
    await unwrap(api.boards.create({ title: 'Pintura' }))
    const box = await renderHome()
    await type(box, 'pint')
    const panel = await results()
    const groups = await within(panel).findAllByRole('group')
    expect(groups.map((g) => g.textContent)).toEqual([
      expect.stringMatching(/^CARDS.*Pintar.*Casa · A fazer/),
      expect.stringMatching(/^TAREFAS.*Pintar a porta.*Pintar · 15 set\./),
      expect.stringMatching(/^QUADROS.*Pintura/)
    ])
  })

  it('BUS-05: as setas escolhem e o Enter abre o card no quadro dele', async () => {
    await unwrap(api.cards.create({ listId: lists['A fazer']!, title: 'Compras do mês' }))
    await unwrap(api.cards.create({ listId: lists['Em andamento']!, title: 'Compras da casa' }))
    const box = await renderHome()
    await type(box, 'compras')
    const panel = await results()
    const options = await within(panel).findAllByRole('option')
    expect(options).toHaveLength(2)
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    expect(box.getAttribute('aria-activedescendant')).toBe(options[1]!.id)
    expect(options[1]!.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    expect(box.getAttribute('aria-activedescendant')).toBe(options[0]!.id)
    fireEvent.keyDown(box, { key: 'ArrowUp' })
    const chosen = within(options[1]!).getByText(/^Compras d/).textContent!
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(await screen.findByRole('dialog', { name: chosen })).toBeTruthy()
    expect(window.location.hash).toContain(`#/boards/${board.id}?card=`)
    expect((box as HTMLInputElement).value).toBe('')
  })

  it('BUS-05: a tarefa abre o modal do card; o quadro abre o quadro', async () => {
    const card = await unwrap(api.cards.create({ listId: lists['A fazer']!, title: 'Viagem' }))
    const checklist = await unwrap(api.checklists.create({ cardId: card.id, title: 'Malas' }))
    await unwrap(api.items.create({ checklistId: checklist.id, text: 'Separar documentos' }))
    await unwrap(api.boards.create({ title: 'Documentação' }))
    const box = await renderHome()
    await type(box, 'docu')
    fireEvent.click(await within(await results()).findByRole('option', { name: /Separar/ }))
    expect(await screen.findByRole('dialog', { name: 'Viagem' })).toBeTruthy()

    const header = screen.getByRole('combobox', { name: 'Pesquisar' })
    await type(header, 'docu')
    fireEvent.click(await within(await results()).findByRole('option', { name: 'Documentação' }))
    expect(await screen.findByRole('heading', { name: 'Documentação' })).toBeTruthy()
  })

  it('Esc fecha o painel; sem resultado, avisa', async () => {
    const box = await renderHome()
    await type(box, 'zzz')
    const panel = await results()
    expect(await within(panel).findByText('Nada encontrado para “zzz”.')).toBeTruthy()
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(box.getAttribute('aria-expanded')).toBe('false')
  })

  it('BUS-04: modelos ficam de fora', async () => {
    const card = await unwrap(api.cards.create({ listId: lists['A fazer']!, title: 'Rotina' }))
    await unwrap(api.templates.setCard({ cardId: card.id, isTemplate: true }))
    const modelo = await unwrap(api.boards.create({ title: 'Rotina semanal' }))
    await unwrap(api.templates.setBoard({ boardId: modelo.id, isTemplate: true }))
    const box = await renderHome()
    await type(box, 'rotina')
    expect(await within(await results()).findByText('Nada encontrado para “rotina”.')).toBeTruthy()
  })
})
