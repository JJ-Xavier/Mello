// Instala o binário do Electron (roda sozinho no "npm install", pelo postinstall).
//
// Faz o mesmo que node_modules/electron/install.js: baixa o zip oficial pelo @electron/get,
// confere o checksum e grava o path.txt. A única diferença é o descompactador: o oficial usa um
// módulo nativo que exige o Microsoft Visual C++ Redistributable; aqui é usado o tar.exe que já
// vem no Windows. Decisão de 21/10/2026, ver Docs/Pipeline.txt.
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const electronDir = path.dirname(require.resolve('electron/package.json'))
const requireFromElectron = createRequire(path.join(electronDir, 'package.json'))

// Fora do Windows o instalador oficial funciona normalmente.
if (process.platform !== 'win32') {
  const result = spawnSync(process.execPath, [path.join(electronDir, 'install.js')], {
    stdio: 'inherit'
  })
  process.exit(result.status ?? 1)
}

const { version } = requireFromElectron('./package.json')
const distDir = path.join(electronDir, 'dist')
const pathFile = path.join(electronDir, 'path.txt')
const executable = 'electron.exe'

function isInstalled() {
  try {
    const installedVersion = fs.readFileSync(path.join(distDir, 'version'), 'utf-8')
    return (
      installedVersion.replace(/^v/, '') === version &&
      fs.readFileSync(pathFile, 'utf-8') === executable &&
      fs.existsSync(path.join(distDir, executable))
    )
  } catch {
    return false
  }
}

if (isInstalled()) process.exit(0)

try {
  const { downloadArtifact } = requireFromElectron('@electron/get')
  console.log(`Baixando o Electron ${version}...`)
  const zipPath = await downloadArtifact({
    version,
    artifactName: 'electron',
    platform: 'win32',
    arch: process.env.npm_config_arch || process.arch,
    checksums: requireFromElectron('./checksums.json'),
    cacheRoot: process.env.electron_config_cache
  })

  fs.rmSync(distDir, { recursive: true, force: true })
  fs.mkdirSync(distDir, { recursive: true })
  const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
  execFileSync(tar, ['-xf', zipPath, '-C', distDir], { stdio: 'inherit' })

  const typeDefinitions = path.join(distDir, 'electron.d.ts')
  if (fs.existsSync(typeDefinitions)) {
    fs.renameSync(typeDefinitions, path.join(electronDir, 'electron.d.ts'))
  }
  fs.writeFileSync(pathFile, executable)
  console.log('Electron instalado.')
} catch (error) {
  console.error('Não foi possível instalar o Electron:')
  console.error(error)
  process.exit(1)
}
