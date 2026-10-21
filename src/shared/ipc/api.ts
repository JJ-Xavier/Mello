// Contrato entre a tela e o main: os nomes dos canais e a forma de window.mello.
// O preload implementa MelloApi; a tela só enxerga este tipo.
import type { Result } from '../result'

export const CHANNELS = {
  appInfo: 'app:info'
} as const

export interface AppInfo {
  version: string
  dataDir: string
  dev: boolean
}

export interface MelloApi {
  app: {
    info(): Promise<Result<AppInfo>>
  }
}
