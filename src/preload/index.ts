// Ponte entre a tela e o main. Expõe só window.mello, com uma função por canal; o ipcRenderer
// nunca é exposto. Roda em sandbox: importa apenas tipos e constantes de src/shared.
import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS, type MelloApi } from '../shared/ipc/api'

const api: MelloApi = {
  app: {
    info: () => ipcRenderer.invoke(CHANNELS.appInfo)
  }
}

contextBridge.exposeInMainWorld('mello', api)
