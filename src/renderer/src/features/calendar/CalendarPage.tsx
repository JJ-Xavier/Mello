import { StageNotice } from '../../components/StageNotice'

// Aberto pelo Início mostra todos os quadros; pela barra do quadro, só aquele quadro (CAL-02).
export function CalendarPage({ scope }: { scope: 'all' | 'board' }) {
  return (
    <StageNotice
      title={scope === 'all' ? 'Calendário de todos os quadros' : 'Calendário do quadro'}
      stage={7}
    />
  )
}
