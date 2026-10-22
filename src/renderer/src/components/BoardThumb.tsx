import type { CSSProperties } from 'react'
import { backgroundCss, type BackgroundKind } from '../../../shared/rules/background'

// Miniatura do fundo de um quadro (48 × 32 nos menus do protótipo).
export function BoardThumb({
  kind,
  value,
  width = 48,
  height = 32,
  style
}: {
  kind: BackgroundKind
  value: string
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
        background: backgroundCss(kind, value),
        ...style
      }}
    />
  )
}
