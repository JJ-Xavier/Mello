// Menu "Criar" do cabeçalho (Estados.dc.html). "Criar quadro" e "Criar card" trocam o menu pelo
// formulário. "Criar a partir de modelo" mostra os quadros-modelo e, dentro de um quadro, os
// cards-modelo dele (decidido na etapa 11): o quadro abre o diálogo da tela 11; o card é copiado
// para o fim da lista do modelo (MOD-03).
import { useState } from 'react'
import { useMatch } from 'react-router'
import type { BoardTemplate } from '../../../shared/ipc/templates'
import { BoardThumb } from '../components/BoardThumb'
import { Icon, type IconName } from '../components/Icon'
import { Popover, PopoverHeader } from '../components/Popover'
import ui from '../components/ui.module.css'
import { useBoard, useBoardTemplates } from '../lib/queries'
import { CreateCardForm } from '../features/card/CreateCardForm'
import { CreateBoardForm } from '../features/home/CreateBoardForm'
import { BoardTemplateDialog } from '../features/templates/BoardTemplateDialog'
import { CardTemplateOptions } from '../features/templates/CardTemplates'
import tpl from '../features/templates/Templates.module.css'

function MenuOption({
  icon,
  title,
  hint,
  onClick
}: {
  icon: IconName
  title: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={ui.mi}
      style={{ alignItems: 'flex-start', padding: 10 }}
      onClick={onClick}
    >
      <span style={{ marginTop: 2, display: 'flex' }}>
        <Icon name={icon} />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <b style={{ fontWeight: 600, color: 'var(--strong)' }}>{title}</b>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{hint}</span>
      </span>
    </button>
  )
}

function FromTemplate({
  close,
  onBoard
}: {
  close: () => void
  onBoard: (template: BoardTemplate) => void
}) {
  const templates = useBoardTemplates()
  const boardId = useMatch('/boards/:boardId/*')?.params.boardId ?? ''
  const board = useBoard(boardId)
  const boards = templates.data ?? []
  return (
    <>
      <p className={tpl.cap}>QUADROS</p>
      {boards.length === 0 && (
        <p className={ui.note}>
          Nenhum quadro-modelo ainda. Use “…” › Transformar em modelo no quadro.
        </p>
      )}
      {boards.map((template) => (
        <button
          key={template.id}
          type="button"
          className={ui.mi}
          onClick={() => {
            close()
            onBoard(template)
          }}
        >
          <BoardThumb background={template.background} width={32} height={24} />
          {template.title}
        </button>
      ))}
      {board.data && (
        <>
          <div className={ui.sep} />
          <CardTemplateOptions board={board.data} close={close} />
        </>
      )}
    </>
  )
}

function CreateMenuContent({
  close,
  onBoardTemplate
}: {
  close: () => void
  onBoardTemplate: (template: BoardTemplate) => void
}) {
  const [view, setView] = useState<'menu' | 'board' | 'card' | 'template'>('menu')
  if (view === 'card') {
    return (
      <>
        <PopoverHeader title="Criar card" onClose={close} onBack={() => setView('menu')} />
        <CreateCardForm onDone={close} />
      </>
    )
  }
  if (view === 'template') {
    return (
      <>
        <PopoverHeader
          title="Criar a partir de modelo"
          onClose={close}
          onBack={() => setView('menu')}
        />
        <FromTemplate close={close} onBoard={onBoardTemplate} />
      </>
    )
  }
  if (view === 'board') {
    return (
      <>
        <PopoverHeader title="Criar quadro" onClose={close} onBack={() => setView('menu')} />
        <CreateBoardForm onDone={close} />
      </>
    )
  }
  return (
    <>
      <MenuOption
        icon="board"
        title="Criar quadro"
        hint="Um quadro com listas, cards e fundo próprio"
        onClick={() => setView('board')}
      />
      <MenuOption
        icon="card"
        title="Criar card"
        hint="Escolha o quadro e a lista"
        onClick={() => setView('card')}
      />
      <MenuOption
        icon="template"
        title="Criar a partir de modelo"
        hint="Reaproveite um card ou quadro salvo"
        onClick={() => setView('template')}
      />
    </>
  )
}

export function CreateMenu({ id }: { id: string }) {
  // O diálogo do quadro-modelo fica fora do popover, que se fecha ao escolher.
  const [template, setTemplate] = useState<BoardTemplate | null>(null)
  return (
    <>
      <Popover id={id} label="Criar" placement="belowEnd">
        {(close) => <CreateMenuContent close={close} onBoardTemplate={setTemplate} />}
      </Popover>
      {template && <BoardTemplateDialog template={template} onClose={() => setTemplate(null)} />}
    </>
  )
}
