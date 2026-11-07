// Ícone de prioridade do protótipo (PRI-01), com a cor de cada tema.
import type { CSSProperties } from 'react'
import { priorityLevel } from '../../../shared/rules/priority'
import styles from './PriorityIcon.module.css'

export function PriorityIcon({ value, size = 18 }: { value: number; size?: number }) {
  const level = priorityLevel(value)
  if (!level) return null
  const colors = { '--prio-dark': level.dark, '--prio-light': level.light } as CSSProperties
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={colors}
      aria-hidden="true"
    >
      <path d={level.path} />
    </svg>
  )
}
