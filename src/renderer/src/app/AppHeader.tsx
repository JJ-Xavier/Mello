import { useId } from 'react'
import { Link, useLocation } from 'react-router'
import { Icon } from '../components/Icon'
import { Logo } from '../components/Logo'
import { cx } from '../lib/cx'
import styles from './AppHeader.module.css'
import { CreateMenu } from './CreateMenu'

// O cabeçalho muda um pouco conforme a tela, como no protótipo:
// - home: Início e calendário de todos os quadros (busca com o texto completo e engrenagem cheia);
// - board: quadro e calendário do quadro;
// - settings: Configurações (só o logo e o "Voltar").
export type HeaderVariant = 'home' | 'board' | 'settings'

export interface SettingsLocationState {
  from?: string
  // A seção que abre à vista (o "Mudar nas Configurações" do aviso da bandeja abre "lembretes").
  section?: string
}

function backLabel(from: string): string {
  if (from.startsWith('/boards/')) return 'Voltar ao quadro'
  if (from === '/calendar') return 'Voltar ao calendário'
  return 'Voltar ao início'
}

// Volta para a tela de onde as Configurações foram abertas (o Início, se não houver).
function BackLink() {
  const location = useLocation()
  const from = (location.state as SettingsLocationState | null)?.from ?? '/'
  return (
    <Link to={from} className={styles.back}>
      <Icon name="chevronLeft" />
      {backLabel(from)}
    </Link>
  )
}

export function AppHeader({ variant }: { variant: HeaderVariant }) {
  const location = useLocation()
  const home = variant === 'home'
  const createMenuId = useId()

  return (
    <header className={styles.header}>
      <Link to="/" className={styles.brand}>
        <Logo />
        Mello
      </Link>
      {variant === 'settings' ? (
        <>
          <div className={styles.spacer} />
          <BackLink />
        </>
      ) : (
        <>
          <label className={cx(styles.search, home && styles.searchHome)}>
            <Icon name="search" />
            <input
              className={styles.searchInput}
              placeholder={home ? 'Pesquisar cards, tarefas e quadros' : 'Pesquisar'}
              aria-label="Pesquisar"
            />
          </label>
          <button type="button" className={styles.create} popoverTarget={createMenuId}>
            Criar
          </button>
          <CreateMenu id={createMenuId} />
          <Link
            to="/settings"
            state={{ from: location.pathname } satisfies SettingsLocationState}
            aria-label="Configurações"
            className={styles.gear}
          >
            <Icon name={home ? 'cog' : 'gear'} size={20} />
          </Link>
        </>
      )}
    </header>
  )
}
