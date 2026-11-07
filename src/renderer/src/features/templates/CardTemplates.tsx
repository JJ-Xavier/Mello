// "Criar a partir de modelo" de card (MOD-03, NovoModelosCard.dc.html): os cards-modelo do quadro.
// Vem no ícone ao lado de "Adicionar um cartão" (a cópia entra naquela lista) e no menu "Criar"
// (a cópia entra na lista do próprio modelo).
import type { BoardDetail } from '../../../../shared/ipc/boards'
import type { CardSummary } from '../../../../shared/ipc/cards'
import { Icon } from '../../components/Icon'
import ui from '../../components/ui.module.css'
import { api, unwrap } from '../../lib/api'
import { useAction } from '../../lib/queries'
import { queryKeys } from '../../lib/queryKeys'
import styles from './Templates.module.css'

export function CardTemplateOptions({
  board,
  listId,
  close
}: {
  board: BoardDetail
  listId?: string
  close: () => void
}) {
  const run = useAction()
  // Os cards-modelo do quadro, na ordem das listas.
  const templates = board.lists.flatMap((l) => l.cards.filter((c) => c.isTemplate))

  const create = (template: CardSummary) => {
    close()
    void run(
      () =>
        unwrap(
          api().templates.createCard({
            templateId: template.id,
            listId: listId ?? template.listId
          })
        ),
      [queryKeys.board(board.id)]
    )
  }

  return (
    <>
      <p className={styles.cap}>MODELOS DESTE QUADRO</p>
      {templates.length === 0 && <p className={ui.note}>Nenhum card-modelo neste quadro ainda.</p>}
      {templates.map((template) => (
        <button
          key={template.id}
          type="button"
          className={styles.opt}
          onClick={() => create(template)}
        >
          {template.labels.length > 0 && (
            <span className={styles.labels}>
              {template.labels.map((label) => (
                <span key={label.id} className={styles.label} style={{ background: label.color }} />
              ))}
            </span>
          )}
          <span>{template.title}</span>
          {template.checkTotal > 0 && (
            <span className={styles.check}>
              <Icon name="checklist" size={14} />
              {template.checkDone}/{template.checkTotal}
            </span>
          )}
        </button>
      ))}
      <div className={ui.sep} />
      <p className={ui.note} style={{ padding: '0 4px' }}>
        Para criar um modelo, abra um card e use “…” › Transformar em modelo.{' '}
        {listId ? 'O card copiado entra nesta lista.' : 'O card copiado entra na lista do modelo.'}
      </p>
    </>
  )
}
