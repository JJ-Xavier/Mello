import { createContext, useContext } from 'react'

export interface ConfirmOptions {
  title: string
  message: string
  confirmLabel: string
}

export type Confirm = (options: ConfirmOptions) => Promise<boolean>

export const ConfirmContext = createContext<Confirm>(async () => false)

// Pede confirmação antes de uma ação sem volta (ConfirmProvider):
//   if (await confirm({ title, message, confirmLabel: 'Excluir' })) { ... }
export function useConfirm(): Confirm {
  return useContext(ConfirmContext)
}
