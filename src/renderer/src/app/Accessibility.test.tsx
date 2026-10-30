// Etapa 12: em cada tela principal, todo controle tem um nome para o leitor de tela (botões só com
// ícone precisam do aria-label). O nome vazio é procurado pela própria consulta por papel.
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MelloApi } from '../../../shared/ipc/api'
import { unwrap } from '../lib/api'
import { installRealApi } from '../test/realApi'
import { App } from './App'

const ROLES = [
  'button',
  'link',
  'textbox',
  'combobox',
  'checkbox',
  'radio',
  'switch',
  'slider',
  'listbox',
  'option',
  'tab',
  'dialog',
  'img'
] as const

let api: MelloApi
let boardId: string
let cardId: string

beforeEach(async () => {
  api = installRealApi().api
  const board = await unwrap(api.boards.create({ title: 'Casa' }))
  boardId = board.id
  const detail = await unwrap(api.boards.get({ boardId }))
  const [todo, doing] = detail.lists
  const labels = await unwrap(api.labels.list({ boardId }))
  const card = await unwrap(api.cards.create({ listId: todo!.id, title: 'Pintar o quarto' }))
  cardId = card.id
  await unwrap(api.cards.setLabels({ cardId, labelIds: [labels[0]!.id] }))
  await unwrap(
    api.cards.update({ cardId, priority: 2, due: { dueAt: '2026-10-20', reminder: 'none' } })
  )
  await unwrap(api.cards.update({ cardId, description: { type: 'doc', content: [] } }))
  const checklist = await unwrap(api.checklists.create({ cardId, title: 'Passos' }))
  const item = await unwrap(api.items.create({ checklistId: checklist.id, text: 'Lixar' }))
  await unwrap(
    api.items.update({ itemId: item.id, due: { dueDate: '2026-10-21', showInCalendar: true } })
  )
  const template = await unwrap(api.cards.create({ listId: doing!.id, title: 'Revisão' }))
  await unwrap(api.templates.setCard({ cardId: template.id, isTemplate: true }))
  const modelo = await unwrap(api.boards.create({ title: 'Rotina' }))
  await unwrap(api.templates.setBoard({ boardId: modelo.id, isTemplate: true }))
  const fechado = await unwrap(api.boards.create({ title: 'Mudança' }))
  await unwrap(api.boards.close({ boardId: fechado.id }))
})

// Os controles sem nome, descritos pela tag e pelo conteúdo, para a mensagem do teste dizer qual.
function unnamed(): string[] {
  return ROLES.flatMap((role) =>
    screen
      .queryAllByRole(role, { name: '' })
      .map(
        (element) =>
          `${role}: <${element.tagName.toLowerCase()}> ${element.outerHTML.slice(0, 120)}`
      )
  )
}

async function open(hash: string, ready: () => Promise<unknown>) {
  window.location.hash = hash
  render(<App />)
  await ready()
}

describe('acessibilidade: todo controle tem nome (etapa 12)', () => {
  it('Início, com quadros, modelos e fechados', async () => {
    await open('#/', () => screen.findByRole('button', { name: 'Usar o modelo Rotina' }))
    expect(unnamed()).toEqual([])
  })

  it('quadro com cards, etiquetas, datas e modelo', async () => {
    await open(`#/boards/${boardId}`, () => screen.findByRole('link', { name: /Pintar o quarto/ }))
    expect(unnamed()).toEqual([])
  })

  it('modal do card', async () => {
    await open(`#/boards/${boardId}?card=${cardId}`, () =>
      screen.findByRole('dialog', { name: 'Pintar o quarto' })
    )
    await screen.findByText('Lixar')
    expect(unnamed()).toEqual([])
  })

  it('calendário de todos os quadros', async () => {
    await open('#/calendar', () => screen.findByRole('button', { name: /Quadros no calendário/ }))
    expect(unnamed()).toEqual([])
  })

  it('Configurações', async () => {
    await open('#/settings', () => screen.findByRole('radiogroup', { name: 'Tema' }))
    await screen.findByRole('table', { name: 'Backups guardados' })
    expect(unnamed()).toEqual([])
  })
})
