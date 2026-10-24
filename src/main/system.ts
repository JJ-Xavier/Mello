// O que o main usa do Windows para os arquivos (modules/files.ts, SystemPort): a janela "Abrir",
// o programa padrão e o Explorer. Fica separado para os testes usarem uma versão falsa.
import { BrowserWindow, dialog, shell, type OpenDialogOptions } from 'electron'
import { IMAGE_EXTENSIONS } from '../shared/files'
import type { SystemPort } from './modules/files'

export function electronSystem(tempDir: string): SystemPort {
  return {
    tempDir,
    async chooseFiles({ imagesOnly }) {
      const options: OpenDialogOptions = imagesOnly
        ? {
            title: 'Escolher a imagem da capa',
            properties: ['openFile'],
            filters: [{ name: 'Imagens', extensions: IMAGE_EXTENSIONS }]
          }
        : { title: 'Anexar arquivos', properties: ['openFile', 'multiSelections'] }
      const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options)
      return result.canceled ? [] : result.filePaths
    },
    openPath: (target) => shell.openPath(target),
    showInFolder: (target) => shell.showItemInFolder(target)
  }
}
