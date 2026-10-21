import { describe, expect, it } from 'vitest'
import { removeAccents } from './text'

describe('removeAccents', () => {
  it('remove acentos, til e cedilha, mantendo maiúsculas e o resto do texto', () => {
    expect(removeAccents('Ação Útil à Vovó, pêssego e maçã!')).toBe(
      'Acao Util a Vovo, pessego e maca!'
    )
  })

  it('não mexe em texto sem acento', () => {
    expect(removeAccents('Compras 2026')).toBe('Compras 2026')
  })
})
