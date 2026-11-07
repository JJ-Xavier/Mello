import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDropped } from './useDropped'

describe('useDropped (arrastar sem voltar para a origem)', () => {
  it('mostra o valor solto até o de fora mudar', () => {
    const before = ['a', 'b', 'c']
    const { result, rerender } = renderHook(({ value }) => useDropped(value), {
      initialProps: { value: before }
    })
    expect(result.current[0]).toBe(before)

    const moved = ['b', 'c', 'a']
    act(() => result.current[1](moved))
    expect(result.current[0]).toBe(moved)

    // Outro render com o mesmo valor de fora (o cache ainda não avisou): continua o solto.
    rerender({ value: before })
    expect(result.current[0]).toBe(moved)

    // O cache chegou (ou o main recarregou): vale o de fora.
    const cached = ['b', 'a', 'c']
    rerender({ value: cached })
    expect(result.current[0]).toBe(cached)
  })
})
