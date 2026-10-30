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

function open(hash: string) {
  window.location.hash = hash
  render(<App />)
}

async function cardTemplate(title: string, listTitle = 'A fazer') {
  const card = await unwrap(api.cards.create({ listId: lists[listTitle]!, title }))
  await unwrap(api.templates.setCard({ cardId: card.id, isTemplate: true }))
  return card
}

async function titlesIn(listTitle: string): Promise<string[]> {
  const detail = await unwrap(api.boards.get({ boardId: board.id }))
  return detail.lists.find((l) => l.title === listTitle)!.cards.map((c) => c.title)
}

async function menuItem(opener: string, menu: string, item: RegExp | string) {
  fireEvent.click(screen.getByRole('button', { name: opener }))
  const popover = await screen.findByRole('dialog', { name: menu })
  return within(popover).getByRole('button', { name: item })
}

describe('card-modelo (MOD-01, MOD-02)', () => {
  it('"Transformar em modelo" põe o selo na face e apaga o ✓ e o Repetir; e desfaz', async () => {
    const card = await unwrap(api.cards.create({ listId: lists['A fazer']!, title: 'Revisão' }))
    open(`#/boards/${board.id}?card=${card.id}`)
    const modal = await screen.findByRole('dialog', { name: 'Revisão' })
    fireEvent.click(await menuItem('Mais ações', 'Ações do card', 'Transformar em modelo'))

    const done = (await within(modal).findByRole('button', {
      name: 'Marcar card como concluído'
    })) as HTMLButtonElement
    await expect.poll(() => done.disabled).toBe(true)
    expect(done.title).toBe('Um modelo não tem ✓')
    expect(
      (within(modal).getByRole('button', { name: 'Repetir' }) as HTMLButtonElement).disabled
    ).toBe(true)
    const list = screen.getByRole('region', { name: 'A fazer' })
    expect(await within(list).findByRole('link', { name: /Modelo.*Revisão/ })).toBeTruthy()

    fireEvent.click(await menuItem('Mais ações', 'Ações do card', 'Deixar de ser modelo'))
    await expect
      .poll(async () => (await unwrap(api.cards.get({ cardId: card.id }))).isTemplate)
      .toBe(false)
    await expect.poll(() => done.disabled).toBe(false)
  })

  it('card com repetição: "Transformar em modelo" fica apagado, com a dica', async () => {
    const card = await unwrap(api.cards.create({ listId: lists['A fazer']!, title: 'Regar' }))
    await unwrap(
      api.recurrence.save({
        cardId: card.id,
        rule: {
          freq: 'daily',
          weekdays: 0,
          monthDay: null,
          intervalDays: null,
          time: '08:00',
          targetListId: lists['A fazer']!,
          copyLabelsPriority: true,
          copyDescription: true,
          copyChecklist: true,
          copyDueDate: false,
          ifPreviousOpen: 'skip',
          endsKind: 'never',
          endsOn: null,
          endsAfter: null
        }
      })
    )
    open(`#/boards/${board.id}?card=${card.id}`)
    await screen.findByRole('dialog', { name: 'Regar' })
    const item = (await menuItem(
      'Mais ações',
      'Ações do card',
      'Transformar em modelo'
    )) as HTMLButtonElement
    expect(item.disabled).toBe(true)
    expect(item.title).toBe('Tire a repetição antes de transformar em modelo')
  })
})

describe('criar a partir de card-modelo (MOD-03)', () => {
  it('o ícone da lista mostra os modelos do quadro e cria a cópia no fim daquela lista', async () => {
    await cardTemplate('Revisão semanal')
    await unwrap(api.cards.create({ listId: lists['Em andamento']!, title: 'Já estava' }))
    open(`#/boards/${board.id}`)
    const list = await screen.findByRole('region', { name: 'Em andamento' })
    fireEvent.click(within(list).getByRole('button', { name: 'Criar a partir de modelo' }))
    const popover = await screen.findByRole('dialog', { name: 'Criar a partir de modelo' })
    expect(within(popover).getByText('MODELOS DESTE QUADRO')).toBeTruthy()
    fireEvent.click(within(popover).getByRole('button', { name: 'Revisão semanal' }))
    await expect.poll(() => titlesIn('Em andamento')).toEqual(['Já estava', 'Revisão semanal'])
    expect(await within(list).findByRole('link', { name: 'Revisão semanal' })).toBeTruthy()
  })

  it('sem modelos, o popover explica como criar um', async () => {
    open(`#/boards/${board.id}`)
    const list = await screen.findByRole('region', { name: 'A fazer' })
    fireEvent.click(within(list).getByRole('button', { name: 'Criar a partir de modelo' }))
    const popover = await screen.findByRole('dialog', { name: 'Criar a partir de modelo' })
    expect(within(popover).getByText('Nenhum card-modelo neste quadro ainda.')).toBeTruthy()
    expect(
      within(popover).getByText(/Transformar em modelo\. O card copiado entra nesta lista\./)
    ).toBeTruthy()
  })

  it('no menu "Criar", dentro do quadro, a cópia entra na lista do modelo', async () => {
    await cardTemplate('Checklist de viagem', 'Em andamento')
    open(`#/boards/${board.id}`)
    await screen.findByRole('region', { name: 'A fazer' })
    fireEvent.click(await menuItem('Criar', 'Criar', /Criar a partir de modelo/))
    const menu = screen.getByRole('dialog', { name: 'Criar' })
    expect(within(menu).getByText('QUADROS')).toBeTruthy()
    fireEvent.click(await within(menu).findByRole('button', { name: 'Checklist de viagem' }))
    await expect
      .poll(() => titlesIn('Em andamento'))
      .toEqual(['Checklist de viagem', 'Checklist de viagem'])
  })
})

describe('quadro-modelo (MOD-04, MOD-05)', () => {
  async function boardTemplate() {
    await unwrap(api.cards.create({ listId: lists['A fazer']!, title: 'Lavar a roupa' }))
    await unwrap(api.templates.setBoard({ boardId: board.id, isTemplate: true }))
    await unwrap(api.boards.create({ title: 'Estudos' }))
  }

  it('"Transformar em modelo" no menu do quadro leva o quadro para a seção "Modelos"', async () => {
    await unwrap(api.boards.create({ title: 'Estudos' }))
    open(`#/boards/${board.id}`)
    await screen.findByRole('heading', { name: 'Casa' })
    fireEvent.click(
      await menuItem('Mais opções do quadro', 'Opções do quadro', 'Transformar em modelo')
    )
    await expect.poll(async () => (await unwrap(api.templates.listBoards())).length).toBe(1)

    fireEvent.click(screen.getByRole('link', { name: 'Mello' }))
    const section = await screen.findByRole('region', { name: 'MODELOS' })
    expect(within(section).getByRole('button', { name: 'Usar o modelo Casa' })).toBeTruthy()
    expect(within(section).getByText('Modelo')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Casa' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Estudos' })).toBeTruthy()
  })

  it('o diálogo mostra o modelo e cria o quadro sem os cards', async () => {
    await boardTemplate()
    open('#/')
    fireEvent.click(await screen.findByRole('button', { name: 'Usar o modelo Casa' }))
    const dialog = await screen.findByRole('dialog', { name: 'Criar quadro a partir de modelo' })
    expect(within(dialog).getByText('4 listas · 6 etiquetas · 1 card')).toBeTruthy()
    const keep = within(dialog).getByLabelText(/Manter os cards do modelo \(1 card\)/)
    expect((keep as HTMLInputElement).checked).toBe(true)
    fireEvent.click(keep)
    fireEvent.change(within(dialog).getByLabelText('Título do quadro'), {
      target: { value: 'Casa nova' }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Criar quadro' }))

    expect(await screen.findByRole('heading', { name: 'Casa nova' })).toBeTruthy()
    const created = (await unwrap(api.boards.list())).find((b) => b.title === 'Casa nova')!
    const detail = await unwrap(api.boards.get({ boardId: created.id }))
    expect(detail.lists.map((l) => l.title)).toEqual([
      'A fazer',
      'Em andamento',
      'Concluído',
      'Entregue'
    ])
    expect(detail.lists.flatMap((l) => l.cards)).toEqual([])
  })

  it('com "Manter cards", os cards vêm; o menu "Criar" também abre o diálogo', async () => {
    await boardTemplate()
    open('#/')
    await screen.findByRole('region', { name: 'MODELOS' })
    fireEvent.click(await menuItem('Criar', 'Criar', /Criar a partir de modelo/))
    const menu = screen.getByRole('dialog', { name: 'Criar' })
    expect(within(menu).queryByText('MODELOS DESTE QUADRO')).toBeNull()
    fireEvent.click(await within(menu).findByRole('button', { name: 'Casa' }))
    const dialog = await screen.findByRole('dialog', { name: 'Criar quadro a partir de modelo' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Criar quadro' }))

    const region = await screen.findByRole('region', { name: 'A fazer' })
    expect(await within(region).findByRole('link', { name: 'Lavar a roupa' })).toBeTruthy()
    expect((await unwrap(api.boards.list())).map((b) => b.title)).toEqual(['Estudos', 'Casa'])
  })

  it('"Abrir o modelo" abre o quadro-modelo, e o menu dele desfaz o modelo', async () => {
    await boardTemplate()
    open('#/')
    fireEvent.click(await screen.findByRole('button', { name: 'Usar o modelo Casa' }))
    const dialog = await screen.findByRole('dialog', { name: 'Criar quadro a partir de modelo' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Abrir o modelo' }))
    expect(await screen.findByRole('heading', { name: 'Casa' })).toBeTruthy()
    fireEvent.click(
      await menuItem('Mais opções do quadro', 'Opções do quadro', 'Deixar de ser modelo')
    )
    await expect.poll(async () => (await unwrap(api.templates.listBoards())).length).toBe(0)
    expect((await unwrap(api.boards.list())).map((b) => b.title)).toEqual(['Casa', 'Estudos'])
  })
})
