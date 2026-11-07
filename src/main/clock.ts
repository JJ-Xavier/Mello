// Relógio do main: o do Windows mais o adiantamento do relógio de teste (só no modo de
// desenvolvimento; decidido em 24/10/2026). Tudo o que o main grava com "agora" passa por aqui.

export interface Clock {
  now(): number
  // Milissegundos à frente do relógio do Windows.
  offset(): number
  setOffset(offset: number): void
}

export function createClock(base: () => number = Date.now): Clock {
  let offset = 0
  return {
    now: () => base() + offset,
    offset: () => offset,
    setOffset: (next) => {
      offset = next
    }
  }
}
