// Envelhecimento dos cards (Config.dc.html): ligar e desligar (ENV-03), a prévia dos 6 níveis com o
// mesmo fog() do quadro (ENV-09), o que zera (ENV-05) e as listas que não envelhecem, agrupadas por
// quadro (a opção "Não envelhece" do menu da lista, LIS-02).
import { useQueries } from '@tanstack/react-query'
import { useRef } from 'react'
import type { SetSettingInput, Settings } from '../../../../shared/ipc/settings'
import { Icon } from '../../components/Icon'
import { api, unwrap } from '../../lib/api'
import { useAction, useBoards } from '../../lib/queries'
import { queryKeys } from '../../lib/queryKeys'
import { useFog } from '../board/useFog'
import { Section, Toggle } from './SettingsParts'
import styles from './SettingsPage.module.css'

const LEVELS = [
  ['Novo', 'Alterado hoje'],
  ['Nível 1', '3 dias parado'],
  ['Nível 2', '6 dias parado'],
  ['Nível 3', '9 dias parado'],
  ['Nível 4', '12 dias parado'],
  ['Nível 5', '14 dias ou mais']
] as const

// O card de exemplo do protótipo, com a semente dele ("Exemplo de card").
function Sample({ level, name }: { level: number; name: string }) {
  const node = useRef<HTMLDivElement>(null)
  const background = useFog(node, level, 'Exemplo de card')
  return (
    <div
      ref={node}
      role="img"
      aria-label={`Exemplo de card: ${name}`}
      className={styles.sample}
      style={background ? { background } : undefined}
    >
      <div className={styles.sampleIn} aria-hidden="true">
        <div className={styles.bars}>
          <span className={styles.bar} style={{ background: '#6e5dc6' }} />
          <span className={styles.bar} style={{ background: '#c9372c' }} />
        </div>
        <span className={styles.sampleTitle}>Exemplo de card</span>
        <div className={styles.sampleMeta}>
          <Icon name="description" />
          <span className={styles.sampleCount}>
            <Icon name="checklist" />
            2/5
          </span>
        </div>
      </div>
    </div>
  )
}

function FrozenLists() {
  const boards = useBoards()
  const details = useQueries({
    queries: (boards.data ?? []).map((board) => ({
      queryKey: queryKeys.board(board.id),
      queryFn: () => unwrap(api().boards.get({ boardId: board.id }))
    }))
  })
  const action = useAction()
  if (!boards.data) return null
  if (boards.data.length === 0) return <p className={styles.note}>Nenhum quadro ainda.</p>
  return boards.data.map((board, i) => {
    const lists = details[i]?.data?.lists ?? []
    if (lists.length === 0) return null
    return (
      <div
        key={board.id}
        role="group"
        aria-labelledby={`congelar-${board.id}`}
        className={styles.column}
      >
        <h4 id={`congelar-${board.id}`} className={styles.boardName}>
          {board.title}
        </h4>
        {lists.map((list) => (
          <Toggle
            key={list.id}
            checked={list.freezesAging}
            onChange={(freezesAging) =>
              action(
                () => unwrap(api().lists.update({ listId: list.id, freezesAging })),
                [queryKeys.board(board.id)]
              )
            }
          >
            {list.title}
          </Toggle>
        ))}
      </div>
    )
  })
}

export function AgingSection({
  settings,
  save
}: {
  settings: Settings
  save: (input: SetSettingInput) => void
}) {
  const enabled = settings['aging.enabled']
  return (
    <Section
      id="envelhecimento"
      title="Envelhecimento dos cards"
      lead='Cards sem nenhuma alteração vão sendo "comidos" pelas bordas, em 5 níveis, até 14 dias.'
      aside={
        <Toggle checked={enabled} onChange={(value) => save({ key: 'aging.enabled', value })}>
          Ativado
        </Toggle>
      }
    >
      <div className={styles.levels}>
        {LEVELS.map(([name, days], level) => (
          <div key={name} className={styles.level}>
            <Sample level={enabled ? level : 0} name={name} />
            <div className={styles.levelName}>{name}</div>
            <div className={styles.levelDays}>{days}</div>
          </div>
        ))}
      </div>

      <div className={styles.columns}>
        <div className={styles.column}>
          <h3 className={styles.h3}>O que zera o envelhecimento</h3>
          <ul className={styles.resets}>
            <li>Mover o card para outra lista ou outra posição</li>
            <li>Editar título, descrição, etiquetas ou data</li>
            <li>Marcar ou desmarcar item do checklist</li>
            <li>Editar a nota ou anexar arquivo</li>
            <li>Pegar e soltar no mesmo lugar não conta</li>
          </ul>
        </div>
        <div className={styles.column}>
          <h3 className={styles.h3}>Listas que não envelhecem</h3>
          <FrozenLists />
        </div>
      </div>
    </Section>
  )
}
