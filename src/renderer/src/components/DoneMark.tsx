// O ✓ circular do card (NovosEstados.dc.html e Card.dc.html): verde quando marcado, só o contorno
// quando não.
export function DoneMark({ done, size = 16 }: { done: boolean; size?: number }) {
  if (!done) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        aria-hidden="true"
        style={{ flex: 'none' }}
      >
        <circle cx="12" cy="12" r="10" fill="none" stroke="var(--muted)" strokeWidth="2" />
      </svg>
    )
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role="img"
      aria-label="Concluído"
      style={{ flex: 'none' }}
    >
      <circle cx="12" cy="12" r="11" fill="#6a9a23" />
      <path
        d="m7 12.5 3.2 3.2L17 9"
        fill="none"
        stroke="#fff"
        strokeWidth={size > 20 ? 2.4 : 2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
