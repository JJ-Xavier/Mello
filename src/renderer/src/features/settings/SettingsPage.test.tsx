import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MelloApi } from '../../../../shared/ipc/api'
import type { BoardSummary } from '../../../../shared/ipc/boards'
import { App } from '../../app/App'
import { unwrap } from '../../lib/api'
import { installRealApi } from '../../test/realApi'

let t: ReturnType<typeof installRealApi>
let api: MelloApi
let board: BoardSummary

beforeEach(async () => {
  t = installRealApi()
  api = t.api
  board = await unwrap(api.boards.create({ title: 'Casa' }))
})

afterEach(() => t.files.cleanup())

const saved = async () => unwrap(api.settings.get())
const html = () => document.documentElement.classList

async function openSettings() {
  window.location.hash = '#/settings'
  render(<App />)
  const data = await screen.findByRole('region', { name: 'Dados e backup' })
  // A lista de backups chega depois das outras configurações.
  const folder = within(data).getByRole('textbox', { name: 'Pasta de backup' })
  await waitFor(() => expect(folder).not.toHaveProperty('value', ''))
}

const section = (name: string) => screen.getByRole('region', { name })

describe('Aparência (TEM)', () => {
  it('TEM-01: escuro por padrão; trocar o tema muda a tela na hora e fica gravado', async () => {
    await openSettings()
    const themes = within(section('Aparência')).getByRole('radiogroup', { name: 'Tema' })
    expect(within(themes).getByRole('radio', { name: 'Escuro' })).toHaveProperty('checked', true)
    expect(html().contains('tema-escuro')).toBe(true)

    fireEvent.click(within(themes).getByRole('radio', { name: 'Claro' }))
    await waitFor(() => expect(html().contains('tema-claro')).toBe(true))
    expect(html().contains('tema-escuro')).toBe(false)
    expect(t.theme.source).toBe('light')
    expect((await saved()).theme).toBe('light')
  })

  it('TEM-03: "Igual ao sistema" acompanha a troca de tema do Windows, sem reiniciar', async () => {
    await openSettings()
    fireEvent.click(screen.getByRole('radio', { name: 'Igual ao sistema' }))
    await waitFor(() => expect(t.theme.source).toBe('system'))
    expect(html().contains('tema-escuro')).toBe(true)
    t.setWindowsDark(false)
    expect(html().contains('tema-claro')).toBe(true)
    t.setWindowsDark(true)
    expect(html().contains('tema-escuro')).toBe(true)
  })

  it('TEM-04: o fundo do quadro não muda com o tema', async () => {
    window.location.hash = `#/boards/${board.id}`
    render(<App />)
    await screen.findByRole('region', { name: 'A fazer' })
    const backdrop = () =>
      [...document.querySelectorAll<HTMLElement>('[aria-hidden="true"]')].find((element) =>
        element.style.background.includes('gradient')
      )!.style.background
    const dark = backdrop()
    await unwrap(api.settings.set({ key: 'theme', value: 'light' }))
    expect(html().contains('tema-claro')).toBe(true)
    expect(backdrop()).toBe(dark)
  })
})

describe('Envelhecimento dos cards', () => {
  it('ENV-03: a prévia dos 6 níveis com o fog(); desligado, todos ficam como novos', async () => {
    await openSettings()
    const aging = section('Envelhecimento dos cards')
    const sample = (name: string) =>
      within(aging).getByRole('img', { name: `Exemplo de card: ${name}` })
    expect(within(aging).getAllByRole('img')).toHaveLength(6)
    expect(sample('Novo').style.background).toBe('')
    expect(sample('Nível 5').getAttribute('style')).toContain('var(--fog5)')

    fireEvent.click(within(aging).getByRole('checkbox', { name: 'Ativado' }))
    await waitFor(() => expect(sample('Nível 5').style.background).toBe(''))
    expect((await saved())['aging.enabled']).toBe(false)
  })

  it('as listas que não envelhecem, agrupadas por quadro, mudam a opção da lista', async () => {
    await unwrap(api.boards.create({ title: 'Trabalho' }))
    await openSettings()
    const casa = await within(section('Envelhecimento dos cards')).findByRole('group', {
      name: 'Casa'
    })
    expect(within(casa).getByRole('checkbox', { name: 'Concluído' })).toHaveProperty(
      'checked',
      true
    )
    expect(within(casa).getByRole('checkbox', { name: 'A fazer' })).toHaveProperty('checked', false)
    expect(await screen.findByRole('group', { name: 'Trabalho' })).toBeTruthy()

    fireEvent.click(within(casa).getByRole('checkbox', { name: 'A fazer' }))
    await waitFor(() =>
      expect(within(casa).getByRole('checkbox', { name: 'A fazer' })).toHaveProperty(
        'checked',
        true
      )
    )
    const lists = (await unwrap(api.boards.get({ boardId: board.id }))).lists
    expect(lists.find((list) => list.title === 'A fazer')!.freezesAging).toBe(true)
  })
})

describe('Calendário, Lembretes e bandeja', () => {
  it('CAL-03, CAL-07 e CAL-09: as opções do calendário ficam gravadas', async () => {
    await openSettings()
    const calendar = section('Calendário')
    fireEvent.click(
      within(calendar).getByRole('checkbox', { name: 'Mostrar tarefas do checklist que têm data' })
    )
    fireEvent.click(within(calendar).getByRole('checkbox', { name: 'Riscar itens finalizados' }))
    fireEvent.change(within(calendar).getByRole('combobox', { name: 'Primeiro dia da semana' }), {
      target: { value: 'monday' }
    })
    await waitFor(async () =>
      expect(await saved()).toMatchObject({
        'calendar.showTasks': false,
        'calendar.strikeDone': false,
        'calendar.weekStart': 'monday'
      })
    )
  })

  it('P4: manter na bandeja e iniciar com o Windows', async () => {
    await openSettings()
    const tray = section('Lembretes e bandeja')
    const keep = within(tray).getByRole('checkbox', {
      name: 'Manter o Mello na bandeja ao fechar a janela'
    })
    expect(keep).toHaveProperty('checked', true)
    fireEvent.click(keep)
    fireEvent.click(within(tray).getByRole('checkbox', { name: 'Iniciar com o Windows' }))
    await waitFor(() => expect(t.theme.autoStart).toEqual([true]))
    expect(await saved()).toMatchObject({ 'tray.keep': false, 'app.autoStart': true })
  })

  it('o menu leva à seção e a marca', async () => {
    await openSettings()
    const nav = screen.getByRole('navigation', { name: 'Seções de configurações' })
    const item = (name: string) => within(nav).getByRole('button', { name })
    expect(item('Aparência').getAttribute('aria-current')).toBe('true')
    fireEvent.click(item('Dados e backup'))
    expect(item('Dados e backup').getAttribute('aria-current')).toBe('true')
    expect(item('Aparência').getAttribute('aria-current')).toBeNull()
  })
})

describe('Dados e backup (DAD)', () => {
  const table = () => screen.getByRole('table', { name: 'Backups guardados' })

  it('DAD-03: "Fazer backup agora" e a lista com quando, tipo e tamanho; o aviso de mesmo disco', async () => {
    await openSettings()
    const data = section('Dados e backup')
    expect(within(data).getByRole('textbox', { name: 'Pasta de backup' })).toHaveProperty(
      'value',
      path.join('%APPDATA%', 'backups')
    )
    expect(within(data).getByRole('status').textContent).toContain('no mesmo disco do Mello')
    expect(within(table()).getByText('Nenhum backup nesta pasta ainda.')).toBeTruthy()

    fireEvent.click(within(data).getByRole('button', { name: 'Fazer backup agora' }))
    await within(table()).findByText('Manual')
    const row = within(table()).getAllByRole('row')[1]!
    const cells = within(row).getAllByRole('cell')
    expect(cells[0]!.textContent).toMatch(/^Hoje, \d{2}:\d{2}$/)
    expect(cells[1]!.textContent).toBe('Manual')
    expect(cells[2]!.textContent).toMatch(/KB$/)
  })

  it('DAD-04: escolher outra pasta faz um backup nela; se ela sumir, o aviso', async () => {
    // Fora da pasta de dados do Mello (a pasta temporária do teste).
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'mello-hd-'))
    await openSettings()
    const data = section('Dados e backup')
    t.files.folders.push(external)
    fireEvent.click(within(data).getByRole('button', { name: 'Escolher pasta' }))
    await waitFor(() =>
      expect(within(data).getByRole('textbox', { name: 'Pasta de backup' })).toHaveProperty(
        'value',
        external
      )
    )
    expect(within(table()).getAllByRole('row')).toHaveLength(2)

    fs.rmSync(external, { recursive: true })
    fireEvent.click(within(data).getByRole('button', { name: 'Fazer backup agora' }))
    await waitFor(() =>
      expect(within(data).getByRole('status').textContent).toContain(
        'A pasta de backup escolhida não está disponível'
      )
    )
  })

  it('DAD-06: "Restaurar" pede confirmação, guarda o estado atual e reinicia', async () => {
    await t.data.backupNow()
    await openSettings()
    const restore = await within(table()).findByRole('button', {
      name: /^Restaurar o backup de Hoje/
    })

    fireEvent.click(restore)
    let dialog = await screen.findByRole('alertdialog', { name: 'Restaurar este backup?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(t.lifecycle.restarts).toBe(0)

    fireEvent.click(restore)
    dialog = await screen.findByRole('alertdialog', { name: 'Restaurar este backup?' })
    expect(dialog.textContent).toMatch(/guarda o estado atual num backup, volta para o de hoje, /)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restaurar' }))
    await waitFor(() => expect(t.lifecycle).toEqual({ shutdowns: 1, restarts: 1 }))
  })

  it('DAD-07: "Exportar dados" pergunta onde salvar e abre o Explorer no dados.json', async () => {
    const parent = path.join(t.files.root, 'Documentos')
    fs.mkdirSync(parent)
    await openSettings()
    const exportButton = within(section('Dados e backup')).getByRole('button', {
      name: 'Exportar dados'
    })
    // Cancelar a janela não exporta nada.
    fireEvent.click(exportButton)
    await waitFor(() => expect(exportButton).toHaveProperty('disabled', false))
    expect(t.files.shown).toEqual([])

    t.files.folders.push(parent)
    fireEvent.click(exportButton)
    await waitFor(() => expect(t.files.shown).toHaveLength(1))
    expect(path.basename(t.files.shown[0]!)).toBe('dados.json')
    expect(path.basename(path.dirname(t.files.shown[0]!))).toMatch(
      /^Mello-exportacao-\d{4}-\d{2}-\d{2}$/
    )
  })

  it('"Abrir pasta de dados" abre a pasta do Mello no Explorer', async () => {
    await openSettings()
    const data = section('Dados e backup')
    expect(within(data).getByText('%APPDATA%: banco, anexos, fundos e capas.')).toBeTruthy()
    fireEvent.click(within(data).getByRole('button', { name: 'Abrir pasta de dados' }))
    await waitFor(() => expect(t.files.opened).toEqual([t.paths.root]))
  })

  it('DAD-09: "Apagar tudo" só depois de digitar APAGAR; os backups só com a opção', async () => {
    await t.data.backupNow()
    await openSettings()
    fireEvent.click(within(section('Dados e backup')).getByRole('button', { name: 'Apagar tudo…' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Apagar tudo?' })
    const confirm = within(dialog).getByRole('button', { name: 'Apagar tudo' })
    expect(confirm).toHaveProperty('disabled', true)
    const field = within(dialog).getByRole('textbox', { name: 'Digite APAGAR para confirmar' })
    fireEvent.change(field, { target: { value: 'apaga' } })
    expect(confirm).toHaveProperty('disabled', true)
    fireEvent.change(field, { target: { value: 'apagar' } })
    expect(confirm).toHaveProperty('disabled', false)
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Apagar também os backups' }))

    fireEvent.click(confirm)
    await waitFor(() => expect(t.lifecycle).toEqual({ shutdowns: 1, restarts: 1 }))
    expect(fs.existsSync(t.paths.files)).toBe(false)
    expect(fs.readdirSync(t.paths.backups)).toEqual([])
  })
})
