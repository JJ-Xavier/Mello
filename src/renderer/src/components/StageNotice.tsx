import type { ReactNode } from 'react'

// Aviso provisório nas telas que ainda não foram construídas. Some à medida que as etapas
// do Docs/PLANO.md ficam prontas.
export function StageNotice({
  title,
  stage,
  children
}: {
  title: string
  stage: number
  children?: ReactNode
}) {
  return (
    <div style={{ padding: '40px 48px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--strong)' }}>{title}</h1>
      <p style={{ margin: 0, color: 'var(--muted)' }}>Em construção: chega na etapa {stage}.</p>
      {children}
    </div>
  )
}
