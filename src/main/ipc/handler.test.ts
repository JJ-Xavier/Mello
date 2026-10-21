import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { AppError } from '../../shared/result'
import { createHandler } from './handler'

const input = z.object({ cardId: z.uuid(), title: z.string().trim().min(1).max(80) })
const CARD = '6f1c2b2e-1d3a-4c55-9a1e-2f4b8c9d0e1f'

describe('utilitário de IPC', () => {
  it('devolve Result de sucesso com o retorno da função', async () => {
    const handler = createHandler(input, (data) => `${data.cardId}:${data.title}`)
    await expect(handler({ cardId: CARD, title: '  Compras ' })).resolves.toEqual({
      ok: true,
      data: `${CARD}:Compras`
    })
  })

  it('aceita funções assíncronas', async () => {
    const handler = createHandler(z.undefined(), async () => 42)
    await expect(handler(undefined)).resolves.toEqual({ ok: true, data: 42 })
  })

  it('o Zod recusa entrada inválida sem chamar a função', async () => {
    const fn = vi.fn()
    const handler = createHandler(input, fn)
    const result = await handler({ cardId: 'não é uuid', title: '' })
    expect(fn).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('INVALID_INPUT')
    const paths = (result.error.details as { path: string }[]).map((issue) => issue.path)
    expect(paths).toEqual(['cardId', 'title'])
  })

  it('recusa campos que não existem no lugar de um objeto', async () => {
    const handler = createHandler(input, () => 'ok')
    const result = await handler('texto solto')
    expect(result.ok).toBe(false)
  })

  it('um AppError vira Result de erro com o mesmo código e mensagem', async () => {
    const handler = createHandler(z.undefined(), () => {
      throw new AppError('NOT_FOUND', 'Card não encontrado.')
    })
    await expect(handler(undefined)).resolves.toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Card não encontrado.' }
    })
  })

  it('um erro inesperado vira INTERNAL e é registrado', async () => {
    const onError = vi.fn()
    const boom = new Error('disco cheio')
    const handler = createHandler(
      z.undefined(),
      () => {
        throw boom
      },
      onError
    )
    const result = await handler(undefined)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('INTERNAL')
    expect(onError).toHaveBeenCalledWith(boom)
  })
})
