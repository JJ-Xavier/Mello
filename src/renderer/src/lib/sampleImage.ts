// A cópia reduzida (64 × 40) da imagem de fundo, para o ajuste automático e o indicador de
// legibilidade (FUN-04, FUN-06). O Chromium decodifica e reduz a imagem; o protocolo
// mello-arquivo:// responde com CORS, e por isso o canvas pode ler os pixels.
import {
  analyzeBackground,
  SAMPLE_HEIGHT,
  SAMPLE_WIDTH,
  type BackgroundAnalysis
} from '../../../shared/rules/backgroundAuto'

export async function sampleImage(url: string): Promise<number[]> {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.src = url
  await image.decode()
  const bitmap = await createImageBitmap(image, {
    resizeWidth: SAMPLE_WIDTH,
    resizeHeight: SAMPLE_HEIGHT,
    resizeQuality: 'high'
  })
  const canvas = document.createElement('canvas')
  canvas.width = SAMPLE_WIDTH
  canvas.height = SAMPLE_HEIGHT
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  const { data } = context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT)
  const rgb: number[] = []
  for (let i = 0; i < data.length; i += 4) rgb.push(data[i]!, data[i + 1]!, data[i + 2]!)
  return rgb
}

export async function analyzeImage(url: string): Promise<BackgroundAnalysis> {
  return analyzeBackground(await sampleImage(url))
}
