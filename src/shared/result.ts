// Envelope de resposta de todos os canais de IPC. Uma exceção perde o tipo e parte da mensagem ao
// atravessar o IPC; o Result chega inteiro na tela.

export type ErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL'

export interface ResultError {
  code: ErrorCode
  message: string
  details?: unknown
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: ResultError }

export function ok<T>(data: T): Result<T> {
  return { ok: true, data }
}

export function fail<T = never>(code: ErrorCode, message: string, details?: unknown): Result<T> {
  return details === undefined
    ? { ok: false, error: { code, message } }
    : { ok: false, error: { code, message, details } }
}

// Erro de regra de negócio lançado pelos módulos do main. O utilitário de IPC o transforma num
// Result com o mesmo código e a mesma mensagem; qualquer outro erro vira INTERNAL.
export class AppError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}
