// O que o main usa do Windows para os arquivos (modules/files.ts, SystemPort): as janelas "Abrir"
// e de escolher pasta, o programa padrão e o Explorer. Fica separado para os testes usarem uma
// versão falsa.
import { BrowserWindow, dialog, shell, type OpenDialogOptions } from 'electron'
import { IMAGE_EXTENSIONS } from '../shared/files'
import type { SystemPort } from './modules/files'

async function showOpen(options: OpenDialogOptions): Promise<string[]> {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)
  return result.canceled ? [] : result.filePaths
}

export function electronSystem(tempDir: string): SystemPort {
  return {
    tempDir,
    chooseFiles: ({ imagesOnly }) =>
      showOpen(
        imagesOnly
          ? {
              title: 'Escolher a imagem da capa',
              properties: ['openFile'],
              filters: [{ name: 'Imagens', extensions: IMAGE_EXTENSIONS }]
            }
          : { title: 'Anexar arquivos', properties: ['openFile', 'multiSelections'] }
      ),
    async chooseFolder({ title, defaultPath }) {
      const [folder] = await showOpen({
        title,
        defaultPath,
        properties: ['openDirectory', 'createDirectory']
      })
      return folder ?? null
    },
    openPath: (target) => shell.openPath(target),
    showInFolder: (target) => shell.showItemInFolder(target)
  }
}
