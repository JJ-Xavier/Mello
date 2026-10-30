// Capa do card (CAP-02): faixa de cor ou imagem recortada para cobrir. Na face, a imagem tem a
// proporção dela até 160 px de altura (o tamanho vem do main, então a altura já está certa antes de
// a imagem carregar); no modal e na prévia, a altura é fixa.
import type { CardCover } from '../../../shared/ipc/cards'
import { cx } from '../lib/cx'
import styles from './Cover.module.css'

export function Cover({
  cover,
  height,
  className
}: {
  cover: CardCover
  height?: number
  className?: string
}) {
  if (cover.kind === 'color') {
    return (
      <div
        aria-hidden="true"
        className={cx(styles.color, className)}
        style={{ background: cover.color, height }}
      />
    )
  }
  const ratio = cover.width && cover.height ? `${cover.width} / ${cover.height}` : undefined
  return (
    <img
      alt=""
      aria-hidden="true"
      src={cover.url}
      draggable={false}
      decoding="async"
      className={cx(styles.image, className)}
      style={height ? { height } : { aspectRatio: ratio }}
    />
  )
}
