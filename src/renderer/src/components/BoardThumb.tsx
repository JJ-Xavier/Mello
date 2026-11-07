import type { CSSProperties } from 'react'
import { backgroundCss, type BoardBackground } from '../../../shared/rules/background'

// Miniatura do fundo de um quadro (48 × 32 nos menus do protótipo, FUN-08).
export function BoardThumb({
  background,
  width = 48,
  height = 32,
  style
}: {
  background: BoardBackground
  width?: number
  height?: number
  style?: CSSProperties
}) {
  return (
    <span
      aria-hidden="true"
      style={{
        width,
        height,
        flex: 'none',
        borderRadius: 4,
        background: backgroundCss(background),
        ...style
      }}
    />
  )
}
