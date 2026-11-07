// O fundo do quadro desenhado por inteiro (FUN-03): a imagem cobrindo tudo, alinhada pelo ponto de
// foco e ampliada a partir dele pelo zoom, com o desfoque e a camada preta de "Escurecer". Cor e
// gradiente são só o background. Usado no quadro, no calendário do quadro e na prévia do editor.
import {
  backgroundCss,
  focusPosition,
  type BoardBackground
} from '../../../shared/rules/background'
import { cx } from '../lib/cx'
import styles from './BoardBackdrop.module.css'

export type BackdropBackground = Pick<
  BoardBackground,
  'kind' | 'value' | 'url' | 'focus' | 'zoom' | 'dim' | 'blur'
>

export function BoardBackdrop({
  background,
  className
}: {
  background: BackdropBackground
  className?: string
}) {
  if (background.kind !== 'image' || !background.url) {
    return (
      <div
        aria-hidden="true"
        className={cx(styles.backdrop, className)}
        style={{ background: backgroundCss(background) }}
      />
    )
  }
  const { x, y } = focusPosition(background.focus)
  // O desfoque clareia as bordas; a imagem passa um pouco da área e o excesso fica escondido.
  const bleed = background.blur * 2
  return (
    <div aria-hidden="true" className={cx(styles.backdrop, className)} data-background="image">
      <div
        className={styles.image}
        style={{
          inset: -bleed,
          backgroundImage: `url("${background.url}")`,
          backgroundPosition: `${x} ${y}`,
          transform: `scale(${background.zoom / 100})`,
          transformOrigin: `${x} ${y}`,
          filter: background.blur > 0 ? `blur(${background.blur}px)` : undefined
        }}
      />
      {background.dim > 0 && (
        <div className={styles.dim} style={{ opacity: background.dim / 100 }} />
      )}
    </div>
  )
}
