// Modal do card, etapa 5: nota, atividade, anexos e capa.
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { Editor } from '@tiptap/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PNG_1X1 } from '../../../../main/modules/test-files'
import type { MelloApi } from '../../../../shared/ipc/api'
import type { BoardSummary } from '../../../../shared/ipc/boards'
import { App } from '../../app/App'
import { unwrap } from '../../lib/api'
import { installRealApi } from '../../test/realApi'

let api: MelloApi
let files: ReturnType<typeof installRealApi>['files']
let dropPath: ReturnType<typeof installRealApi>['dropPath']
let board: BoardSummary
let lists: Record<string, string>
let cardId: string

afterEach(() => files.cleanup())

beforeEach(async () => {
  ;({ api, files, dropPath } = installRealApi())
  board = await unwrap(api.boards.create({ title: 'Casa' }))
  const detail = await unwrap(api.boards.get({ boardId: board.id }))
  lists = Object.fromEntries(detail.lists.map((l) => [l.title, l.id]))
  cardId = (await unwrap(api.cards.create({ listId: lists['A fazer']!, title: 'Compras' }))).id
})

async function openCard() {
  window.location.hash = `#/boards/${board.id}?card=${cardId}`
  render(<App />)
  return screen.findByRole('dialog', { name: 'Compras' })
}

const saved = () => unwrap(api.cards.get({ cardId }))

async function openPopover(scope: HTMLElement, button: string, popover: string) {
  fireEvent.click(within(scope).getByRole('button', { name: button }))
  return screen.findByRole('dialog', { name: popover })
}

// O TipTap pendura o editor no elemento do texto; os testes digitam por ele.
function editorOf(element: HTMLElement): Editor {
  return (element as HTMLElement & { editor: Editor }).editor
}

describe('nota (NOT)', () => {
  it('NOT-03: salva sozinha depois de parar de digitar e mostra "Salvo automaticamente"', async () => {
    const modal = await openCard()
    const aside = within(modal).getByRole('complementary', { name: 'Nota e atividade' })
    expect(within(aside).getByText('Salvo automaticamente')).toBeTruthy()
    const note = within(aside).getByRole('textbox', { name: 'Nota' })
    editorOf(note).commands.insertContent('Levar sacolas')
    expect(await within(aside).findByText('Salvando…')).toBeTruthy()
    await expect.poll(async () => (await saved()).noteHtml).toBe('<p>Levar sacolas</p>')
    expect(await within(aside).findByText('Salvo automaticamente')).toBeTruthy()
  })

  it('NOT-03: fechar o modal salva o que estava pendente; NOT-06: a face ganha o ícone', async () => {
    const modal = await openCard()
    const note = within(modal).getByRole('textbox', { name: 'Nota' })
    editorOf(note).commands.insertContent('Cupom na carteira')
    fireEvent.click(within(modal).getByRole('button', { name: 'Fechar' }))
    await expect.poll(async () => (await saved()).noteHtml).toBe('<p>Cupom na carteira</p>')
    expect(await screen.findByRole('img', { name: 'Tem nota' })).toBeTruthy()
  })

  it('Esc na nota fecha o modal e salva o que estava pendente', async () => {
    const modal = await openCard()
    const note = within(modal).getByRole('textbox', { name: 'Nota' })
    editorOf(note).commands.insertContent('Chapéu')
    fireEvent.keyDown(note, { key: 'Escape', keyCode: 27 })
    await expect.poll(() => window.location.hash).toBe(`#/boards/${board.id}`)
    await expect.poll(async () => (await saved()).noteHtml).toBe('<p>Chapéu</p>')
  })

  it('a caixa de marcar da nota tem o rótulo em português', async () => {
    const task = (text: string, checked: boolean) => ({
      type: 'taskItem',
      attrs: { checked },
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
    })
    await unwrap(
      api.cards.update({
        cardId,
        note: {
          type: 'doc',
          content: [{ type: 'taskList', content: [task('Fita', true), task('Rolo', false)] }]
        }
      })
    )
    const modal = await openCard()
    expect(within(modal).getByRole('checkbox', { name: 'Desmarcar “Fita”' })).toBeTruthy()
    expect(within(modal).getByRole('checkbox', { name: 'Marcar “Rolo”' })).toBeTruthy()
  })

  it('NOT-02: a barra tem as ferramentas do protótipo', async () => {
    const modal = await openCard()
    const aside = within(modal).getByRole('complementary', { name: 'Nota e atividade' })
    const toolbar = within(aside).getByRole('toolbar', { name: 'Formatação' })
    expect(
      within(toolbar)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label'))
    ).toEqual(['Título', 'Negrito', 'Itálico', 'Lista', 'Caixa de marcar', 'Link'])
  })
})

describe('atividade (ATV)', () => {
  it('ATV-01: recolhida com a quantidade; aberta, do mais recente para o mais antigo', async () => {
    await unwrap(api.cards.move({ cardId, listId: lists['Em andamento']!, index: 0 }))
    const modal = await openCard()
    const toggle = within(modal).getByRole('button', { name: /Atividade/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(within(toggle).getByText('2 registros')).toBeTruthy()
    fireEvent.click(toggle)
    const entries = within(modal)
      .getAllByRole('listitem')
      .map((item) => item.textContent ?? '')
      .filter((text) => /^(Criado|Movido)/.test(text))
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatch(/^Movido de A fazer para Em andamento/)
    expect(entries[1]).toMatch(/^Criado em A fazer/)
  })
})

describe('anexos (ANX)', () => {
  it('ANX-01 e ANX-03: anexar pela janela do Windows, abrir e remover', async () => {
    files.chosen.push([files.sample('passagens.pdf', 'bilhete')])
    const modal = await openCard()
    fireEvent.click(within(modal).getByRole('button', { name: 'Anexo' }))
    const section = await within(modal).findByRole('region', { name: 'Anexos' })
    expect(await within(section).findByText('passagens.pdf')).toBeTruthy()
    expect(within(section).getByText('PDF')).toBeTruthy()
    expect(within(section).getByText(/^7 bytes · adicionado em /)).toBeTruthy()

    fireEvent.click(within(section).getByRole('button', { name: 'Abrir' }))
    await expect.poll(() => files.opened.length).toBe(1)

    fireEvent.click(within(section).getByRole('button', { name: 'Remover' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Remover anexo?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Remover' }))
    await expect.poll(() => within(modal).queryByRole('region', { name: 'Anexos' })).toBeNull()
    expect((await saved()).attachments).toEqual([])
  })

  it('ANX-01: soltar arquivos do Explorer no modal anexa', async () => {
    const modal = await openCard()
    const file = new File(['pão, leite'], 'lista.txt')
    dropPath(file, files.sample('lista.txt', 'pão, leite'))
    const dataTransfer = { types: ['Files'], files: [file], dropEffect: 'none' }
    const target = within(modal).getByRole('heading', { name: 'Compras' })
    fireEvent.dragOver(target, { dataTransfer })
    expect(await within(modal).findByText('Solte para anexar ao card')).toBeTruthy()
    fireEvent.drop(target, { dataTransfer })
    expect(await within(modal).findByText('lista.txt')).toBeTruthy()
    expect(within(modal).queryByText('Solte para anexar ao card')).toBeNull()
  })

  it('pasta solta (sem arquivo) avisa e não anexa nada', async () => {
    const modal = await openCard()
    const target = within(modal).getByRole('heading', { name: 'Compras' })
    const dataTransfer = { types: ['Files'], files: [new File([], 'Pasta')] }
    fireEvent.drop(target, { dataTransfer })
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect((await saved()).attachments).toEqual([])
  })

  it('programa: o botão é "Mostrar na pasta"', async () => {
    files.chosen.push([files.sample('instalador.exe', 'MZ')])
    const modal = await openCard()
    fireEvent.click(within(modal).getByRole('button', { name: 'Anexo' }))
    fireEvent.click(await within(modal).findByRole('button', { name: 'Mostrar na pasta' }))
    await expect.poll(() => files.shown.length).toBe(1)
    expect(files.opened).toEqual([])
  })
})

describe('capa (CAP)', () => {
  it('CAP-01: imagem anexada vira capa, com o selo "Capa"; CAP-03: remover o anexo tira a capa', async () => {
    files.chosen.push([files.sample('praia.png', PNG_1X1)])
    const modal = await openCard()
    fireEvent.click(within(modal).getByRole('button', { name: 'Anexo' }))
    const section = await within(modal).findByRole('region', { name: 'Anexos' })
    expect(await within(section).findByRole('img', { name: 'Miniatura de praia.png' })).toBeTruthy()
    fireEvent.click(within(section).getByRole('button', { name: 'Usar como capa' }))
    expect(await within(section).findByText('Capa')).toBeTruthy()
    expect((await saved()).cover).toMatchObject({ kind: 'image', width: 1, height: 1 })

    fireEvent.click(within(section).getByRole('button', { name: 'Remover' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Remover anexo?' })
    expect(within(confirm).getByText(/Ele é a capa, que sai junto/)).toBeTruthy()
    fireEvent.click(within(confirm).getByRole('button', { name: 'Remover' }))
    await expect.poll(async () => (await saved()).cover).toBeNull()
  })

  it('CAP-01: cor da paleta pelo botão "Capa do card"; "Remover capa" tira', async () => {
    const modal = await openCard()
    const picker = await openPopover(modal, 'Capa do card', 'Capa')
    expect(within(picker).queryByText('IMAGENS DOS ANEXOS')).toBeNull()
    fireEvent.click(within(picker).getByRole('button', { name: 'Capa verde' }))
    const pressed = () =>
      within(picker).getByRole('button', { name: 'Capa verde' }).getAttribute('aria-pressed')
    await expect.poll(pressed).toBe('true')
    expect((await saved()).cover).toEqual({ kind: 'color', color: '#216e4e' })
    fireEvent.click(within(picker).getByRole('button', { name: 'Remover capa' }))
    await expect.poll(async () => (await saved()).cover).toBeNull()
  })

  it('CAP-01: "Enviar imagem" vira capa sem virar anexo', async () => {
    files.chosen.push([files.sample('fundo.png', PNG_1X1)])
    const modal = await openCard()
    const picker = await openPopover(modal, 'Capa do card', 'Capa')
    fireEvent.click(within(picker).getByRole('button', { name: 'Enviar imagem' }))
    await expect.poll(async () => (await saved()).cover?.kind).toBe('image')
    expect((await saved()).attachments).toEqual([])
  })
})
