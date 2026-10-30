import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PNG_1X1 } from '../../../../main/modules/test-files'
import type { MelloApi } from '../../../../shared/ipc/api'
import type { BoardSummary } from '../../../../shared/ipc/boards'
import { agingTone, toneForBackground } from '../../../../shared/rules/tone'
import { App } from '../../app/App'
import { unwrap } from '../../lib/api'
import { installRealApi } from '../../test/realApi'

// O jsdom não tem canvas: a cópia reduzida da imagem é uma foto clara sintética (230 em tudo), que
// pede 50% de escurecer, sem desfoque e com o foco no centro (backgroundAuto.test.ts).
vi.mock('../../lib/sampleImage', async () => {
  const { analyzeBackground } = await import('../../../../shared/rules/backgroundAuto')
  return { analyzeImage: async () => analyzeBackground(new Array(64 * 40 * 3).fill(230)) }
})

let api: MelloApi
let files: ReturnType<typeof installRealApi>['files']
let dropPath: ReturnType<typeof installRealApi>['dropPath']
let board: BoardSummary

beforeEach(async () => {
  ;({ api, files, dropPath } = installRealApi())
  board = await unwrap(api.boards.create({ title: 'Casa' }))
})
afterEach(() => files.cleanup())

const saved = async () => unwrap(api.boards.get({ boardId: board.id }))

async function openEditor() {
  window.location.hash = `#/boards/${board.id}/background`
  render(<App />)
  return screen.findByRole('complementary', { name: 'Editor de fundo' })
}

const preview = () =>
  screen.getByRole('img', { name: 'Prévia do fundo no quadro Casa' })
    .firstElementChild as HTMLElement

describe('editor de fundo (tela 6)', () => {
  it('abre pelo "Alterar fundo" com o fundo atual; Cancelar volta sem mudar nada', async () => {
    window.location.hash = `#/boards/${board.id}`
    render(<App />)
    fireEvent.click(await screen.findByRole('link', { name: 'Alterar fundo' }))
    const editor = await screen.findByRole('complementary', { name: 'Editor de fundo' })
    expect(within(editor).getByText('Casa · cada quadro tem o seu fundo')).toBeTruthy()
    expect(within(editor).getByRole('tab', { name: 'Gradiente', selected: true })).toBeTruthy()
    expect(within(editor).getByRole('button', { name: 'Mello', pressed: true })).toBeTruthy()

    fireEvent.click(within(editor).getByRole('button', { name: 'Uva' }))
    fireEvent.click(within(editor).getByRole('link', { name: 'Cancelar' }))
    expect(await screen.findByRole('region', { name: 'A fazer' })).toBeTruthy()
    expect((await saved()).background).toMatchObject({ kind: 'gradient', value: 'mello' })
  })

  it('FUN-01 e FUN-07: a cor aparece na prévia e só vai para o quadro no "Aplicar"', async () => {
    const editor = await openEditor()
    fireEvent.click(within(editor).getByRole('tab', { name: 'Cor' }))
    fireEvent.click(within(editor).getByRole('button', { name: 'Verde' }))
    expect(preview().style.background).toBe('rgb(33, 110, 78)')
    expect((await saved()).background.kind).toBe('gradient')

    fireEvent.click(within(editor).getByRole('button', { name: 'Aplicar ao quadro' }))
    expect(await screen.findByRole('region', { name: 'A fazer' })).toBeTruthy()
    expect(await saved()).toMatchObject({
      background: { kind: 'color', value: '#216e4e' },
      bgTone: toneForBackground('color', '#216e4e')
    })
  })

  it('FUN-04 a FUN-06: a imagem enviada chega ajustada; mexer desliga o automático', async () => {
    files.chosen.push([files.sample('praia.png', PNG_1X1)])
    const editor = await openEditor()
    fireEvent.click(within(editor).getByRole('tab', { name: 'Imagem' }))
    expect(within(editor).getByRole('button', { name: 'Aplicar ao quadro' })).toHaveProperty(
      'disabled',
      true
    )
    fireEvent.click(within(editor).getByRole('button', { name: /Enviar imagem/ }))

    expect(await within(editor).findByText('praia.png')).toBeTruthy()
    expect(within(editor).getByText('Quadrada 1 × 1 → recortada para a tela (16:10)')).toBeTruthy()
    expect(within(editor).getByText('Ajustado automaticamente')).toBeTruthy()
    expect(within(editor).getAllByText('Auto')).toHaveLength(4)
    const dim = within(editor).getByRole('slider', { name: 'ESCURECER · 50%' })
    expect(within(editor).getByRole('status').textContent).toBe('Cards legíveis sobre este fundo')
    expect(
      screen.getByRole('img', { name: /Prévia/ }).querySelector('[data-background]')
    ).toBeTruthy()

    // FUN-05 e FUN-06: com menos escurecer, o aviso de pouco contraste.
    fireEvent.change(dim, { target: { value: '0' } })
    expect(within(editor).getByRole('status').textContent).toBe(
      'Pouco contraste: aumente o escurecer ou o desfoque'
    )
    expect(within(editor).getByText('Ajustado à mão')).toBeTruthy()
    expect(within(editor).getByRole('checkbox', { name: /Ajuste automático/ })).toHaveProperty(
      'checked',
      false
    )
    expect(within(editor).queryAllByText('Auto')).toHaveLength(0)

    fireEvent.click(within(editor).getByRole('button', { name: 'Restaurar automático' }))
    expect(within(editor).getByRole('slider', { name: 'ESCURECER · 50%' })).toBeTruthy()
    expect(within(editor).queryByRole('button', { name: 'Restaurar automático' })).toBeNull()

    fireEvent.click(within(editor).getByRole('button', { name: 'Foco superior direito' }))
    expect(
      within(editor).getByRole('button', { name: 'Foco superior direito', pressed: true })
    ).toBeTruthy()
    fireEvent.click(within(editor).getByRole('button', { name: 'Aplicar ao quadro' }))

    expect(await screen.findByRole('region', { name: 'A fazer' })).toBeTruthy()
    const after = await saved()
    expect(after.background).toMatchObject({
      kind: 'image',
      auto: false,
      focus: 2,
      zoom: 100,
      dim: 50,
      blur: 0,
      width: 1,
      height: 1
    })
    expect(after.bgTone).toBe(agingTone('#e6e6e6'))
    // FUN-08: o quadro mostra a imagem por inteiro, com o escurecer.
    const backdrop = document.querySelector('[data-background="image"]') as HTMLElement
    expect((backdrop.firstElementChild as HTMLElement).style.backgroundImage).toContain(
      after.background.url!
    )
  })

  it('FUN-02: soltar a imagem no "Enviar imagem"; outro formato avisa', async () => {
    const editor = await openEditor()
    fireEvent.click(within(editor).getByRole('tab', { name: 'Imagem' }))
    const target = within(editor).getByRole('button', { name: /Enviar imagem/ })
    const drop = (name: string, content: string | Uint8Array) => {
      const file = new File([], name)
      dropPath(file, files.sample(name, content))
      fireEvent.drop(target, { dataTransfer: { types: ['Files'], files: [file] } })
    }

    drop('anima.gif', 'GIF89a\n\0\n\0\0\0\0')
    expect((await within(editor).findByRole('alert')).textContent).toBe(
      'Escolha uma imagem JPG, PNG ou WEBP.'
    )
    drop('praia.png', PNG_1X1)
    expect(await within(editor).findByText('praia.png')).toBeTruthy()
    expect(within(editor).queryByRole('alert')).toBeNull()
  })

  it('reabrir com a imagem: os ajustes salvos, sem o nome do arquivo', async () => {
    files.chosen.push([files.sample('praia.png', PNG_1X1)])
    const [picked] = await unwrap(api.files.pick({ imagesOnly: true }))
    const image = await unwrap(
      api.boards.uploadBackground({ boardId: board.id, token: picked!.token })
    )
    await unwrap(
      api.boards.setBackground({
        boardId: board.id,
        background: {
          kind: 'image',
          value: image.fileId,
          auto: false,
          focus: 6,
          zoom: 130,
          dim: 20,
          blur: 4,
          avgColor: '#e6e6e6'
        }
      })
    )
    const editor = await openEditor()
    expect(within(editor).getByRole('tab', { name: 'Imagem', selected: true })).toBeTruthy()
    expect(within(editor).getByText('Imagem do quadro')).toBeTruthy()
    expect(within(editor).getByRole('slider', { name: 'ZOOM · 130%' })).toBeTruthy()
    expect(within(editor).getByRole('slider', { name: 'DESFOQUE · 4 px' })).toBeTruthy()
    expect(
      within(editor).getByRole('button', { name: 'Foco inferior esquerdo', pressed: true })
    ).toBeTruthy()
    expect(
      await within(editor).findByRole('button', { name: 'Restaurar automático' })
    ).toHaveProperty('disabled', false)
  })

  it('FUN-08: a miniatura do Início mostra a imagem, alinhada pelo foco', async () => {
    files.chosen.push([files.sample('praia.png', PNG_1X1)])
    const [picked] = await unwrap(api.files.pick({ imagesOnly: true }))
    const image = await unwrap(
      api.boards.uploadBackground({ boardId: board.id, token: picked!.token })
    )
    await unwrap(
      api.boards.setBackground({
        boardId: board.id,
        background: {
          kind: 'image',
          value: image.fileId,
          auto: true,
          focus: 0,
          zoom: 100,
          dim: 50,
          blur: 0,
          avgColor: '#e6e6e6'
        }
      })
    )
    window.location.hash = '#/'
    render(<App />)
    const tile = await screen.findByRole('link', { name: 'Casa' })
    const thumb = tile.firstElementChild as HTMLElement
    expect(thumb.style.background).toContain(image.url)
  })
})
