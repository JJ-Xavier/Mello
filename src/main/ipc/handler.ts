// Transforma uma função de módulo num handler de IPC: valida a entrada com Zod, chama a função e
// devolve sempre um Result. Não importa o Electron, para poder ser testado direto no Vitest.
import type { z } from 'zod'
import { AppError, fail, ok, type Result } from '../../shared/result'

export type Handler<T> = (raw: unknown) => Promise<Result<T>>

export function createHandler<S extends z.ZodType, T>(
  schema: S,
  fn: (input: z.output<S>) => T | Promise<T>,
  onUnexpectedError: (error: unknown) => void = () => {}
): Handler<T> {
  return async (raw) => {
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message
      }))
      return fail('INVALID_INPUT', 'Entrada inválida.', issues)
    }
    try {
      return ok(await fn(parsed.data))
    } catch (error) {
      if (error instanceof AppError) return fail(error.code, error.message)
      onUnexpectedError(error)
      return fail('INTERNAL', 'Erro inesperado. Os detalhes estão no log do Mello.')
    }
  }
}
