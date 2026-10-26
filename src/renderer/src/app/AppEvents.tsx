// Avisos do main (etapa 8): o agendador mudou dados (o cache é recarregado), a notificação de um
// lembrete foi clicada (abre o card, LEM-03) e a janela foi fechada pela primeira vez com o Mello
// na bandeja (P4). Ao abrir, os lembretes perdidos com o app fechado viram um aviso só (LEM-06).
// Os dois avisos seguem NovosEstados.dc.html, num <dialog> modal.
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { EVENTS } from '../../../shared/ipc/api'
import type { MissedReminder } from '../../../shared/ipc/recurrence'
import { dueText } from '../../../shared/rules/reminders'
import { Icon } from '../components/Icon'
import ui from '../components/ui.module.css'
import { api, unwrap } from '../lib/api'
import { clockNow } from '../lib/clock'
import { cx } from '../lib/cx'
import styles from './AppEvents.module.css'

// Um <dialog> modal aberto enquanto o aviso existe. Esc fecha.
function Notice({
  labelledBy,
  onClose,
  children
}: {
  labelledBy: string
  onClose: () => void
  children: ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal()
  }, [])
  return (
    <dialog ref={dialog} aria-labelledby={labelledBy} className={styles.dialog} onClose={onClose}>
      {children}
    </dialog>
  )
}

// "O Mello continua na bandeja" (P4): "Entendi" esconde a janela e o aviso não volta.
function TrayNotice({ onClose }: { onClose: () => void }) {
  const titleId = useId()
  const hide = () => {
    void api().app.hideToTray()
    onClose()
  }
  return (
    <Notice labelledBy={titleId} onClose={onClose}>
      <div className={styles.head}>
        <span className={styles.trayIcon}>
          <Icon name="tray" size={20} />
        </span>
        <span id={titleId} className={styles.title}>
          O Mello continua na bandeja
        </span>
      </div>
      <p className={styles.text}>
        Ele fica rodando para avisar os lembretes e criar as repetições. Para fechar de vez, use
        &ldquo;Sair&rdquo; no ícone da bandeja.
      </p>
      <div className={styles.actions}>
        <button type="button" className={ui.pri} onClick={hide} autoFocus>
          Entendi
        </button>
        <button type="button" className={ui.sec} disabled title="Chega na etapa 10">
          Mudar nas Configurações
        </button>
      </div>
    </Notice>
  )
}

// LEM-06: "Você perdeu N lembretes", com "Abrir" em cada um. O card abre por cima do aviso.
function MissedReminders({
  reminders,
  onClose
}: {
  reminders: MissedReminder[]
  onClose: () => void
}) {
  const titleId = useId()
  const navigate = useNavigate()
  const now = clockNow()
  const count = reminders.length
  return (
    <Notice labelledBy={titleId} onClose={onClose}>
      <div className={styles.head}>
        <span className={styles.bellIcon}>
          <Icon name="bell" size={20} />
        </span>
        <span id={titleId} className={styles.title}>
          Você perdeu {count} {count === 1 ? 'lembrete' : 'lembretes'}
        </span>
      </div>
      <p className={styles.small}>Enquanto o Mello estava fechado:</p>
      {reminders.map((reminder) => (
        <div key={reminder.cardId} className={styles.item}>
          <span className={styles.itemText}>
            <span className={styles.itemTitle}>{reminder.title}</span>
            <span className={cx(styles.itemDue, reminder.overdue && styles.overdue)}>
              Entrega {dueText(reminder.dueAt, now)} · {reminder.boardTitle}
            </span>
          </span>
          <button
            type="button"
            className={ui.lnk}
            aria-label={`Abrir ${reminder.title}`}
            onClick={() => navigate(`/boards/${reminder.boardId}?card=${reminder.cardId}`)}
          >
            Abrir
          </button>
        </div>
      ))}
      <button
        type="button"
        className={cx(ui.sec, styles.dismiss)}
        onClick={(event) => event.currentTarget.closest('dialog')?.close()}
      >
        Dispensar
      </button>
    </Notice>
  )
}

export function AppEvents() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [trayNotice, setTrayNotice] = useState(false)
  const [missed, setMissed] = useState<MissedReminder[]>([])

  useEffect(() => {
    const off = [
      api().events.on(EVENTS.dataChanged, () => void queryClient.invalidateQueries()),
      api().events.on(EVENTS.openCard, ({ cardId, boardId }) =>
        navigate(`/boards/${boardId}?card=${cardId}`)
      ),
      api().events.on(EVENTS.trayNotice, () => setTrayNotice(true))
    ]
    return () => off.forEach((stop) => stop())
  }, [queryClient, navigate])

  // Cada lista vem uma vez só do main.
  useEffect(() => {
    void unwrap(api().reminders.missed())
      .then((list) => {
        if (list.length > 0) setMissed(list)
      })
      .catch(() => {})
  }, [])

  return (
    <>
      {trayNotice && <TrayNotice onClose={() => setTrayNotice(false)} />}
      {missed.length > 0 && <MissedReminders reminders={missed} onClose={() => setMissed([])} />}
    </>
  )
}
