// "Alterar fundo" da barra do quadro e do calendário do quadro: abre o editor de fundo (tela 6),
// que volta para onde estava.
import { Link, useLocation } from 'react-router'
import { Icon } from '../../components/Icon'
import styles from '../board/BoardPage.module.css'
import type { BackgroundLocationState } from './BackgroundEditor'

export function ChangeBackground({ boardId }: { boardId: string }) {
  const location = useLocation()
  return (
    <Link
      to={`/boards/${boardId}/background`}
      state={{ from: location.pathname } satisfies BackgroundLocationState}
      className={styles.background}
    >
      <Icon name="image" />
      Alterar fundo
    </Link>
  )
}
