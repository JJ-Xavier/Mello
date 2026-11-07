import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MelloApi } from '../../../../shared/ipc/api'
import { App } from '../../app/App'
import { unwrap } from '../../lib/api'
import { installRealApi } from '../../test/realApi'

let api: MelloApi

function renderHome() {
  window.location.hash = '#/'
  return render(<App />)
}

function tileTitles(): string[] {
  return screen
    .getAllByRole('link')
    .filter((link) => link.getAttribute('href')?.startsWith('#/boards/'))
    .map((link) => link.textContent ?? '')
}

beforeEach(() => {
  api = installRealApi().api
})

describe('Início', () => {
  it('QUA-09: na primeira abertura só aparece o convite, e nada é criado', async () => {
    renderHome()
    expect(await screen.findByRole('heading', { name: 'Nenhum quadro ainda' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Criar seu primeiro quadro' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Criar novo quadro' })).toBeNull()
    expect(await unwrap(api.boards.list())).toEqual([])
  })

  it('criar o primeiro quadro pelo convite abre o quadro com as 4 listas', async () => {
    renderHome()
    fireEvent.click(await screen.findByRole('button', { name: 'Criar seu primeiro quadro' }))
    const dialog = await screen.findByRole('dialog', { name: 'Criar quadro' })
    const criar = within(dialog).getByRole('button', { name: 'Criar' }) as HTMLButtonElement
    expect(criar.disabled).toBe(true)
    fireEvent.change(within(dialog).getByLabelText('Título do quadro'), {
      target: { value: '  Casa  ' }
    })
    fireEvent.click(criar)

    expect(await screen.findByRole('heading', { name: 'Casa' })).toBeTruthy()
    const lists = await screen.findAllByRole('region')
    expect(lists.map((l) => l.getAttribute('aria-label'))).toEqual([
      'A fazer',
      'Em andamento',
      'Concluído',
      'Entregue'
    ])
  })

  it('QUA-06: os favoritos aparecem primeiro', async () => {
    await unwrap(api.boards.create({ title: 'Um' }))
    const dois = await unwrap(api.boards.create({ title: 'Dois' }))
    await unwrap(api.boards.create({ title: 'Três' }))
    await unwrap(api.boards.update({ boardId: dois.id, isFavorite: true }))
    renderHome()
    await screen.findByRole('button', { name: 'Criar novo quadro' })
    expect(tileTitles()).toEqual(['Dois', 'Um', 'Três'])
  })

  it('o menu "Criar" do cabeçalho cria um quadro', async () => {
    await unwrap(api.boards.create({ title: 'Um' }))
    renderHome()
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }))
    const menu = await screen.findByRole('dialog', { name: 'Criar' })
    fireEvent.click(within(menu).getByRole('button', { name: /Criar quadro/ }))
    fireEvent.change(within(menu).getByLabelText('Título do quadro'), {
      target: { value: 'Trabalho' }
    })
    fireEvent.click(within(menu).getByRole('button', { name: 'Criar' }))
    expect(await screen.findByRole('heading', { name: 'Trabalho' })).toBeTruthy()
    expect((await unwrap(api.boards.list())).map((b) => b.title)).toEqual(['Um', 'Trabalho'])
  })

  it('QUA-04 e QUA-07: quadros fechados podem ser reabertos ou excluídos com confirmação', async () => {
    const um = await unwrap(api.boards.create({ title: 'Um' }))
    const dois = await unwrap(api.boards.create({ title: 'Dois' }))
    await unwrap(api.boards.close({ boardId: um.id }))
    await unwrap(api.boards.close({ boardId: dois.id }))
    renderHome()

    fireEvent.click(await screen.findByRole('button', { name: 'Ver todos os quadros fechados' }))
    const popover = await screen.findByRole('dialog', { name: 'Quadros fechados' })
    expect(within(popover).getByText('Um')).toBeTruthy()
    expect(within(popover).getByText('Dois')).toBeTruthy()

    fireEvent.click(within(popover).getAllByRole('button', { name: 'Reabrir' })[1]!) // "Um"
    expect(await screen.findByRole('link', { name: 'Um' })).toBeTruthy()

    // O popover continua aberto, agora só com "Dois".
    await expect.poll(() => within(popover).queryByText('Um')).toBeNull()
    fireEvent.click(within(popover).getByRole('button', { name: 'Excluir' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Excluir quadro?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Excluir' }))

    await screen.findByRole('link', { name: 'Um' })
    await expect.poll(async () => (await unwrap(api.boards.listClosed())).length).toBe(0)
    expect((await unwrap(api.boards.list())).map((b) => b.title)).toEqual(['Um'])
  })

  it('cancelar a exclusão não apaga nada', async () => {
    const um = await unwrap(api.boards.create({ title: 'Um' }))
    await unwrap(api.boards.close({ boardId: um.id }))
    renderHome()
    fireEvent.click(await screen.findByRole('button', { name: 'Ver todos os quadros fechados' }))
    const popover = await screen.findByRole('dialog', { name: 'Quadros fechados' })
    fireEvent.click(within(popover).getByRole('button', { name: 'Excluir' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Excluir quadro?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancelar' }))
    expect((await unwrap(api.boards.listClosed())).map((b) => b.title)).toEqual(['Um'])
  })
})
