import { createContext, useContext } from 'react'

export type Notify = (message: string) => void

export const NotifyContext = createContext<Notify>(() => {})

// Mostra um aviso de erro no canto da tela (NotifyProvider).
export function useNotify(): Notify {
  return useContext(NotifyContext)
}
