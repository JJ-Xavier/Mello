// Seção Anexos (ANX, NovoCardCapaAnexos.dc.html): aparece quando o card tem anexos ou enquanto
// eles são copiados. Cada anexo tem a miniatura (imagens) ou a extensão, o nome, o tamanho e a data,
// e os botões Abrir, Usar como capa / Remover capa e Remover. A pasta (atalho, Release 2) tem o
// ícone de pasta e, se sumiu do lugar, "Pasta não encontrada".
import { useId, type ReactNode } from 'react'
import type { CardDetail } from '../../../../shared/ipc/cards'
import type { Attachment } from '../../../../shared/ipc/files'
import { Icon } from '../../components/Icon'
import { Popover, PopoverHeader } from '../../components/Popover'
import ui from '../../components/ui.module.css'
import { useConfirm } from '../../components/useConfirm'
import { api, unwrap } from '../../lib/api'
import { cx } from '../../lib/cx'
import { formatDate, formatSize } from '../../lib/format'
import { useAction } from '../../lib/queries'
import styles from './CardModal.module.css'
import type { Attach } from './useAttach'
import { useCardAction } from './useCardAction'

// O "Anexo" do topo e o "Adicionar" da seção: arquivos (copiados) ou uma pasta (atalho, ANX-01).
function AttachMenu({ attach, close }: { attach: Attach; close: () => void }) {
  const pick = (choose: () => Promise<void>) => {
    close()
    void choose()
  }
  return (
    <>
      <PopoverHeader title="Anexar" onClose={close} />
      <button type="button" className={ui.mi} onClick={() => pick(attach.choose)}>
        <Icon name="attachment" />
        Arquivos
      </button>
      <button type="button" className={ui.mi} onClick={() => pick(attach.chooseFolder)}>
        <Icon name="folder" />
        Pasta
      </button>
    </>
  )
}

// O botão que abre o menu "Anexar".
export function AttachButton({
  attach,
  className,
  children
}: {
  attach: Attach
  className?: string
  children: ReactNode
}) {
  const id = useId()
  return (
    <>
      <button
        type="button"
        className={className}
        title="Escolha ou solte arquivos e pastas no card"
        popoverTarget={id}
      >
        {children}
      </button>
      <Popover id={id} label="Anexar" width={220}>
        {(close) => <AttachMenu attach={attach} close={close} />}
      </Popover>
    </>
  )
}

function AttachmentRow({ card, item }: { card: CardDetail; item: Attachment }) {
  const act = useCardAction(card)
  const run = useAction()
  const confirm = useConfirm()
  const file = item.kind === 'file' ? item : null
  const missing = item.kind === 'folder' && !item.found
  const isCover = card.cover?.kind === 'image' && card.cover.fileId === file?.fileId
  // CAP-03: a capa sai junto quando nenhum outro anexo do card tem o mesmo arquivo.
  const coverGoes =
    isCover &&
    card.attachments.filter((a) => a.kind === 'file' && a.fileId === file?.fileId).length === 1

  const remove = async () => {
    const ok = await confirm({
      title: 'Remover anexo?',
      message: `“${item.name}” sai deste card.${coverGoes ? ' Ele é a capa, que sai junto.' : ''}${file ? '' : ' A pasta continua no computador.'}`,
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
      {file?.url ? (
        <img
          className={styles.thumb}
          src={file.url}
          alt={`Miniatura de ${item.name}`}
          draggable={false}
          decoding="async"
        />
      ) : (
        <span className={cx(styles.thumb, styles.fileThumb)} aria-hidden="true">
          {!file ? <Icon name="folder" /> : file.ext === 'bin' ? 'ARQ' : file.ext.toUpperCase()}
        </span>
      )}
      <span className={styles.attachmentInfo}>
        <span className={styles.attachmentName}>
          <span className={styles.attachmentTitle}>{item.name}</span>
          {isCover && <span className={styles.coverTag}>Capa</span>}
        </span>
        <span className={cx(styles.attachmentMeta, missing && styles.missing)}>
          {file
            ? `${formatSize(file.size)} · adicionado em ${formatDate(item.createdAt)}`
            : missing
              ? 'Pasta não encontrada'
              : `Pasta · adicionada em ${formatDate(item.createdAt)}`}
        </span>
        <span className={styles.attachmentActions}>
          <button
            type="button"
            className={styles.attachmentButton}
            onClick={() =>
              void run(() => unwrap(api().attachments.open({ attachmentId: item.id })))
            }
          >
            {file?.isProgram ? 'Mostrar na pasta' : 'Abrir'}
          </button>
          {file?.isImage && !isCover && (
            <button
              type="button"
              className={styles.attachmentButton}
              onClick={() => void setCover(file.fileId)}
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
        <AttachButton attach={attach} className={styles.soft}>
          Adicionar
        </AttachButton>
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
