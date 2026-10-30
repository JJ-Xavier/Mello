import { useId } from 'react'

// Logo do protótipo, literal. O id do gradiente é único por instância (useId), porque o mesmo SVG
// pode aparecer mais de uma vez na tela.
export function Logo({ size = 28 }: { size?: number }) {
  const gradientId = `logo${useId().replace(/[^\w-]/g, '')}`
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1f5eff" />
          <stop offset=".62" stopColor="#4d8dff" />
          <stop offset="1" stopColor="#eef1f6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${gradientId})`} />
      <path
        d="M8.5 23V12.5c0-2.4 2.4-3 3.8-1.3L16 16l3.7-4.8c1.4-1.7 3.8-1.1 3.8 1.3V23"
        fill="none"
        stroke="#fff"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
