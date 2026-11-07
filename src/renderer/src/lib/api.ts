// Acesso da tela ao main. Toda chamada passa por window.mello (preload) e volta como Result;
// unwrap transforma o Result em valor ou em ApiError, que é o que o TanStack Query espera.
import type { MelloApi } from '../../../shared/ipc/api'
import type { ErrorCode, Result } from '../../../shared/result'

export class ApiError extends Error {
  readonly code: ErrorCode
  readonly details: unknown

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.details = details
  }
}

export async function unwrap<T>(call: Promise<Result<T>>): Promise<T> {
  const result = await call
  if (result.ok) return result.data
  throw new ApiError(result.error.code, result.error.message, result.error.details)
}

export function api(): MelloApi {
  return window.mello
}
