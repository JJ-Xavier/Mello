// Dados e backup (NovoConfig.dc.html, DAD): a pasta de backup e os avisos dela (DAD-04), os backups
// guardados com "Restaurar" (DAD-03, DAD-06), exportar (DAD-07), abrir a pasta de dados e "Apagar
// tudo" (DAD-09). Restaurar e apagar tudo reiniciam o app.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { isDeleteConfirmed, type BackupItem, type BackupKind } from '../../../../shared/ipc/data'
import { Icon } from '../../components/Icon'
import { useConfirm } from '../../components/useConfirm'
import { api, unwrap } from '../../lib/api'
import { cx } from '../../lib/cx'
import { formatSize, formatWhen } from '../../lib/format'
import { useAction } from '../../lib/queries'
import { queryKeys } from '../../lib/queryKeys'
import { useNow } from '../../lib/useNow'
import { Section, Toggle, Warning } from './SettingsParts'
import styles from './SettingsPage.module.css'

const KIND_LABELS: Record<BackupKind, string> = {
  open: 'Ao abrir o app',
  hourly: 'Automático',
  manual: 'Manual',
  migration: 'Antes de atualizar o banco',
  restore: 'Antes de restaurar'
}

// "Apagar tudo?": só libera depois de digitar APAGAR. O Mello reinicia vazio.
function DeleteAllDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const action = useAction()
  const [typed, setTyped] = useState('')
  const [alsoBackups, setAlsoBackups] = useState(false)
  const [sending, setSending] = useState(false)
  const confirmed = isDeleteConfirmed(typed)

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal()
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!confirmed) return
    setSending(true)
    await action(() => unwrap(api().data.deleteAll({ confirm: typed, alsoBackups })))
    setSending(false)
  }

  return (
    <dialog
      ref={dialog}
      role="alertdialog"
      aria-labelledby={titleId}
      className={styles.dialog}
      onClose={onClose}
    >
      <form onSubmit={submit} style={{ display: 'contents' }}>
        <h2 id={titleId} className={styles.dialogTitle}>
          Apagar tudo?
        </h2>
        <p className={styles.dialogText}>
          Isso apaga todos os quadros, cards, notas e arquivos deste computador. O Mello reinicia
          vazio.
        </p>
        <label className={styles.typeLabel}>
          Digite APAGAR para confirmar
          <input
            className={styles.typeField}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />
        </label>
        <Toggle
          checked={alsoBackups}
          onChange={setAlsoBackups}
          sub="Eles podem estar em outro disco. Desmarcado, ficam guardados."
        >
          Apagar também os backups
        </Toggle>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.sec} onClick={() => dialog.current?.close()}>
            Cancelar
          </button>
          <button type="submit" className={styles.danger} disabled={!confirmed || sending}>
            Apagar tudo
          </button>
        </div>
      </form>
    </dialog>
  )
}

export function DataSection() {
  const overview = useQuery({
    queryKey: queryKeys.backups,
    queryFn: () => unwrap(api().data.backups())
  }).data
  const queryClient = useQueryClient()
  const action = useAction()
  const confirm = useConfirm()
  const now = useNow()
  const [busy, setBusy] = useState<'backup' | 'folder' | 'export' | null>(null)
  const [deleting, setDeleting] = useState(false)

  const run = async (kind: NonNullable<typeof busy>, task: () => Promise<unknown>) => {
    setBusy(kind)
    await action(task, [queryKeys.backups])
    setBusy(null)
  }

  const chooseFolder = () =>
    run('folder', async () => {
      const next = await unwrap(api().data.chooseBackupFolder())
      if (next) queryClient.setQueryData(queryKeys.backups, next)
    })

  const restore = async (item: BackupItem) => {
    const when = formatWhen(item.at, now)
    const ok = await confirm({
      title: 'Restaurar este backup?',
      message: `O Mello guarda o estado atual num backup, volta para o de ${when.charAt(0).toLowerCase()}${when.slice(1)} e reinicia.`,
      confirmLabel: 'Restaurar',
      tone: 'primary'
    })
    if (ok) await action(() => unwrap(api().data.restore({ name: item.name })))
  }

  const backups = overview?.backups ?? []
  return (
    <Section
      id="dados"
      title="Dados e backup"
      lead="Tudo fica neste computador. Nada é enviado para a internet."
    >
      <div className={styles.stack}>
        <h3 className={styles.h3}>Pasta de backup</h3>
        <div className={styles.folderRow}>
          <input
            readOnly
            aria-label="Pasta de backup"
            className={styles.folderField}
            value={overview?.folder ?? ''}
          />
          <button
            type="button"
            className={styles.sec}
            disabled={busy !== null}
            onClick={chooseFolder}
          >
            <Icon name="folder" />
            Escolher pasta
          </button>
        </div>
        {overview?.unavailable ? (
          <Warning>
            A pasta de backup escolhida não está disponível (HD desligado ou pasta apagada). Os
            backups estão indo para a pasta padrão até ela voltar.
          </Warning>
        ) : (
          overview?.sameDisk && (
            <Warning>
              Os backups estão no mesmo disco do Mello: se o disco falhar, eles se perdem junto.
              Escolha um HD externo, um pendrive ou uma pasta sincronizada com a nuvem.
            </Warning>
          )
        )}
      </div>

      <div className={styles.stack}>
        <div className={styles.backupsHead}>
          <div>
            <h3 className={styles.h3}>Backups</h3>
            <p className={styles.small}>
              Automático ao abrir, a cada hora com alterações e antes de atualizar o banco. Ficam os
              10 mais recentes.
            </p>
          </div>
          <button
            type="button"
            className={styles.pri}
            disabled={busy !== null}
            onClick={() => run('backup', () => unwrap(api().data.backupNow()))}
          >
            {busy === 'backup' ? 'Fazendo backup…' : 'Fazer backup agora'}
          </button>
        </div>
        <div role="table" aria-label="Backups guardados" className={styles.table}>
          <div role="row" className={cx(styles.row, styles.tableHead)}>
            <span role="columnheader">Quando</span>
            <span role="columnheader">Tipo</span>
            <span role="columnheader">Tamanho</span>
            <span role="columnheader" />
          </div>
          {backups.map((item) => {
            const when = formatWhen(item.at, now)
            return (
              <div key={item.name} role="row" className={styles.row}>
                <span role="cell" className={styles.when}>
                  {when}
                </span>
                <span role="cell">{KIND_LABELS[item.kind]}</span>
                <span role="cell">{formatSize(item.size)}</span>
                <span role="cell" className={styles.rowAction}>
                  <button
                    type="button"
                    className={styles.lnk}
                    aria-label={`Restaurar o backup de ${when}`}
                    onClick={() => void restore(item)}
                  >
                    Restaurar
                  </button>
                </span>
              </div>
            )
          })}
          {overview && backups.length === 0 && (
            <div role="row">
              <span role="cell" className={styles.empty}>
                Nenhum backup nesta pasta ainda.
              </span>
            </div>
          )}
        </div>
      </div>

      <div className={styles.stack}>
        <h3 className={styles.h3}>Seus dados</h3>
        <div className={styles.tiles}>
          <div className={styles.tile}>
            <button
              type="button"
              className={styles.sec}
              disabled={busy !== null}
              onClick={() => run('export', () => unwrap(api().data.export()))}
            >
              <Icon name="download" />
              {busy === 'export' ? 'Exportando…' : 'Exportar dados'}
            </button>
            <span className={styles.tileText}>
              Cria uma pasta com dados.json e os arquivos, em formato aberto, para guardar ou levar
              para outro programa.
            </span>
          </div>
          <div className={styles.tile}>
            <button
              type="button"
              className={styles.sec}
              onClick={() => void action(() => unwrap(api().data.openFolder()))}
            >
              <Icon name="folder" />
              Abrir pasta de dados
            </button>
            <span className={styles.tileText}>
              {overview?.dataFolder}: banco, anexos, fundos e capas.
            </span>
          </div>
        </div>
      </div>

      <div className={styles.dangerZone}>
        <div>
          <h3 className={styles.h3}>Apagar tudo</h3>
          <p className={styles.small}>
            Apaga o banco e todos os arquivos (anexos, fundos e capas). Não dá para desfazer.
          </p>
        </div>
        <button type="button" className={styles.danger} onClick={() => setDeleting(true)}>
          Apagar tudo…
        </button>
      </div>
      {deleting && <DeleteAllDialog onClose={() => setDeleting(false)} />}
    </Section>
  )
}
