import { useQuery } from '@tanstack/react-query'
import { StageNotice } from '../../components/StageNotice'
import { api, unwrap } from '../../lib/api'
import { queryKeys } from '../../lib/queryKeys'

export function SettingsPage() {
  const info = useQuery({
    queryKey: queryKeys.appInfo,
    queryFn: () => unwrap(api().app.info())
  })
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
