import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MelloApi } from '../../../../shared/ipc/api'
import type { BoardSummary } from '../../../../shared/ipc/boards'
import { App } from '../../app/App'
import { unwrap } from '../../lib/api'
import { installRealApi } from '../../test/realApi'

let api: MelloApi
let board: BoardSummary

beforeEach(async () => {
  api = installRealApi().api
  board = await unwrap(api.boards.create({ title: 'Casa' }))
})

function renderBoard(id = board.id) {
  window.location.hash = `#/boards/${id}`
  return render(<App />)
}

async function listNames(): Promise<string[]> {
  return (await screen.findAllByRole('region')).map((l) => l.getAttribute('aria-label') ?? '')
}

async function openListMenu(listTitle: string) {
  const list = await screen.findByRole('region', { name: listTitle })
  fireEvent.click(within(list).getByRole('button', { name: 'Ações da lista' }))
  return screen.findByRole('dialog', { name: `Ações da lista ${listTitle}` })
}

function lists() {
  return unwrap(api.boards.get({ boardId: board.id })).then((b) => b.lists)
}

describe('tela do quadro', () => {
  it('mostra o título, as listas com o contador e a barra do quadro', async () => {
    renderBoard()
    expect(await screen.findByRole('heading', { name: 'Casa' })).toBeTruthy()
    expect(await listNames()).toEqual(['A fazer', 'Em andamento', 'Concluído', 'Entregue'])
    expect(screen.getAllByLabelText('0 cards')).toHaveLength(4)
    expect(screen.getByRole('button', { name: 'Favoritar quadro' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mais opções do quadro' })).toBeTruthy()
  })

  it('renomear o quadro clicando no título', async () => {
    renderBoard()
    fireEvent.click(await screen.findByRole('button', { name: 'Casa' }))
    const input = screen.getByLabelText('Nome do quadro')
    fireEvent.change(input, { target: { value: 'Minha casa' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByRole('heading', { name: 'Minha casa' })).toBeTruthy()
    expect((await unwrap(api.boards.list()))[0]!.title).toBe('Minha casa')
  })

  it('Esc cancela a edição do título', async () => {
    renderBoard()
    fireEvent.click(await screen.findByRole('button', { name: 'Casa' }))
    const input = screen.getByLabelText('Nome do quadro')
    fireEvent.change(input, { target: { value: 'Outro nome' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(await screen.findByRole('heading', { name: 'Casa' })).toBeTruthy()
    expect((await unwrap(api.boards.list()))[0]!.title).toBe('Casa')
  })

  it('favoritar e desfavoritar', async () => {
    renderBoard()
    fireEvent.click(await screen.findByRole('button', { name: 'Favoritar quadro' }))
    expect(await screen.findByRole('button', { name: 'Tirar dos favoritos' })).toBeTruthy()
    expect((await unwrap(api.boards.list()))[0]!.isFavorite).toBe(true)
  })

  it('adicionar lista: vai para o fim e o campo continua aberto', async () => {
    renderBoard()
    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar outra lista' }))
    const input = screen.getByLabelText('Nome da lista')
    fireEvent.change(input, { target: { value: 'Ideias' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar Lista' }))
    expect(await screen.findByRole('region', { name: 'Ideias' })).toBeTruthy()
    expect((screen.getByLabelText('Nome da lista') as HTMLInputElement).value).toBe('')
    expect(await listNames()).toEqual([
      'A fazer',
      'Em andamento',
      'Concluído',
      'Entregue',
      'Ideias'
    ])
  })

  it('renomear uma lista clicando no título', async () => {
    renderBoard()
    const list = await screen.findByRole('region', { name: 'A fazer' })
    fireEvent.click(within(list).getByRole('button', { name: 'A fazer' }))
    const input = within(list).getByLabelText('Nome da lista')
    fireEvent.change(input, { target: { value: 'Para fazer' } })
    fireEvent.blur(input)
    expect(await screen.findByRole('region', { name: 'Para fazer' })).toBeTruthy()
  })

  it('LIS-04: copiar lista cria a cópia logo à direita', async () => {
    renderBoard()
    fireEvent.click(
      within(await openListMenu('A fazer')).getByRole('button', { name: 'Copiar lista' })
    )
    expect(await screen.findByRole('region', { name: 'A fazer (cópia)' })).toBeTruthy()
    expect(await listNames()).toEqual([
      'A fazer',
      'A fazer (cópia)',
      'Em andamento',
      'Concluído',
      'Entregue'
    ])
  })

  it('LIS-02: as opções do menu mostram o estado e mudam a lista', async () => {
    renderBoard()
    const menu = await openListMenu('Concluído')
    const conclusao = within(menu).getByRole('checkbox', {
      name: /Lista de conclusão/
    }) as HTMLInputElement
    const congela = within(menu).getByRole('checkbox', {
      name: /não envelhecem/
    }) as HTMLInputElement
    expect([conclusao.checked, congela.checked]).toEqual([true, true])
    fireEvent.click(conclusao)
    await expect.poll(async () => (await lists())[2]!.isDoneList).toBe(false)
    expect((await lists())[2]!.freezesAging).toBe(true)
  })

  it('LIS-06: arquivar a lista e restaurar em "Itens arquivados"', async () => {
    renderBoard()
    fireEvent.click(
      within(await openListMenu('Em andamento')).getByRole('button', { name: 'Arquivar lista' })
    )
    await expect.poll(() => screen.queryByRole('region', { name: 'Em andamento' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Mais opções do quadro' }))
    const menu = await screen.findByRole('dialog', { name: 'Opções do quadro' })
    fireEvent.click(within(menu).getByRole('button', { name: 'Itens arquivados' }))
    fireEvent.click(await within(menu).findByRole('tab', { name: 'Listas (1)' }))
    expect(within(menu).getByText('Em andamento')).toBeTruthy()
    fireEvent.click(within(menu).getByRole('button', { name: 'Restaurar' }))
    expect(await screen.findByRole('region', { name: 'Em andamento' })).toBeTruthy()
    expect(await listNames()).toEqual(['A fazer', 'Em andamento', 'Concluído', 'Entregue'])
  })

  it('LIS-05: mover a lista para outro quadro', async () => {
    const trabalho = await unwrap(api.boards.create({ title: 'Trabalho' }))
    renderBoard()
    const menu = await openListMenu('A fazer')
    fireEvent.click(within(menu).getByRole('button', { name: 'Mover lista' }))
    await within(menu).findByRole('option', { name: 'Trabalho' })
    fireEvent.change(within(menu).getByLabelText('Quadro'), { target: { value: trabalho.id } })
    await within(menu).findByText(/Etiquetas que não existem no quadro de destino/)
    await expect
      .poll(() => (within(menu).getByLabelText('Posição') as HTMLSelectElement).options.length)
      .toBe(5)
    fireEvent.click(within(menu).getByRole('button', { name: 'Mover' }))

    await expect.poll(() => screen.queryByRole('region', { name: 'A fazer' })).toBeNull()
    const destino = await unwrap(api.boards.get({ boardId: trabalho.id }))
    expect(destino.lists.map((l) => l.title)).toEqual([
      'A fazer',
      'Em andamento',
      'Concluído',
      'Entregue',
      'A fazer'
    ])
  })

  it('mover a lista dentro do mesmo quadro escolhendo a posição', async () => {
    renderBoard()
    const menu = await openListMenu('Entregue')
    fireEvent.click(within(menu).getByRole('button', { name: 'Mover lista' }))
    fireEvent.change(within(menu).getByLabelText('Posição'), { target: { value: '0' } })
    fireEvent.click(within(menu).getByRole('button', { name: 'Mover' }))
    await expect.poll(async () => (await lists()).map((l) => l.title)[0]).toBe('Entregue')
  })

  it('QUA-04: fechar o quadro volta ao Início, e ele vai para os fechados', async () => {
    await unwrap(api.boards.create({ title: 'Trabalho' }))
    renderBoard()
    fireEvent.click(await screen.findByRole('button', { name: 'Mais opções do quadro' }))
    const menu = await screen.findByRole('dialog', { name: 'Opções do quadro' })
    fireEvent.click(within(menu).getByRole('button', { name: 'Fechar quadro' }))
    expect(
      await screen.findByRole('button', { name: 'Ver todos os quadros fechados' })
    ).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Casa' })).toBeNull()
    expect((await unwrap(api.boards.listClosed())).map((b) => b.title)).toEqual(['Casa'])
  })

  it('um quadro fechado aberto pelo endereço mostra o aviso e pode ser reaberto', async () => {
    await unwrap(api.boards.close({ boardId: board.id }))
    renderBoard()
    expect(await screen.findByText('Este quadro está fechado')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir quadro' }))
    expect(await screen.findByRole('heading', { name: 'Casa' })).toBeTruthy()
  })

  it('"Mudar de quadros" lista os quadros e abre o escolhido', async () => {
    const trabalho = await unwrap(api.boards.create({ title: 'Trabalho' }))
    renderBoard()
    fireEvent.click(await screen.findByRole('button', { name: 'Mudar de quadros' }))
    const popover = await screen.findByRole('dialog', { name: 'Seus quadros' })
    const atual = within(popover).getByRole('link', { name: 'Casa' })
    expect(atual.getAttribute('aria-current')).toBe('page')
    fireEvent.click(within(popover).getByRole('link', { name: 'Trabalho' }))
    expect(await screen.findByRole('heading', { name: 'Trabalho' })).toBeTruthy()
    expect(window.location.hash).toBe(`#/boards/${trabalho.id}`)
  })
})
