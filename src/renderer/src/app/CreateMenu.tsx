// Menu "Criar" do cabeçalho (Estados.dc.html). "Criar quadro" e "Criar card" trocam o menu pelo
// formulário; "Criar a partir de modelo" ganha função na etapa 11.
import { useState } from 'react'
import { Icon, type IconName } from '../components/Icon'
import { Popover, PopoverHeader } from '../components/Popover'
import ui from '../components/ui.module.css'
import { CreateCardForm } from '../features/card/CreateCardForm'
import { CreateBoardForm } from '../features/home/CreateBoardForm'

function MenuOption({
  icon,
  title,
  hint,
  onClick,
  disabledHint
}: {
  icon: IconName
  title: string
  hint: string
  onClick?: () => void
  disabledHint?: string
}) {
  return (
    <button
      type="button"
      className={ui.mi}
      style={{ alignItems: 'flex-start', padding: 10 }}
      onClick={onClick}
      disabled={!onClick}
      title={disabledHint}
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

function CreateMenuContent({ close }: { close: () => void }) {
  const [view, setView] = useState<'menu' | 'board' | 'card'>('menu')
  if (view === 'card') {
    return (
      <>
        <PopoverHeader title="Criar card" onClose={close} onBack={() => setView('menu')} />
        <CreateCardForm onDone={close} />
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
        disabledHint="Chega na etapa 11"
      />
    </>
  )
}

export function CreateMenu({ id }: { id: string }) {
  return (
    <Popover id={id} label="Criar" placement="belowEnd">
      {(close) => <CreateMenuContent close={close} />}
    </Popover>
  )
}
