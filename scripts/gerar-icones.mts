// Gera os PNGs do logo do protótipo (o mesmo SVG de components/Logo.tsx) em resources/: o ícone da
// bandeja (16 e 32 px, para telas com escala de 100% e 200%) e o das notificações (64 px). Gera
// também o ícone do app e do instalador (build/icon.ico, P14), de 16 a 256 px. O desenho é feito
// pelo Chromium do próprio app, num canvas; o projeto não tem biblioteca de imagens. Os arquivos
// ficam no Git: rodar de novo só se o logo mudar.
//
// Uso: npm run build && node scripts/gerar-icones.mts
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import playwright, { type Page } from 'playwright-core'

const root = path.resolve(import.meta.dirname, '..')
const require = createRequire(import.meta.url)
const electronPath = require('electron') as string
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mello-icones-'))
const outDir = path.join(root, 'resources')
const buildDir = path.join(root, 'build')
fs.mkdirSync(outDir, { recursive: true })
fs.mkdirSync(buildDir, { recursive: true })

const env: Record<string, string> = {}
for (const [key, value] of Object.entries(process.env)) {
  if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') env[key] = value
}
env['MELLO_DATA_DIR'] = dataDir

const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1f5eff"/>
<stop offset=".62" stop-color="#4d8dff"/><stop offset="1" stop-color="#eef1f6"/></linearGradient></defs>
<rect width="32" height="32" rx="8" fill="url(#g)"/>
<path d="M8.5 23V12.5c0-2.4 2.4-3 3.8-1.3L16 16l3.7-4.8c1.4-1.7 3.8-1.1 3.8 1.3V23" fill="none"
stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`

const FILES: [string, number][] = [
  ['tray-16.png', 16],
  ['tray-32.png', 32],
  ['logo-64.png', 64]
]
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

// O logo em PNG, no tamanho pedido. O código roda na página (com o DOM), por isso vai como texto,
// como no script de capturas.
async function render(page: Page, size: number): Promise<Buffer> {
  const base64 = (await page.evaluate(`(async () => {
    const image = new Image()
    image.src = 'data:image/svg+xml;base64,' + btoa(${JSON.stringify(LOGO)})
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = ${size}
    canvas.height = ${size}
    canvas.getContext('2d').drawImage(image, 0, 0, ${size}, ${size})
    return canvas.toDataURL('image/png').split(',')[1]
  })()`)) as string
  return Buffer.from(base64, 'base64')
}

// ICO com as imagens em PNG dentro (aceito desde o Windows Vista): cabeçalho de 6 bytes, uma
// entrada de 16 bytes por tamanho (256 é gravado como 0) e os PNGs em seguida.
function ico(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = 6 + 16 * images.length
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size % 256, 0)
    entry.writeUInt8(size % 256, 1)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.length
    return entry
  })
  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)])
}

const app = await playwright._electron.launch({ executablePath: electronPath, args: [root], env })
try {
  const page = await app.firstWindow()
  await page.waitForSelector('header')
  for (const [name, size] of FILES) {
    fs.writeFileSync(path.join(outDir, name), await render(page, size))
    console.log(`Gerado: resources/${name}`)
  }
  const images = []
  for (const size of ICO_SIZES) images.push({ size, png: await render(page, size) })
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico(images))
  console.log(`Gerado: build/icon.ico (${ICO_SIZES.join(', ')} px)`)
} finally {
  await app.close()
  fs.rmSync(dataDir, { recursive: true, force: true })
}
