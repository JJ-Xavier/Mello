import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MelloApi } from '../../../shared/ipc/api'
import { unwrap } from '../lib/api'
import { installRealApi } from '../test/realApi'
import { App } from './App'

let api: MelloApi

function renderAt(hash: string) {
  window.location.hash = hash
  return render(<App />)
}

beforeEach(() => {
  api = installRealApi().api
})

describe('casca do app', () => {
  it('o Início tem o cabeçalho do protótipo e o menu lateral', async () => {
    renderAt('#/')
    const header = screen.getByRole('banner')
    expect(within(header).getByRole('link', { name: 'Mello' })).toBeTruthy()
    expect(within(header).getByPlaceholderText('Pesquisar cards, tarefas e quadros')).toBeTruthy()
    expect(within(header).getByRole('button', { name: 'Criar' })).toBeTruthy()
    expect(within(header).getByRole('link', { name: 'Configurações' })).toBeTruthy()

    const menu = screen.getByRole('navigation', { name: 'Navegação principal' })
    const quadros = within(menu).getByRole('link', { name: 'Quadros' })
    expect(quadros.getAttribute('aria-current')).toBe('page')
    expect(screen.queryByRole('navigation', { name: 'Navegação do quadro' })).toBeNull()
    expect(await screen.findByText('SUAS ÁREAS DE TRABALHO')).toBeTruthy()
  })

  it('o quadro tem a barra flutuante com Quadro, Calendário e Mudar de quadros', async () => {
    const board = await unwrap(api.boards.create({ title: 'Casa' }))
    renderAt(`#/boards/${board.id}`)
    expect(screen.getByPlaceholderText('Pesquisar')).toBeTruthy()
    const barra = screen.getByRole('navigation', { name: 'Navegação do quadro' })
    expect(within(barra).getByRole('link', { name: 'Quadro' }).getAttribute('aria-current')).toBe(
      'page'
    )
    expect(within(barra).getByRole('link', { name: 'Calendário' })).toBeTruthy()
    expect(within(barra).getByRole('button', { name: 'Mudar de quadros' })).toBeTruthy()
  })

  it('o calendário do quadro marca "Calendário" na barra', async () => {
    const board = await unwrap(api.boards.create({ title: 'Casa' }))
    renderAt(`#/boards/${board.id}/calendar`)
    const barra = screen.getByRole('navigation', { name: 'Navegação do quadro' })
    expect(
      within(barra).getByRole('link', { name: 'Calendário' }).getAttribute('aria-current')
    ).toBe('page')
    expect(within(barra).getByRole('link', { name: 'Quadro' }).getAttribute('aria-current')).toBe(
      null
    )
  })

  it('as Configurações mostram a versão vinda do main pelo IPC', async () => {
    renderAt('#/settings')
    expect(await screen.findByText(/Mello 0\.3\.0 \(desenvolvimento\)/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toBeTruthy()
  })

  it('o "Voltar" das Configurações leva para a tela de onde elas foram abertas', async () => {
    renderAt('#/calendar')
    const menu = screen.getByRole('navigation', { name: 'Navegação principal' })
    fireEvent.click(within(menu).getByRole('link', { name: 'Configurações' }))
    fireEvent.click(await screen.findByRole('link', { name: 'Voltar ao calendário' }))
    expect(await screen.findByText('Calendário de todos os quadros')).toBeTruthy()
  })

  it('um endereço desconhecido volta ao Início', () => {
    renderAt('#/nao-existe')
    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeTruthy()
  })

  it('um quadro que não existe volta ao Início', async () => {
    renderAt('#/boards/6f1c2b2e-1d3a-4c55-9a1e-2f4b8c9d0e1f')
    expect(await screen.findByRole('navigation', { name: 'Navegação principal' })).toBeTruthy()
  })
})
