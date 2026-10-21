import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MelloApi } from '../../../shared/ipc/api'
import { App } from './App'

function renderAt(hash: string) {
  window.location.hash = hash
  return render(<App />)
}

describe('casca do app', () => {
  beforeEach(() => {
    window.mello = {
      app: {
        info: async () => ({
          ok: true,
          data: { version: '0.1.0', dataDir: 'C:\\dados', dev: true }
        })
      }
    } satisfies MelloApi
  })

  afterEach(() => {
    cleanup()
    window.location.hash = ''
  })

  it('o Início tem o cabeçalho do protótipo e o menu lateral', () => {
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
  })

  it('o quadro tem a barra flutuante com Quadro, Calendário e Mudar de quadros', () => {
    renderAt('#/boards/exemplo')
    expect(screen.getByPlaceholderText('Pesquisar')).toBeTruthy()
    const barra = screen.getByRole('navigation', { name: 'Navegação do quadro' })
    const links = within(barra).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual([
      'Quadro',
      'Calendário',
      'Mudar de quadros'
    ])
    expect(within(barra).getByRole('link', { name: 'Quadro' }).getAttribute('aria-current')).toBe(
      'page'
    )
  })

  it('o calendário do quadro marca "Calendário" na barra', () => {
    renderAt('#/boards/exemplo/calendar')
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
    expect(await screen.findByText(/Mello 0\.1\.0 \(desenvolvimento\)/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toBeTruthy()
  })

  it('o "Voltar" das Configurações leva para a tela de onde elas foram abertas', async () => {
    renderAt('#/calendar')
    const menu = screen.getByRole('navigation', { name: 'Navegação principal' })
    fireEvent.click(within(menu).getByRole('link', { name: 'Configurações' }))
    const voltar = await screen.findByRole('link', { name: 'Voltar ao calendário' })
    fireEvent.click(voltar)
    expect(await screen.findByText('Calendário de todos os quadros')).toBeTruthy()
  })

  it('um endereço desconhecido volta ao Início', () => {
    renderAt('#/nao-existe')
    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeTruthy()
  })
})
