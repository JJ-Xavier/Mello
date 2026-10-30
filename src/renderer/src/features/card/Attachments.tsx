// Seção Anexos (ANX, NovoCardCapaAnexos.dc.html): aparece quando o card tem anexos ou enquanto
// eles são copiados. Cada anexo tem a miniatura (imagens) ou a extensão, o nome, o tamanho e a data,
// e os botões Abrir, Usar como capa / Remover capa e Remover.
import type { CardDetail } from '../../../../shared/ipc/cards'
import type { Attachment } from '../../../../shared/ipc/files'
import { Icon } from '../../components/Icon'
import { useConfirm } from '../../components/useConfirm'
import { api, unwrap } from '../../lib/api'
import { cx } from '../../lib/cx'
import { formatDate, formatSize } from '../../lib/format'
import { useAction } from '../../lib/queries'
import styles from './CardModal.module.css'
import type { Attach } from './useAttach'
import { useCardAction } from './useCardAction'

function AttachmentRow({ card, item }: { card: CardDetail; item: Attachment }) {
  const act = useCardAction(card)
  const run = useAction()
  const confirm = useConfirm()
  const isCover = card.cover?.kind === 'image' && card.cover.fileId === item.fileId
  // CAP-03: a capa sai junto quando nenhum outro anexo do card tem o mesmo arquivo.
  const coverGoes = isCover && card.attachments.filter((a) => a.fileId === item.fileId).length === 1

  const remove = async () => {
    const ok = await confirm({
      title: 'Remover anexo?',
      message: `“${item.name}” sai deste card.${coverGoes ? ' Ele é a capa, que sai junto.' : ''}`,
      confirmLabel: 'Remover'
    })
    if (ok) await act(() => unwrap(api().attachments.delete({ attachmentId: item.id })))
  }
  const setCover = (fileId: string | null) =>
    act(() =>
      unwrap(
        api().cards.setCover({
          cardId: card.id,
          cover: fileId ? { kind: 'image', fileId } : null
        })
      )
    )

  return (
    <li className={styles.attachment}>
      {item.url ? (
        <img
          className={styles.thumb}
          src={item.url}
          alt={`Miniatura de ${item.name}`}
          draggable={false}
          decoding="async"
        />
      ) : (
        <span className={cx(styles.thumb, styles.fileThumb)} aria-hidden="true">
          {item.ext === 'bin' ? 'ARQ' : item.ext.toUpperCase()}
        </span>
      )}
      <span className={styles.attachmentInfo}>
        <span className={styles.attachmentName}>
          <span className={styles.attachmentTitle}>{item.name}</span>
          {isCover && <span className={styles.coverTag}>Capa</span>}
        </span>
        <span className={styles.attachmentMeta}>
          {formatSize(item.size)} · adicionado em {formatDate(item.createdAt)}
        </span>
        <span className={styles.attachmentActions}>
          <button
            type="button"
            className={styles.attachmentButton}
            onClick={() =>
              void run(() => unwrap(api().attachments.open({ attachmentId: item.id })))
            }
          >
            {item.isProgram ? 'Mostrar na pasta' : 'Abrir'}
          </button>
          {item.isImage && !isCover && (
            <button
              type="button"
              className={styles.attachmentButton}
              onClick={() => void setCover(item.fileId)}
            >
              Usar como capa
            </button>
          )}
          {isCover && (
            <button
              type="button"
              className={styles.attachmentButton}
              onClick={() => void setCover(null)}
            >
              Remover capa
            </button>
          )}
          <button type="button" className={styles.attachmentButton} onClick={() => void remove()}>
            Remover
          </button>
        </span>
      </span>
    </li>
  )
}

export function Attachments({ card, attach }: { card: CardDetail; attach: Attach }) {
  if (card.attachments.length === 0 && attach.adding === 0) return null
  return (
    <section className={styles.section} aria-label="Anexos">
      <div className={styles.sectionHead}>
        <span className={styles.sectionIcon}>
          <Icon name="attachment" size={24} />
        </span>
        <h2 className={styles.sectionTitle}>Anexos</h2>
        <button type="button" className={styles.soft} onClick={() => void attach.choose()}>
          Adicionar
        </button>
      </div>
      <ul className={cx(styles.sectionBody, styles.attachments)}>
        {attach.adding > 0 && (
          <li className={styles.attaching} role="status">
            Anexando {attach.adding === 1 ? '1 arquivo' : `${attach.adding} arquivos`}…
          </li>
        )}
        {card.attachments.map((item) => (
          <AttachmentRow key={item.id} card={card} item={item} />
        ))}
      </ul>
    </section>
  )
}
