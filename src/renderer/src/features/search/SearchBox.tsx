// Busca do topo (BUS, Estados.dc.html): a partir de 2 caracteres, o painel abre embaixo do campo
// com os grupos Cards, Tarefas e Quadros (BUS-03). É um combobox: as setas escolhem o resultado,
// Enter abre (BUS-05) e Esc fecha o painel.
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { SEARCH_MIN } from '../../../../shared/ipc/search'
import { SEARCH_TEXT_MAX } from '../../../../shared/limits'
import { BoardThumb } from '../../components/BoardThumb'
import { Icon } from '../../components/Icon'
import { cx } from '../../lib/cx'
import { formatItemDate } from '../../lib/format'
import { useSearch } from '../../lib/queries'
import styles from './SearchBox.module.css'

interface Option {
  id: string
  // Card e tarefa abrem o modal do card no quadro dele; quadro abre o quadro.
  to: string
  icon: ReactNode
  title: string
  sub?: string
}

function useOptions(text: string) {
  const search = useSearch(text)
  const found = search.data
  if (!found) return { groups: [], ready: false }
  const groups: { name: string; options: Option[] }[] = [
    {
      name: 'Cards',
      options: found.cards.map((c) => ({
        id: `card-${c.id}`,
        to: `/boards/${c.boardId}?card=${c.id}`,
        icon: <span className={styles.bar} style={{ background: c.color ?? undefined }} />,
        title: c.title,
        sub: `${c.boardTitle} · ${c.listTitle}`
      }))
    },
    {
      name: 'Tarefas',
      options: found.tasks.map((task) => ({
        id: `tarefa-${task.id}`,
        to: `/boards/${task.boardId}?card=${task.cardId}`,
        icon: <Icon name={task.isDone ? 'checklist' : 'square'} />,
        title: task.text,
        sub: task.dueDate ? `${task.cardTitle} · ${formatItemDate(task.dueDate)}` : task.cardTitle
      }))
    },
    {
      name: 'Quadros',
      options: found.boards.map((b) => ({
        id: `quadro-${b.id}`,
        to: `/boards/${b.id}`,
        icon: <BoardThumb background={b.background} width={24} height={24} />,
        title: b.title
      }))
    }
  ]
  return { groups: groups.filter((g) => g.options.length > 0), ready: true }
}

export function SearchBox({ home }: { home: boolean }) {
  const navigate = useNavigate()
  const id = useId()
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const { groups, ready } = useOptions(text)
  const options = groups.flatMap((g) => g.options)
  const showing = open && text.trim().length >= SEARCH_MIN && ready
  const current = showing ? options[active] : undefined

  const change = (value: string) => {
    setText(value)
    setOpen(true)
    setActive(-1)
  }

  const go = (option: Option) => {
    setText('')
    setOpen(false)
    setActive(-1)
    navigate(option.to)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      if (showing) event.preventDefault()
      setOpen(false)
      return
    }
    if (!showing) {
      if (event.key === 'ArrowDown') setOpen(true)
      return
    }
    const count = options.length
    if (event.key === 'ArrowDown' && count > 0) {
      event.preventDefault()
      setActive((active + 1) % count)
    } else if (event.key === 'ArrowUp' && count > 0) {
      event.preventDefault()
      setActive(active <= 0 ? count - 1 : active - 1)
    } else if (event.key === 'Enter') {
      // Sem resultado escolhido, Enter abre o primeiro.
      const option = current ?? options[0]
      if (option) go(option)
    }
  }

  return (
    <div className={styles.box}>
      <label className={cx(styles.search, home && styles.searchHome)}>
        <Icon name="search" />
        <input
          className={styles.input}
          placeholder={home ? 'Pesquisar cards, tarefas e quadros' : 'Pesquisar'}
          aria-label="Pesquisar"
          role="combobox"
          aria-expanded={showing}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          aria-activedescendant={current ? `${id}-${current.id}` : undefined}
          value={text}
          maxLength={SEARCH_TEXT_MAX}
          onChange={(event) => change(event.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
      </label>
      {showing && (
        // O clique no painel não tira o foco do campo (onMouseDown), para o clique chegar à opção.
        <div
          id={`${id}-lista`}
          role="listbox"
          aria-label="Resultados da busca"
          className={styles.panel}
          onMouseDown={(event) => event.preventDefault()}
        >
          {groups.length === 0 && (
            <p className={styles.empty} role="presentation">
              Nada encontrado para “{text.trim()}”.
            </p>
          )}
          {groups.map((group) => (
            <div key={group.name} role="group" aria-labelledby={`${id}-${group.name}`}>
              <p id={`${id}-${group.name}`} className={styles.cap} role="presentation">
                {group.name.toUpperCase()}
              </p>
              {group.options.map((option) => (
                <div
                  key={option.id}
                  id={`${id}-${option.id}`}
                  role="option"
                  aria-selected={option === current}
                  className={cx(styles.option, option === current && styles.optionActive)}
                  onClick={() => go(option)}
                  onMouseMove={() => setActive(options.indexOf(option))}
                >
                  {option.icon}
                  <span className={styles.texts}>
                    <span className={styles.title}>{option.title}</span>
                    {option.sub && <span className={styles.sub}>{option.sub}</span>}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
