// O fundo "gasto" de um card envelhecido (ENV-09): mede o card na montagem e sempre que ele muda
// de tamanho (título editado, capa, etiquetas) e passa o tamanho real para o fog(). Card no nível
// 0 não é medido. Devolve o CSS do fundo, ou null para o card normal.
import { useLayoutEffect, useMemo, useState, type RefObject } from 'react'
import { fog } from '../../lib/fog'

export function useFog(
  node: RefObject<HTMLElement | null>,
  level: number,
  seed: string
): string | null {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  useLayoutEffect(() => {
    const element = node.current
    if (!element || level === 0) return
    const measure = () => {
      const width = element.offsetWidth
      const height = element.offsetHeight
      setSize((current) =>
        current?.width === width && current.height === height ? current : { width, height }
      )
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [node, level])

  return useMemo(
    () => (level > 0 && size ? fog(level, seed, size.width, size.height) : null),
    [level, seed, size]
  )
}
