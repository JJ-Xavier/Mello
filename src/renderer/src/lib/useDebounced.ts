import { useEffect, useState } from 'react'

// O valor só muda depois de `delay` ms sem novas mudanças (ex.: a palavra-chave do filtro).
export function useDebounced<T>(value: T, delay = 250): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return settled
}
