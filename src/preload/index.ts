// Ponte entre a tela e o main. Expõe só window.mello, com uma função por canal; o ipcRenderer
// nunca é exposto. Roda em sandbox: importa apenas código puro de src/shared.
// O caminho de um arquivo solto no modal é tirado aqui (webUtils) e vai direto ao main: a tela
// passa o File e nunca vê o caminho. Os avisos do main chegam pelo ipcRenderer.on, só os de
// EVENTS (createApi filtra os nomes).
import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { createApi } from '../shared/ipc/api'

contextBridge.exposeInMainWorld(
  'mello',
  createApi(
    (channel, input) => ipcRenderer.invoke(channel, input),
    (file) => webUtils.getPathForFile(file),
    (channel, listener) => {
      const handler = (_event: IpcRendererEvent, payload: unknown) => listener(payload)
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    }
  )
)
