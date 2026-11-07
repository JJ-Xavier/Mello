import { describe, expect, it } from 'vitest'
import type { ConfirmOptions } from '../../components/useConfirm'
import { confirmLarge } from './useAttach'

describe('ANX-05: arquivos grandes', () => {
  it('acima de 200 MB pede confirmação, com o botão azul; até 200 MB, não pergunta', async () => {
    const asked: ConfirmOptions[] = []
    const confirm = async (options: ConfirmOptions) => {
      asked.push(options)
      return false
    }
    const small = { token: 'a', name: 'pequeno.pdf', size: 200 * 1024 * 1024 }
    expect(await confirmLarge(confirm, [small])).toBe(true)
    expect(asked).toEqual([])

    const movie = { token: 'b', name: 'filme.mp4', size: 1.5 * 1024 ** 3 }
    expect(await confirmLarge(confirm, [small, movie])).toBe(false)
    expect(asked[0]).toMatchObject({
      title: 'Anexar arquivo grande?',
      message: expect.stringContaining('“filme.mp4” tem 1,5 GB'),
      confirmLabel: 'Anexar',
      tone: 'primary'
    })
  })
})
