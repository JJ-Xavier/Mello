// Capa do card (CAP-01, NovoCardCapaAnexos.dc.html): prévia do card, as 8 cores da paleta, as
// imagens anexadas, "Enviar imagem" e "Remover capa". Escolher não fecha o popover, para a prévia
// mostrar a mudança.
import type { CardDetail, SetCoverInput } from '../../../../shared/ipc/cards'
import { LABEL_COLORS } from '../../../../shared/rules/color'
import { Cover } from '../../components/Cover'
import { PopoverHeader } from '../../components/Popover'
import ui from '../../components/ui.module.css'
import { useConfirm } from '../../components/useConfirm'
import { api, unwrap } from '../../lib/api'
import { cx } from '../../lib/cx'
import { useAction, useLabels } from '../../lib/queries'
import styles from './CardModal.module.css'
import { confirmLarge } from './useAttach'
import { useCardAction } from './useCardAction'

export function CoverPicker({ card, close }: { card: CardDetail; close: () => void }) {
  const act = useCardAction(card)
  const run = useAction()
  const confirm = useConfirm()
  const { data: labels = [] } = useLabels(card.boardId)
  const chosen = labels.filter((l) => card.labelIds.includes(l.id))
  const { cover } = card
  // Uma miniatura por arquivo (o mesmo arquivo pode estar anexado duas vezes).
  const images = card.attachments.filter(
    (a, i, all) => a.isImage && all.findIndex((b) => b.fileId === a.fileId) === i
  )

  const set = (next: SetCoverInput['cover']) =>
    void act(() => unwrap(api().cards.setCover({ cardId: card.id, cover: next })))

  // CAP-01: imagem enviada na hora (não vira anexo).
  const upload = async () => {
    const [image] = (await run(() => unwrap(api().files.pick({ imagesOnly: true })))) ?? []
    if (!image || !(await confirmLarge(confirm, [image]))) return
    await act(() => unwrap(api().cards.uploadCover({ cardId: card.id, token: image.token })))
  }

  return (
    <>
      <PopoverHeader title="Capa" onClose={close} />
      <div className={styles.coverPreview} aria-hidden="true">
        <div className={styles.coverPreviewCard}>
          {cover && <Cover cover={cover} height={cover.kind === 'image' ? 88 : 32} />}
          <div className={styles.coverPreviewIn}>
            {chosen.length > 0 && (
              <span className={styles.coverPreviewLabels}>
                {chosen.map((l) => (
                  <span key={l.id} style={{ background: l.color }} />
                ))}
              </span>
            )}
            <span className={styles.coverPreviewTitle}>{card.title}</span>
          </div>
        </div>
      </div>
      <p className={cx(ui.cap, styles.coverCaption)}>CORES</p>
      <div className={styles.colors}>
        {LABEL_COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            className={styles.color}
            style={{ background: c.value }}
            aria-label={`Capa ${c.name}`}
            aria-pressed={cover?.kind === 'color' && cover.color === c.value}
            onClick={() => set({ kind: 'color', color: c.value })}
          />
        ))}
      </div>
      {images.length > 0 && (
        <>
          <p className={cx(ui.cap, styles.coverCaption)}>IMAGENS DOS ANEXOS</p>
          <div className={styles.coverImages}>
            {images.map((a) => (
              <button
                key={a.id}
                type="button"
                className={styles.coverImageButton}
                aria-label={`Usar ${a.name} como capa`}
                aria-pressed={cover?.kind === 'image' && cover.fileId === a.fileId}
                onClick={() => set({ kind: 'image', fileId: a.fileId })}
              >
                <img src={a.url ?? undefined} alt="" draggable={false} decoding="async" />
              </button>
            ))}
          </div>
        </>
      )}
      <button
        type="button"
        className={cx(ui.sec, styles.coverUpload)}
        onClick={() => void upload()}
      >
        Enviar imagem
      </button>
      {cover && (
        <button type="button" className={styles.coverRemove} onClick={() => set(null)}>
          Remover capa
        </button>
      )}
    </>
  )
}
