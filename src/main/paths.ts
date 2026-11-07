import fs from 'node:fs'
import path from 'node:path'

// Pastas de dados do Mello. A raiz é a pasta userData do Electron:
// %APPDATA%\Mello no app instalado e %APPDATA%\Mello-dev no "npm run dev" (decisão de 21/10/2026),
// para que o desenvolvimento nunca mexa nos dados reais.
export interface DataPaths {
  root: string
  db: string
  files: string
  backups: string
  logs: string
}

export function dataPaths(root: string): DataPaths {
  return {
    root,
    db: path.join(root, 'mello.db'),
    files: path.join(root, 'arquivos'),
    backups: path.join(root, 'backups'),
    logs: path.join(root, 'logs')
  }
}

export function ensureDataFolders(paths: DataPaths): void {
  for (const folder of [paths.root, paths.files, paths.backups, paths.logs]) {
    fs.mkdirSync(folder, { recursive: true })
  }
}
