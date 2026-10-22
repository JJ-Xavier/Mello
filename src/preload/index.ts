// Ponte entre a tela e o main. Expõe só window.mello, com uma função por canal; o ipcRenderer
// nunca é exposto. Roda em sandbox: importa apenas código puro de src/shared.
import { contextBridge, ipcRenderer } from 'electron'
import { createApi } from '../shared/ipc/api'

contextBridge.exposeInMainWorld(
  'mello',
  createApi((channel, input) => ipcRenderer.invoke(channel, input))
)
