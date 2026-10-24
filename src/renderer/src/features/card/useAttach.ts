// Anexar (ANX-01, ANX-05): pela janela do Windows (botões Anexo e Adicionar) ou soltando arquivos
// do Explorer no modal (decidido em 23/10/2026). Acima de 200 MB, pede confirmação antes de copiar.
// `adding` conta os arquivos sendo copiados, para a seção mostrar "Anexando…".
import { notifyManager } from '@tanstack/react-query'
import { useState } from 'react'
import type { CardDetail } from '../../../../shared/ipc/cards'
import type { PickedFile } from '../../../../shared/ipc/files'
import { LARGE_FILE_BYTES } from '../../../../shared/files'
import { useConfirm, type Confirm } from '../../components/useConfirm'
import { useNotify } from '../../components/useNotify'
import { api, unwrap } from '../../lib/api'
import { formatSize } from '../../lib/format'
import { useAction } from '../../lib/queries'
import { useCardAction } from './useCardAction'

// ANX-05: confirma os arquivos grandes. Cancelar não anexa nada.
export async function confirmLarge(confirm: Confirm, picked: PickedFile[]): Promise<boolean> {
  const large = picked.filter((f) => f.size > LARGE_FILE_BYTES)
  if (large.length === 0) return true
  const [first] = large
  return confirm({
    title: large.length === 1 ? 'Anexar arquivo grande?' : 'Anexar arquivos grandes?',
    message:
      large.length === 1
        ? `“${first!.name}” tem ${formatSize(first!.size)}. Ele será copiado para a pasta do Mello, o que pode demorar.`
        : `${large.map((f) => `“${f.name}”`).join(', ')} têm mais de 200 MB. Eles serão copiados para a pasta do Mello, o que pode demorar.`,
    confirmLabel: 'Anexar',
    tone: 'primary'
  })
}

export function useAttach(card: CardDetail) {
  const confirm = useConfirm()
  const notify = useNotify()
  const run = useAction()
  const act = useCardAction(card)
  const [adding, setAdding] = useState(0)

  const attach = async (picked: PickedFile[] | undefined) => {
    if (!picked?.length || !(await confirmLarge(confirm, picked))) return
    const tokens = picked.map((f) => f.token)
    setAdding((n) => n + tokens.length)
    await act(() => unwrap(api().attachments.add({ cardId: card.id, tokens })))
    // O TanStack Query entrega o card novo à tela um instante depois (notifyManager). Tirar o
    // "Anexando…" na mesma fila evita um quadro sem a seção (ela sumia e voltava).
    notifyManager.schedule(() => setAdding((n) => n - tokens.length))
  }

  return {
    adding,
    choose: async () => attach(await run(() => unwrap(api().files.pick({ imagesOnly: false })))),
    drop: async (files: File[]) => {
      const picked = await run(() => unwrap(api().files.dropped(files)))
      if (picked?.length === 0) notify('Solte arquivos para anexar. Pastas não podem ser anexadas.')
      await attach(picked)
    }
  }
}

export type Attach = ReturnType<typeof useAttach>
