import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MelloApi } from '../../../../shared/ipc/api'
import type { BoardSummary } from '../../../../shared/ipc/boards'
import { App } from '../../app/App'
import { unwrap } from '../../lib/api'
import { installRealApi } from '../../test/realApi'

let api: MelloApi
let files: ReturnType<typeof installRealApi>['files']
let board: BoardSummary
let lists: Record<string, string>
let cardId: string

afterEach(() => files.cleanup())

beforeEach(async () => {
  ;({ api, files } = installRealApi())
  board = await unwrap(api.boards.create({ title: 'Casa' }))
  const detail = await unwrap(api.boards.get({ boardId: board.id }))
  lists = Object.fromEntries(detail.lists.map((l) => [l.title, l.id]))
  cardId = (await unwrap(api.cards.create({ listId: lists['A fazer']!, title: 'Compras' }))).id
})

async function openCard(id = cardId) {
  window.location.hash = `#/boards/${board.id}?card=${id}`
  render(<App />)
  return screen.findByRole('dialog', { name: 'Compras' })
}

const saved = () => unwrap(api.cards.get({ cardId }))

// Abre um popover do modal pelo botão e devolve o popover (role dialog com o nome dado).
async function openPopover(scope: HTMLElement, button: string | RegExp, popover: string) {
  fireEvent.click(within(scope).getByRole('button', { name: button }))
  return screen.findByRole('dialog', { name: popover })
}

describe('modal do card: título e ✓', () => {
  it('editar o título clicando nele', async () => {
    const modal = await openCard()
    fireEvent.click(within(modal).getByRole('button', { name: 'Compras' }))
    const input = within(modal).getByLabelText('Título do card')
    fireEvent.change(input, { target: { value: 'Compras do mês' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await expect.poll(async () => (await saved()).title).toBe('Compras do mês')
  })

  it('FIN-04: marcar o ✓ à mão numa lista comum', async () => {
    const modal = await openCard()
    fireEvent.click(within(modal).getByRole('button', { name: 'Marcar card como concluído' }))
    expect(
      await within(modal).findByRole('button', { name: 'Marcar card como não concluído' })
    ).toBeTruthy()
    expect((await saved()).isDone).toBe(true)
  })

  it('campos vazios não aparecem; a última movimentação sempre aparece', async () => {
    const modal = await openCard()
    expect(within(modal).queryByText('Etiquetas')).toBeNull()
    expect(within(modal).queryByText('Prioridade')).toBeNull()
    expect(within(modal).queryByText('Data de entrega')).toBeNull()
    expect(within(modal).getByText('Última movimentação')).toBeTruthy()
  })
})

describe('modal do card: Adicionar', () => {
  it('PRI-03: prioridade com ícone e nome; "Sem prioridade" tira', async () => {
    const modal = await openCard()
    const menu = await openPopover(modal, 'Adicionar', 'Adicionar ao card')
    fireEvent.click(within(menu).getByRole('button', { name: 'Prioridade' }))
    fireEvent.click(await within(menu).findByRole('radio', { name: 'Alta' }))
    expect(await within(modal).findByRole('button', { name: /Alta/ })).toBeTruthy()
    expect((await saved()).priority).toBe(2)

    const picker = await openPopover(modal, /Alta/, 'Prioridade')
    expect(within(picker).getByRole('radio', { name: 'Alta' }).getAttribute('aria-checked')).toBe(
      'true'
    )
    fireEvent.click(within(picker).getByRole('button', { name: 'Sem prioridade' }))
    await expect.poll(async () => (await saved()).priority).toBeNull()
  })

  it('DAT-01: data com hora e lembrete; "Em atraso" no passado; remover', async () => {
    const modal = await openCard()
    const menu = await openPopover(modal, 'Adicionar', 'Adicionar ao card')
    fireEvent.click(within(menu).getByRole('button', { name: 'Data de entrega' }))
    fireEvent.change(await within(menu).findByLabelText('Data de entrega'), {
      target: { value: '20/10/2020' }
    })
    fireEvent.change(within(menu).getByLabelText('Hora'), { target: { value: '17:00' } })
    fireEvent.change(within(menu).getByLabelText('Lembrete'), { target: { value: 'day_before' } })
    fireEvent.click(within(menu).getByRole('button', { name: 'Salvar' }))

    expect(await within(modal).findByText('20 de out., 17:00')).toBeTruthy()
    expect(within(modal).getByText('Em atraso')).toBeTruthy()
    expect(await saved()).toMatchObject({ dueAt: '2020-10-20T17:00', reminder: 'day_before' })

    const picker = await openPopover(modal, /20 de out/, 'Datas')
    fireEvent.click(within(picker).getByRole('button', { name: 'Remover' }))
    await expect.poll(async () => (await saved()).dueAt).toBeNull()
  })

  it('data inválida não é salva', async () => {
    const modal = await openCard()
    const menu = await openPopover(modal, 'Adicionar', 'Adicionar ao card')
    fireEvent.click(within(menu).getByRole('button', { name: 'Data de entrega' }))
    fireEvent.change(await within(menu).findByLabelText('Data de entrega'), {
      target: { value: '31/02/2026' }
    })
    fireEvent.click(within(menu).getByRole('button', { name: 'Salvar' }))
    expect(await within(menu).findByRole('alert')).toBeTruthy()
    expect((await saved()).dueAt).toBeNull()
  })

  it('escolher o dia na grade do mês', async () => {
    const modal = await openCard()
    const menu = await openPopover(modal, 'Adicionar', 'Adicionar ao card')
    fireEvent.click(within(menu).getByRole('button', { name: 'Data de entrega' }))
    const field = (await within(menu).findByLabelText('Data de entrega')) as HTMLInputElement
    const firstDay = within(menu)
      .getAllByRole('button', { pressed: false })
      .find((b) => /^\d{2}\/\d{2}\/\d{4}$/.test(b.getAttribute('aria-label') ?? ''))!
    fireEvent.click(firstDay)
    expect(field.value).toBe(firstDay.getAttribute('aria-label'))
  })

  it('ETQ-04: marcar etiqueta, criar e editar', async () => {
    const modal = await openCard()
    const menu = await openPopover(modal, 'Adicionar', 'Adicionar ao card')
    fireEvent.click(within(menu).getByRole('button', { name: 'Etiquetas' }))
    fireEvent.click(await within(menu).findByRole('checkbox', { name: 'Etiqueta roxo' }))
    await expect.poll(async () => (await saved()).labelIds.length).toBe(1)
    expect(await within(modal).findByText('Etiquetas')).toBeTruthy()

    fireEvent.change(within(menu).getByLabelText('Buscar etiquetas'), {
      target: { value: 'verm' }
    })
    expect(within(menu).getAllByRole('checkbox')).toHaveLength(1)
    fireEvent.change(within(menu).getByLabelText('Buscar etiquetas'), { target: { value: '' } })

    fireEvent.click(within(menu).getByRole('button', { name: 'Criar uma nova etiqueta' }))
    fireEvent.change(within(menu).getByLabelText('Nome'), { target: { value: 'Urgente' } })
    fireEvent.click(within(menu).getByRole('button', { name: 'Cor azul' }))
    fireEvent.click(within(menu).getByRole('button', { name: 'Criar' }))
    expect(await within(menu).findByRole('checkbox', { name: 'Etiqueta Urgente' })).toBeTruthy()
    const labels = await unwrap(api.labels.list({ boardId: board.id }))
    expect(labels.at(-1)).toMatchObject({ name: 'Urgente', color: '#1f5eff' })

    fireEvent.click(within(menu).getByRole('button', { name: 'Editar etiqueta Urgente' }))
    fireEvent.change(within(menu).getByLabelText('Nome'), { target: { value: 'Importante' } })
    fireEvent.click(within(menu).getByRole('button', { name: 'Salvar' }))
    expect(await within(menu).findByRole('checkbox', { name: 'Etiqueta Importante' })).toBeTruthy()
  })
})

describe('modal do card: checklist (CHK)', () => {
  it('criar checklist, adicionar item, marcar, ocultar marcados e excluir item', async () => {
    const modal = await openCard()
    const add = await openPopover(modal, 'Checklist', 'Adicionar checklist')
    fireEvent.click(within(add).getByRole('button', { name: 'Adicionar' }))
    const section = await within(modal).findByRole('region', { name: 'Checklist' })
    expect(within(section).getByText('0%')).toBeTruthy()

    fireEvent.click(within(section).getByRole('button', { name: 'Adicionar um item' }))
    const input = within(section).getByLabelText('Novo item')
    fireEvent.change(input, { target: { value: 'Pão' } })
    fireEvent.submit(input)
    fireEvent.change(input, { target: { value: 'Leite' } })
    fireEvent.submit(input)
    const pao = await within(section).findByRole('checkbox', { name: 'Pão' })
    await within(section).findByRole('checkbox', { name: 'Leite' })

    fireEvent.click(pao)
    expect(await within(section).findByText('50%')).toBeTruthy()
    fireEvent.click(within(section).getByRole('button', { name: 'Ocultar itens marcados' }))
    await expect.poll(() => within(section).queryByRole('checkbox', { name: 'Pão' })).toBeNull()
    expect(within(section).getByRole('button', { name: 'Mostrar itens marcados (1)' })).toBeTruthy()

    const leite = within(section).getByRole('checkbox', { name: 'Leite' }).closest('div')!
    const menu = await openPopover(leite as HTMLElement, 'Ações do item', 'Ações do item')
    fireEvent.click(within(menu).getByRole('button', { name: 'Excluir item' }))
    await expect.poll(async () => (await saved()).checklists[0]!.items.length).toBe(1)
  })

  it('CHK-05: data da tarefa', async () => {
    const checklist = await unwrap(api.checklists.create({ cardId, title: 'Itens' }))
    await unwrap(api.items.create({ checklistId: checklist.id, text: 'Pão' }))
    const modal = await openCard()
    const section = await within(modal).findByRole('region', { name: 'Itens' })
    const popover = await openPopover(section, 'Definir data da tarefa', 'Data da tarefa')
    fireEvent.change(within(popover).getByLabelText('Data'), { target: { value: '10/09/2020' } })
    fireEvent.click(within(popover).getByRole('checkbox', { name: 'Mostrar no calendário' }))
    fireEvent.click(within(popover).getByRole('button', { name: 'Salvar' }))
    expect(
      await within(section).findByRole('button', { name: 'Data da tarefa: 10 set., em atraso' })
    ).toBeTruthy()
    expect((await saved()).checklists[0]!.items[0]).toMatchObject({
      dueDate: '2020-09-10',
      showInCalendar: false
    })
  })
})

describe('modal do card: descrição (NOT-07)', () => {
  it('mostra a descrição salva em modo leitura e entra em edição', async () => {
    await unwrap(
      api.cards.update({
        cardId,
        description: {
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Mercado' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Pão e leite' }] }
          ]
        }
      })
    )
    const modal = await openCard()
    const section = within(modal).getByRole('region', { name: 'Descrição' })
    expect(await within(section).findByRole('heading', { name: 'Mercado' })).toBeTruthy()
    expect(within(section).getByText('Pão e leite')).toBeTruthy()

    fireEvent.click(within(section).getByRole('button', { name: 'Editar' }))
    expect(await within(section).findByRole('toolbar', { name: 'Formatação' })).toBeTruthy()
    fireEvent.click(within(section).getByRole('button', { name: 'Cancelar' }))
    expect(await within(section).findByRole('button', { name: 'Editar' })).toBeTruthy()
  })

  it('sem descrição, o convite abre o editor', async () => {
    const modal = await openCard()
    fireEvent.click(within(modal).getByRole('button', { name: /Adicione uma descrição/ }))
    expect(await within(modal).findByRole('textbox', { name: 'Descrição' })).toBeTruthy()
  })
})

describe('modal do card: lista e menu "…"', () => {
  it('CAR-06: o seletor de lista leva o card para o fim da lista', async () => {
    const modal = await openCard()
    const picker = await openPopover(modal, /A fazer/, 'Mover para a lista')
    fireEvent.click(within(picker).getByRole('button', { name: 'Concluído' }))
    expect(await within(modal).findByRole('button', { name: /Concluído/ })).toBeTruthy()
    expect(await saved()).toMatchObject({ listTitle: 'Concluído', isDone: true })
  })

  it('CAR-06: "Mover" para outra posição e lista', async () => {
    await unwrap(api.cards.create({ listId: lists['Em andamento']!, title: 'Mudança' }))
    const modal = await openCard()
    const menu = await openPopover(modal, 'Mais ações', 'Ações do card')
    fireEvent.click(within(menu).getByRole('button', { name: 'Mover' }))
    fireEvent.change(await within(menu).findByLabelText('Lista'), {
      target: { value: lists['Em andamento'] }
    })
    await expect
      .poll(() => (within(menu).getByLabelText('Posição') as HTMLSelectElement).options.length)
      .toBe(2)
    fireEvent.change(within(menu).getByLabelText('Posição'), { target: { value: '0' } })
    fireEvent.click(within(menu).getByRole('button', { name: 'Mover' }))
    await expect
      .poll(async () =>
        (await unwrap(api.boards.get({ boardId: board.id }))).lists[1]!.cards.map((c) => c.title)
      )
      .toEqual(['Compras', 'Mudança'])
  })

  it('CAR-07: "Copiar" cria a cópia logo abaixo', async () => {
    const modal = await openCard()
    const menu = await openPopover(modal, 'Mais ações', 'Ações do card')
    fireEvent.click(within(menu).getByRole('button', { name: 'Copiar' }))
    expect((within(menu).getByLabelText('Título') as HTMLInputElement).value).toBe(
      'Compras (cópia)'
    )
    await expect
      .poll(() => (within(menu).getByLabelText('Posição') as HTMLSelectElement).value)
      .toBe('1')
    fireEvent.click(within(menu).getByRole('button', { name: 'Criar cópia' }))
    await expect
      .poll(async () =>
        (await unwrap(api.boards.get({ boardId: board.id }))).lists[0]!.cards.map((c) => c.title)
      )
      .toEqual(['Compras', 'Compras (cópia)'])
  })

  it('CAR-05: arquivar mantém o modal com o aviso; restaurar volta', async () => {
    const modal = await openCard()
    const menu = await openPopover(modal, 'Mais ações', 'Ações do card')
    fireEvent.click(within(menu).getByRole('button', { name: 'Arquivar' }))
    expect(await within(modal).findByText('Este card está arquivado.')).toBeTruthy()
    expect((await saved()).archivedAt).not.toBeNull()
    fireEvent.click(within(modal).getByRole('button', { name: 'Restaurar' }))
    await expect.poll(() => within(modal).queryByText('Este card está arquivado.')).toBeNull()
    expect((await saved()).archivedAt).toBeNull()
  })

  it('CAR-05: excluir pede confirmação e fecha o modal', async () => {
    const modal = await openCard()
    const menu = await openPopover(modal, 'Mais ações', 'Ações do card')
    fireEvent.click(within(menu).getByRole('button', { name: 'Excluir' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Excluir card?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Excluir' }))
    await expect.poll(() => window.location.hash).toBe(`#/boards/${board.id}`)
    await expect(unwrap(api.cards.get({ cardId }))).rejects.toThrow(/não encontrado/)
  })
})
