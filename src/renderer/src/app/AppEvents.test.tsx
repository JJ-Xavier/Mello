import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { insertCard } from '../../../main/db/test-db'
import { EVENTS, type MelloApi } from '../../../shared/ipc/api'
import type { BoardSummary } from '../../../shared/ipc/boards'
import { unwrap } from '../lib/api'
import { installRealApi } from '../test/realApi'
import { App } from './App'

let t: ReturnType<typeof installRealApi>
let api: MelloApi
let board: BoardSummary
let listId: string

beforeEach(async () => {
  t = installRealApi()
  api = t.api
  board = await unwrap(api.boards.create({ title: 'Casa' }))
  listId = (await unwrap(api.boards.get({ boardId: board.id }))).lists[0]!.id
})

afterEach(() => t.files.cleanup())

function openAt(hash: string) {
  window.location.hash = hash
  render(<App />)
}

describe('avisos do main (etapa 8)', () => {
  it('data:changed recarrega o que está na tela (o agendador criou um card)', async () => {
    openAt(`#/boards/${board.id}`)
    await screen.findByRole('region', { name: 'A fazer' })
    insertCard(t.db, listId, { title: 'Criado pela repetição' })
    expect(screen.queryByText('Criado pela repetição')).toBeNull()
    t.emit(EVENTS.dataChanged)
    expect(await screen.findByText('Criado pela repetição')).toBeTruthy()
  })

  it('LEM-03: clicar na notificação abre o app no card', async () => {
    const card = await unwrap(api.cards.create({ listId, title: 'Pagar condomínio' }))
    openAt('#/')
    await screen.findByText('SUAS ÁREAS DE TRABALHO')
    t.emit(EVENTS.openCard, { cardId: card.id, boardId: board.id })
    expect(await screen.findByRole('dialog', { name: 'Pagar condomínio' })).toBeTruthy()
    expect(window.location.hash).toBe(`#/boards/${board.id}?card=${card.id}`)
  })

  it('P4: na primeira vez que a janela fecha, o aviso da bandeja; "Entendi" esconde e não avisa mais', async () => {
    openAt('#/')
    t.emit(EVENTS.trayNotice)
    const notice = await screen.findByRole('dialog', { name: 'O Mello continua na bandeja' })
    expect(
      within(notice)
        .getByRole('button', { name: 'Mudar nas Configurações' })
        .hasAttribute('disabled')
    ).toBe(true)
    fireEvent.click(within(notice).getByRole('button', { name: 'Entendi' }))
    await expect.poll(() => t.tray.hidden).toBe(1)
    expect(screen.queryByRole('dialog', { name: 'O Mello continua na bandeja' })).toBeNull()
    expect((await unwrap(api.settings.get()))['tray.noticeShown']).toBe(true)
  })
})

describe('LEM-06: lembretes perdidos com o app fechado', () => {
  it('um aviso só, com a lista; "Abrir" abre o card por cima; "Dispensar" fecha', async () => {
    const card = await unwrap(api.cards.create({ listId, title: 'Pagar condomínio' }))
    const today = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const day = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
    t.missed.push(
      {
        cardId: card.id,
        boardId: board.id,
        title: 'Pagar condomínio',
        boardTitle: 'Casa',
        dueAt: `${day}T00:00`,
        overdue: true
      },
      {
        cardId: 'outro',
        boardId: board.id,
        title: 'Dentista',
        boardTitle: 'Casa',
        dueAt: `${day}T23:59`,
        overdue: false
      }
    )
    openAt('#/')
    const notice = await screen.findByRole('dialog', { name: 'Você perdeu 2 lembretes' })
    expect(within(notice).getByText('Entrega hoje, 00:00 · Casa')).toBeTruthy()
    expect(within(notice).getByText('Entrega hoje, 23:59 · Casa')).toBeTruthy()
    fireEvent.click(within(notice).getByRole('button', { name: 'Abrir Pagar condomínio' }))
    expect(await screen.findByRole('dialog', { name: 'Pagar condomínio' })).toBeTruthy()
    fireEvent.click(within(notice).getByRole('button', { name: 'Dispensar' }))
    await expect.poll(() => screen.queryByRole('dialog', { name: /Você perdeu/ })).toBeNull()
    // A lista vem uma vez só.
    expect(await unwrap(api.reminders.missed())).toEqual([])
  })
})
