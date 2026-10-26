import { StageNotice } from '../../components/StageNotice'
import { useAppInfo } from '../../lib/queries'

export function SettingsPage() {
  const info = useAppInfo()
  return (
    <StageNotice title="Configurações" stage={10}>
      {info.data && (
        <p style={{ margin: 0, color: 'var(--muted)' }}>
          Mello {info.data.version}
          {info.data.dev ? ' (desenvolvimento)' : ''} · dados em {info.data.dataDir}
        </p>
      )}
    </StageNotice>
  )
}
