import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as recurrence from '../../../../main/modules/recurrence'
import type { MelloApi } from '../../../../shared/ipc/api'
import type { BoardSummary } from '../../../../shared/ipc/boards'
import type { RecurrenceRuleInput } from '../../../../shared/ipc/recurrence'
import { App } from '../../app/App'
import { unwrap } from '../../lib/api'
import { installRealApi } from '../../test/realApi'

// "Hoje" é quarta, 21 de outubro de 2026, às 10:00. Só o Date é falso.
const at = (month: number, day: number, hour = 10) => new Date(2026, month - 1, day, hour)

let t: ReturnType<typeof installRealApi>
let api: MelloApi
let board: BoardSummary
let lists: Record<string, string>
let compras: string

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(at(10, 21))
  t = installRealApi()
  api = t.api
  board = await unwrap(api.boards.create({ title: 'Casa' }))
  const detail = await unwrap(api.boards.get({ boardId: board.id }))
  lists = Object.fromEntries(detail.lists.map((l) => [l.title, l.id]))
  compras = (await unwrap(api.cards.create({ listId: lists['A fazer']!, title: 'Compras' }))).id
})

afterEach(() => {
  t.files.cleanup()
  vi.useRealTimers()
})

const weekly = (): RecurrenceRuleInput => ({
  freq: 'weekly',
  weekdays: 2,
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
})

async function openCard() {
  window.location.hash = `#/boards/${board.id}?card=${compras}`
  render(<App />)
  return screen.findByRole('dialog', { name: 'Compras' })
}

async function openRepeat(modal: HTMLElement) {
  fireEvent.click(within(modal).getByRole('button', { name: 'Repetir' }))
  return screen.findByRole('dialog', { name: 'Repetir card' })
}

const saved = () => unwrap(api.cards.get({ cardId: compras }))

describe('diálogo "Repetir card" (tela 6b)', () => {
  it('começa semanal no dia de hoje, mostra "Próximas:" e salva a regra (REP-01, REP-17)', async () => {
    const modal = await openCard()
    const dialog = await openRepeat(modal)
    expect(
      within(modal).getByRole('button', { name: 'Repetir' }).getAttribute('aria-expanded')
    ).toBe('true')
    expect(within(dialog).getByRole('tab', { name: 'Semanal' }).getAttribute('aria-selected')).toBe(
      'true'
    )
    expect(
      within(dialog).getByRole('button', { name: 'quarta' }).getAttribute('aria-pressed')
    ).toBe('true')
    expect(within(dialog).getByText('Próximas: qua. 28/10, qua. 04/11, qua. 11/11')).toBeTruthy()

    fireEvent.click(within(dialog).getByRole('button', { name: 'segunda' }))
    expect(within(dialog).getByText('Próximas: seg. 26/10, qua. 28/10, seg. 02/11')).toBeTruthy()
    // REP-03: a lista padrão é a do card.
    expect((within(dialog).getByLabelText('Criar na lista') as HTMLSelectElement).value).toBe(
      lists['A fazer']
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(await within(modal).findByText('Toda segunda, quarta, 08:00')).toBeTruthy()
    expect((await saved()).recurrence).toMatchObject({
      freq: 'weekly',
      weekdays: 2 | 8,
      time: '08:00',
      ifPreviousOpen: 'skip',
      endsKind: 'never'
    })
  })

  it('mensal no dia 31 e término depois de N vezes', async () => {
    const modal = await openCard()
    const dialog = await openRepeat(modal)
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Mensal' }))
    fireEvent.change(within(dialog).getByLabelText('Dia do mês'), { target: { value: '31' } })
    expect(within(dialog).getByText('Próximas: sáb. 31/10, seg. 30/11, qui. 31/12')).toBeTruthy()
    fireEvent.change(within(dialog).getByLabelText('Número de repetições'), {
      target: { value: '2' }
    })
    expect(
      (within(dialog).getByRole('radio', { name: /Depois de/ }) as HTMLInputElement).checked
    ).toBe(true)
    expect(within(dialog).getByText('Próximas: sáb. 31/10, seg. 30/11')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    expect(await within(modal).findByText('Todo dia 31, 08:00')).toBeTruthy()
    expect((await saved()).recurrence).toMatchObject({
      freq: 'monthly',
      monthDay: 31,
      endsKind: 'after_count',
      endsAfter: 2
    })
  })

  it('erros: semanal sem dias e horário inválido não salvam', async () => {
    const modal = await openCard()
    const dialog = await openRepeat(modal)
    fireEvent.click(within(dialog).getByRole('button', { name: 'quarta' }))
    expect(within(dialog).getByText('Próximas: —')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    expect(within(dialog).getByRole('alert').textContent).toBe(
      'Escolha pelo menos um dia da semana.'
    )
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Diária' }))
    fireEvent.change(within(dialog).getByLabelText('Horário'), { target: { value: '25:00' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    expect(within(dialog).getByRole('alert').textContent).toBe('Horário inválido. Use hh:mm.')
    expect((await saved()).recurrence).toBeNull()
  })

  it('REP-15: "Remover repetição" tira o campo e o ↻; ENV-05: salvar zera o envelhecimento', async () => {
    await unwrap(api.recurrence.save({ cardId: compras, rule: weekly() }))
    await unwrap(api.checklists.create({ cardId: compras, title: 'Itens' }))
    const modal = await openCard()
    expect(await within(modal).findByText('Toda segunda, 08:00')).toBeTruthy()
    // REP-04: a dica no checklist.
    expect(within(modal).getByText('Volta desmarcado a cada repetição')).toBeTruthy()
    const dialog = await openRepeat(modal)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remover repetição' }))
    await expect.poll(() => within(modal).queryByText('Toda segunda, 08:00')).toBeNull()
    expect((await saved()).recurrence).toBeNull()
  })
})

describe('face do card (REP-13)', () => {
  it('↻ e o dia da semana da próxima; depois de 6 dias, a data', async () => {
    await unwrap(api.recurrence.save({ cardId: compras, rule: weekly() }))
    window.location.hash = `#/boards/${board.id}`
    render(<App />)
    expect(await screen.findByRole('img', { name: 'Card recorrente, próxima seg.' })).toBeTruthy()
  })

  it('FLT-03: "Só cards recorrentes" mostra só os da repetição ativa', async () => {
    await unwrap(api.recurrence.save({ cardId: compras, rule: weekly() }))
    await unwrap(api.cards.create({ listId: lists['A fazer']!, title: 'Avulso' }))
    window.location.hash = `#/boards/${board.id}`
    render(<App />)
    await screen.findByText('Avulso')
    fireEvent.click(screen.getByRole('button', { name: 'Filtrar cards' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Só cards recorrentes' }))
    await expect.poll(() => screen.queryByText('Avulso')).toBeNull()
    expect(screen.getByText('Compras')).toBeTruthy()
  })
})

describe('aviso de repetição pulada (REP-08, REP-09)', () => {
  beforeEach(async () => {
    await unwrap(api.recurrence.save({ cardId: compras, rule: weekly() }))
    // Segunda, 26/10: "Compras" ainda está em aberto, então a repetição é pulada.
    vi.setSystemTime(at(10, 26, 9))
    recurrence.processDue(t.db, at(10, 26, 9).getTime())
  })

  it('o aviso com a próxima; "Criar agora mesmo assim" cria o card e some com o aviso', async () => {
    const modal = await openCard()
    const notice = await within(modal).findByRole('status')
    expect(notice.textContent).toBe(
      'Repetição de seg., 26 de out. pulada. Este card ainda não foi concluído, então o Mello ' +
        'não criou outro. A próxima será seg., 2 de nov.Criar agora mesmo assimDispensar'
    )
    fireEvent.click(within(notice).getByRole('button', { name: 'Criar agora mesmo assim' }))
    await expect.poll(() => within(modal).queryByRole('status')).toBeNull()
    const detail = await unwrap(api.boards.get({ boardId: board.id }))
    expect(detail.lists[0]!.cards.map((c) => c.title)).toEqual(['Compras', 'Compras'])
  })

  it('"Dispensar" só some com o aviso', async () => {
    const modal = await openCard()
    const notice = await within(modal).findByRole('status')
    fireEvent.click(within(notice).getByRole('button', { name: 'Dispensar' }))
    await expect.poll(() => within(modal).queryByRole('status')).toBeNull()
    const detail = await unwrap(api.boards.get({ boardId: board.id }))
    expect(detail.lists[0]!.cards).toHaveLength(1)
  })

  it('REP-14: no calendário, a pulada e as próximas tracejadas; clicar abre o card', async () => {
    window.location.hash = `#/boards/${board.id}/calendar`
    render(<App />)
    const skipped = await screen.findByRole('link', {
      name: 'Compras, Pulada: a anterior está em aberto'
    })
    expect(skipped.closest('[role="group"]')!.getAttribute('aria-label')).toBe(
      'seg., 26 de outubro'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Próximo mês' }))
    const next = await screen.findAllByRole('link', { name: 'Compras, Próxima repetição' })
    expect(next.map((l) => l.closest('[role="group"]')!.getAttribute('aria-label'))).toEqual([
      'seg., 2 de novembro',
      'seg., 9 de novembro',
      'seg., 16 de novembro',
      'seg., 23 de novembro',
      'seg., 30 de novembro'
    ])
    fireEvent.click(next[0]!)
    expect(await screen.findByRole('dialog', { name: 'Compras' })).toBeTruthy()
  })
})
