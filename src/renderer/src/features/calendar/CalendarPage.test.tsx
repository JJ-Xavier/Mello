import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setting } from '../../../../main/db/schema'
import type { MelloApi } from '../../../../shared/ipc/api'
import type { BoardSummary } from '../../../../shared/ipc/boards'
import { App } from '../../app/App'
import { unwrap } from '../../lib/api'
import { installRealApi } from '../../test/realApi'

// "Hoje" é quarta, 21 de outubro de 2026, às 10:00. Só o Date é falso: os temporizadores dos
// testes continuam de verdade.
const TODAY = new Date(2026, 9, 21, 10, 0)

let t: ReturnType<typeof installRealApi>
let api: MelloApi
let casa: BoardSummary
let lists: Record<string, string>

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
  t = installRealApi()
  api = t.api
  casa = await unwrap(api.boards.create({ title: 'Casa' }))
  const detail = await unwrap(api.boards.get({ boardId: casa.id }))
  lists = Object.fromEntries(detail.lists.map((l) => [l.title, l.id]))
})

afterEach(() => {
  t.files.cleanup()
  vi.useRealTimers()
})

async function card(title: string, dueAt: string | null, list = 'A fazer') {
  const created = await unwrap(api.cards.create({ listId: lists[list]!, title }))
  if (dueAt)
    await unwrap(api.cards.update({ cardId: created.id, due: { dueAt, reminder: 'none' } }))
  return created.id
}

async function task(cardId: string, text: string, dueDate: string) {
  const checklist = await unwrap(api.checklists.create({ cardId, title: 'Itens' }))
  const item = await unwrap(api.items.create({ checklistId: checklist.id, text }))
  await unwrap(api.items.update({ itemId: item.id, due: { dueDate, showInCalendar: true } }))
  return item.id
}

function store(key: string, value: unknown) {
  t.db
    .insert(setting)
    .values({ key, value: JSON.stringify(value) })
    .run()
}

function openAt(hash: string) {
  window.location.hash = hash
  render(<App />)
}

const day = (name: string) => screen.findByRole('group', { name })
const boardCalendar = () => openAt(`#/boards/${casa.id}/calendar`)

describe('calendário do quadro (tela 5)', () => {
  it('CAL-01, CAL-03, CAL-04: abre no mês atual, 5 semanas a partir do domingo, hoje marcado', async () => {
    boardCalendar()
    expect(
      await screen.findByRole('region', { name: 'Calendário de outubro de 2026' })
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: /Escolher mês/ }).textContent).toContain(
      'out. de 2026'
    )
    const days = screen
      .getAllByRole('group')
      .filter((g) => g.getAttribute('aria-label') !== 'Mostrar no calendário')
    expect(days).toHaveLength(35)
    expect(days[0]!.getAttribute('aria-label')).toBe('dom., 27 de setembro')
    const today = await day('qua., 21 de outubro')
    expect(today.getAttribute('aria-current')).toBe('date')
    // Dias de fora do mês não têm "Adicionar".
    expect(within(days[0]!).queryByRole('button', { name: 'Adicionar' })).toBeNull()
    expect(within(today).getByRole('button', { name: 'Adicionar' })).toBeTruthy()
  })

  it('CAL-05, CAL-14: card no dia da entrega; tarefa com o card embaixo; sem o nome do quadro', async () => {
    const id = await card('Pagar o condomínio', '2026-10-20')
    await task(id, 'Separar o boleto', '2026-10-23')
    await card('Fora do mês', '2026-11-02')
    boardCalendar()
    const twentieth = await day('ter., 20 de outubro')
    const link = await within(twentieth).findByRole('link', { name: /Pagar o condomínio/ })
    expect(link.getAttribute('aria-label')).toBe('Abrir card Pagar o condomínio, em atraso')
    const tarefa = within(await day('sex., 23 de outubro')).getByRole('button', {
      name: 'Concluir tarefa Separar o boleto'
    })
    expect(tarefa.textContent).toContain('Pagar o condomínio')
    expect(screen.queryByText('Fora do mês')).toBeNull()
  })

  it('CAL-07: riscado só para o finalizado (lista de conclusão e ✓); legenda "Riscado = finalizado"', async () => {
    const finished = await card('Revisão', '2026-10-15')
    await unwrap(api.cards.move({ cardId: finished, listId: lists['Concluído']!, index: 0 }))
    const checked = await card('Só com ✓', '2026-10-16')
    await unwrap(api.cards.update({ cardId: checked, isDone: true }))
    boardCalendar()
    expect(
      await within(await day('qui., 15 de outubro')).findByRole('link', {
        name: 'Abrir card Revisão, finalizado'
      })
    ).toBeTruthy()
    // FIN-04: com o ✓ fora da lista de conclusão, não está finalizado (e já atrasou).
    expect(
      within(await day('sex., 16 de outubro')).getByRole('link', {
        name: 'Abrir card Só com ✓, em atraso'
      })
    ).toBeTruthy()
    expect(screen.getByText('Riscado = finalizado')).toBeTruthy()
  })

  it('CAL-07: com "Riscar itens finalizados" desligado, a legenda some', async () => {
    store('calendar.strikeDone', false)
    boardCalendar()
    await screen.findByRole('region', { name: 'Calendário de outubro de 2026' })
    expect(screen.queryByText('Riscado = finalizado')).toBeNull()
  })

  it('CAL-11: clicar no card abre o modal por cima do calendário; fechar volta', async () => {
    await card('Dentista', '2026-10-22T15:00')
    boardCalendar()
    fireEvent.click(
      await within(await day('qui., 22 de outubro')).findByRole('link', { name: /Dentista/ })
    )
    const modal = await screen.findByRole('dialog', { name: 'Dentista' })
    expect(screen.getByRole('region', { name: 'Calendário de outubro de 2026' })).toBeTruthy()
    fireEvent.click(within(modal).getByRole('button', { name: 'Fechar' }))
    await expect.poll(() => screen.queryByRole('dialog', { name: 'Dentista' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Calendário de outubro de 2026' })).toBeTruthy()
  })

  it('CAL-11: clicar na tarefa marca e desmarca o item e zera o envelhecimento (ENV-05)', async () => {
    const id = await card('Reforma', null)
    const itemId = await task(id, 'Comprar tinta', '2026-10-21')
    vi.setSystemTime(new Date(2026, 9, 21, 11, 0))
    boardCalendar()
    const today = await day('qua., 21 de outubro')
    fireEvent.click(
      await within(today).findByRole('button', { name: 'Concluir tarefa Comprar tinta' })
    )
    const done = await within(today).findByRole('button', {
      name: 'Desmarcar tarefa Comprar tinta'
    })
    expect(done.getAttribute('aria-pressed')).toBe('true')
    const saved = await unwrap(api.cards.get({ cardId: id }))
    expect(saved.checklists[0]!.items.find((i) => i.id === itemId)!.isDone).toBe(true)
    expect(saved.lastActivityAt).toBe(new Date(2026, 9, 21, 11, 0).getTime())
    fireEvent.click(done)
    expect(
      await within(today).findByRole('button', { name: 'Concluir tarefa Comprar tinta' })
    ).toBeTruthy()
  })

  it('CAL-10: cards antes das tarefas, sem hora antes da hora; CAL-08: atrasados', async () => {
    const id = await card('Com hora', '2026-10-19T09:00')
    await card('Dia inteiro', '2026-10-19')
    await task(id, 'Tarefa do dia', '2026-10-19')
    boardCalendar()
    const cell = await day('seg., 19 de outubro')
    const items = (await within(cell).findAllByRole('link')).map((l) =>
      l.getAttribute('aria-label')
    )
    expect(items).toEqual(['Abrir card Dia inteiro, em atraso', 'Abrir card Com hora, em atraso'])
    const order = [...cell.querySelectorAll('a, button[aria-pressed]')].map((e) =>
      e.getAttribute('aria-label')
    )
    expect(order.at(-1)).toBe('Concluir tarefa Tarefa do dia')
  })

  it('a hora vem antes do título do card e da tarefa; as tarefas em ordem de horário', async () => {
    const id = await card('Dentista', '2026-10-23T15:00')
    await task(id, 'Levar exames', '2026-10-23T14:00')
    await task(id, 'Comprar remédio', '2026-10-23')
    boardCalendar()
    const cell = await day('sex., 23 de outubro')
    const link = await within(cell).findByRole('link', { name: 'Abrir card Dentista' })
    expect(link.textContent).toBe('15:00Dentista')
    const tasks = [...cell.querySelectorAll('button[aria-pressed]')].map((b) => b.textContent)
    expect(tasks).toEqual(['Comprar remédioDentista', '14:00 Levar examesDentista'])
  })

  it('CAL-09: filtros Cards e Tarefas independentes; o inicial de Tarefas vem das Configurações', async () => {
    store('calendar.showTasks', false)
    const id = await card('Prova', '2026-10-23')
    await task(id, 'Revisar', '2026-10-23')
    boardCalendar()
    const filters = await screen.findByRole('group', { name: 'Mostrar no calendário' })
    const tasks = within(filters).getByRole('button', { name: /Tarefas do checklist/ })
    const cards = within(filters).getByRole('button', { name: /Cards/ })
    expect(tasks.getAttribute('aria-pressed')).toBe('false')
    const cell = await day('sex., 23 de outubro')
    expect(await within(cell).findByRole('link', { name: /Prova/ })).toBeTruthy()
    expect(within(cell).queryByRole('button', { name: /Revisar/ })).toBeNull()

    fireEvent.click(tasks)
    expect(await within(cell).findByRole('button', { name: /Revisar/ })).toBeTruthy()
    fireEvent.click(cards)
    expect(cards.getAttribute('aria-pressed')).toBe('false')
    expect(within(cell).queryByRole('link', { name: /Prova/ })).toBeNull()
    expect(within(cell).getByRole('button', { name: /Revisar/ })).toBeTruthy()
  })

  it('CAL-03: a semana começa na segunda quando as Configurações pedem', async () => {
    store('calendar.weekStart', 'monday')
    boardCalendar()
    await screen.findByRole('region', { name: 'Calendário de outubro de 2026' })
    const days = screen
      .getAllByRole('group')
      .filter((g) => g.getAttribute('aria-label') !== 'Mostrar no calendário')
    expect(days[0]!.getAttribute('aria-label')).toBe('seg., 28 de setembro')
  })

  it('‹ Hoje › e o seletor de mês trocam o mês', async () => {
    await card('Natal', '2026-12-25')
    boardCalendar()
    fireEvent.click(await screen.findByRole('button', { name: 'Próximo mês' }))
    expect(
      await screen.findByRole('region', { name: 'Calendário de novembro de 2026' })
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Próximo mês' }))
    expect(
      await within(await day('sex., 25 de dezembro')).findByRole('link', { name: /Natal/ })
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Hoje' }))
    expect(
      await screen.findByRole('region', { name: 'Calendário de outubro de 2026' })
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
    expect(
      await screen.findByRole('region', { name: 'Calendário de setembro de 2026' })
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Escolher mês/ }))
    const picker = await screen.findByRole('dialog', { name: 'Escolher mês' })
    fireEvent.click(within(picker).getByRole('button', { name: 'Próximo ano' }))
    fireEvent.click(within(picker).getByRole('button', { name: 'fevereiro de 2027' }))
    expect(
      await screen.findByRole('region', { name: 'Calendário de fevereiro de 2027' })
    ).toBeTruthy()
  })

  it('CAL-12: "Adicionar" cria o card no dia, sem hora, na primeira lista que não é de conclusão', async () => {
    boardCalendar()
    const cell = await day('sex., 23 de outubro')
    fireEvent.click(within(cell).getByRole('button', { name: 'Adicionar' }))
    const form = await screen.findByRole('dialog', {
      name: 'Adicionar card em sex., 23 de outubro'
    })
    expect(within(form).queryByLabelText('Quadro')).toBeNull()
    expect(
      await within(form).findByText('Entra na lista “A fazer”, com entrega neste dia.')
    ).toBeTruthy()
    fireEvent.change(within(form).getByLabelText('Título do card'), {
      target: { value: 'Prova de inglês' }
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Adicionar cartão' }))
    expect(await within(cell).findByRole('link', { name: /Prova de inglês/ })).toBeTruthy()
    const board = await unwrap(api.boards.get({ boardId: casa.id }))
    const created = board.lists[0]!.cards.find((c) => c.title === 'Prova de inglês')
    expect(created?.dueAt).toBe('2026-10-23')
  })

  it('CAL-13: "+N mais" quando os itens não cabem, com a lista completa do dia', async () => {
    for (const title of ['Um', 'Dois', 'Três']) await card(title, '2026-10-22')
    // O jsdom não mede nada: cada item tem 30 px, a 34 px um do outro, e cabem 70 px.
    const items = (element: Element) =>
      element.parentElement?.querySelectorAll(':scope > [data-item]')
    const restore = [
      mock('offsetHeight', function (this: HTMLElement) {
        return this.hasAttribute('data-item') ? 30 : 0
      }),
      mock('offsetTop', function (this: HTMLElement) {
        return this.hasAttribute('data-item') ? [...items(this)!].indexOf(this) * 34 : 0
      }),
      mock('clientHeight', function (this: HTMLElement) {
        return this.querySelector(':scope > [data-item]') ? 70 : 0
      })
    ]
    try {
      boardCalendar()
      const cell = await day('qui., 22 de outubro')
      const more = await within(cell).findByRole('button', { name: '+2 mais' })
      expect(within(cell).getAllByRole('link')).toHaveLength(1)
      // O "Adicionar" vira só o "+" (com o nome e a dica), para não cobrir o "+N mais".
      expect(within(cell).getByRole('button', { name: 'Adicionar' }).getAttribute('title')).toBe(
        'Adicionar'
      )
      fireEvent.click(more)
      const list = await screen.findByRole('dialog', { name: 'Itens de qui., 22 de outubro' })
      expect(
        within(list)
          .getAllByRole('link')
          .map((l) => l.getAttribute('aria-label'))
      ).toEqual(['Abrir card Dois', 'Abrir card Três', 'Abrir card Um'])
    } finally {
      for (const undo of restore) undo()
    }
  })

  it('CAL-06: card arquivado fica de fora', async () => {
    const archived = await card('Arquivado', '2026-10-22')
    await unwrap(api.cards.archive({ cardId: archived }))
    await card('Visível', '2026-10-22')
    boardCalendar()
    const cell = await day('qui., 22 de outubro')
    expect(await within(cell).findByRole('link', { name: /Visível/ })).toBeTruthy()
    expect(within(cell).queryByRole('link', { name: /Arquivado/ })).toBeNull()
  })

  it('quadro fechado aberto pelo endereço do calendário mostra o aviso para reabrir', async () => {
    await unwrap(api.boards.close({ boardId: casa.id }))
    boardCalendar()
    expect(await screen.findByText('Este quadro está fechado')).toBeTruthy()
  })

  it('o X fecha o calendário e volta ao quadro', async () => {
    boardCalendar()
    fireEvent.click(await screen.findByRole('link', { name: 'Fechar calendário' }))
    expect(await screen.findByRole('region', { name: 'A fazer' })).toBeTruthy()
  })
})

describe('calendário de todos os quadros (tela 13)', () => {
  let estudos: BoardSummary

  beforeEach(async () => {
    estudos = await unwrap(api.boards.create({ title: 'Estudos' }))
    const list = (await unwrap(api.boards.get({ boardId: estudos.id }))).lists[0]!.id
    const prova = await unwrap(api.cards.create({ listId: list, title: 'Prova' }))
    await unwrap(
      api.cards.update({ cardId: prova.id, due: { dueAt: '2026-10-23', reminder: 'none' } })
    )
    await card('Compras', '2026-10-23')
  })

  it('CAL-02, CAL-14: mostra todos os quadros, com o nome do quadro no card', async () => {
    openAt('#/calendar')
    expect(
      await screen.findByRole('region', { name: 'Calendário de outubro de 2026, todos os quadros' })
    ).toBeTruthy()
    const cell = await day('sex., 23 de outubro')
    expect(
      await within(cell).findByRole('link', { name: 'Abrir card Prova, Estudos' })
    ).toBeTruthy()
    expect(within(cell).getByRole('link', { name: 'Abrir card Compras, Casa' })).toBeTruthy()
  })

  it('CAL-02: o seletor escolhe um quadro e volta para todos', async () => {
    openAt('#/calendar')
    const cell = await day('sex., 23 de outubro')
    await within(cell).findByRole('link', { name: /Prova/ })
    fireEvent.click(screen.getByRole('button', { name: 'Quadros no calendário: Todos os quadros' }))
    const picker = await screen.findByRole('dialog', { name: 'Quadros no calendário' })
    fireEvent.click(within(picker).getByRole('button', { name: 'Estudos' }))
    expect(
      await screen.findByRole('region', { name: 'Calendário de outubro de 2026, Estudos' })
    ).toBeTruthy()
    expect(await within(cell).findByRole('link', { name: /Prova/ })).toBeTruthy()
    expect(within(cell).queryByRole('link', { name: /Compras/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Quadros no calendário: Estudos' }))
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: 'Quadros no calendário' })).getByRole(
        'button',
        { name: 'Todos os quadros' }
      )
    )
    expect(await within(cell).findByRole('link', { name: /Compras/ })).toBeTruthy()
  })

  it('CAL-12: no modo todos os quadros, "Adicionar" pergunta o quadro', async () => {
    openAt('#/calendar')
    const cell = await day('ter., 27 de outubro')
    fireEvent.click(within(cell).getByRole('button', { name: 'Adicionar' }))
    const form = await screen.findByRole('dialog', {
      name: 'Adicionar card em ter., 27 de outubro'
    })
    const select = (await within(form).findByLabelText('Quadro')) as HTMLSelectElement
    fireEvent.change(select, { target: { value: estudos.id } })
    fireEvent.change(within(form).getByLabelText('Título do card'), {
      target: { value: 'Trabalho' }
    })
    const submit = within(form).getByRole('button', {
      name: 'Adicionar cartão'
    }) as HTMLButtonElement
    // O botão só habilita quando as listas do quadro escolhido chegam.
    await expect.poll(() => submit.disabled).toBe(false)
    fireEvent.click(submit)
    expect(
      await within(cell).findByRole('link', { name: 'Abrir card Trabalho, Estudos' })
    ).toBeTruthy()
  })

  it('CAL-06: quadro fechado fica de fora; o card abre o modal por cima (CAL-11)', async () => {
    await unwrap(api.boards.close({ boardId: estudos.id }))
    openAt('#/calendar')
    const cell = await day('sex., 23 de outubro')
    fireEvent.click(await within(cell).findByRole('link', { name: /Compras/ }))
    expect(await screen.findByRole('dialog', { name: 'Compras' })).toBeTruthy()
    expect(within(cell).queryByRole('link', { name: /Prova/ })).toBeNull()
  })
})

// Troca uma medida do HTMLElement só neste teste e devolve como desfazer.
function mock(
  name: 'offsetHeight' | 'offsetTop' | 'clientHeight',
  get: (this: HTMLElement) => number
) {
  const proto = name === 'clientHeight' ? Element.prototype : HTMLElement.prototype
  const original = Object.getOwnPropertyDescriptor(proto, name)!
  Object.defineProperty(proto, name, { configurable: true, get })
  return () => Object.defineProperty(proto, name, original)
}
