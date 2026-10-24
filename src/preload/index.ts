// Ponte entre a tela e o main. Expõe só window.mello, com uma função por canal; o ipcRenderer
// nunca é exposto. Roda em sandbox: importa apenas código puro de src/shared.
// O caminho de um arquivo solto no modal é tirado aqui (webUtils) e vai direto ao main: a tela
// passa o File e nunca vê o caminho.
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { createApi } from '../shared/ipc/api'

contextBridge.exposeInMainWorld(
  'mello',
  createApi(
    (channel, input) => ipcRenderer.invoke(channel, input),
    (file) => webUtils.getPathForFile(file)
  )
)
