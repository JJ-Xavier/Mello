import { useEffect, useState } from 'react'
import { useClockOffset } from './clock'

// "Agora" para as telas que dependem do relógio (data em atraso, envelhecimento), atualizado a
// cada minuto e na hora em que o relógio de teste muda.
export function useNow(intervalMs = 60_000): number {
  const offset = useClockOffset()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now + offset
}
