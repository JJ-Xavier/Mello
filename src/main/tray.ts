// Bandeja e notificações do Windows (P4, LEM-03, LEM-07). O ícone da bandeja tem o menu "Abrir o
// Mello" e "Sair", e clicar nele abre a janela. A notificação de um lembrete abre o card ao ser
// clicada. Os PNGs vêm do logo do protótipo (scripts/gerar-icones.mts).
import fs from 'node:fs'
import { Menu, nativeImage, Notification, Tray } from 'electron'
import logo64 from '../../resources/logo-64.png?asset'
import tray16 from '../../resources/tray-16.png?asset'
import tray32 from '../../resources/tray-32.png?asset'
import type { Notifier } from './scheduler'

export function createTray(actions: { open: () => void; quit: () => void }): Tray {
  const image = nativeImage.createFromPath(tray16)
  image.addRepresentation({ scaleFactor: 2, buffer: fs.readFileSync(tray32) })
  const tray = new Tray(image)
  tray.setToolTip('Mello')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir o Mello', click: actions.open },
      { type: 'separator' },
      { label: 'Sair', click: actions.quit }
    ])
  )
  tray.on('click', actions.open)
  return tray
}

// A notificação nativa. Quem desenha é o Windows; o Mello define o título, o texto e o ícone. As
// notificações abertas ficam guardadas até fechar, para o clique continuar valendo.
export function electronNotifier(onClick: (cardId: string, boardId: string) => void): Notifier {
  const open = new Set<Notification>()
  return {
    notify({ title, body, cardId, boardId }) {
      if (!Notification.isSupported()) return
      const notification = new Notification({ title, body, icon: logo64 })
      open.add(notification)
      notification.on('click', () => {
        open.delete(notification)
        onClick(cardId, boardId)
      })
      notification.on('close', () => open.delete(notification))
      notification.show()
    }
  }
}
