import type { MelloApi } from '../../shared/ipc/api'

declare global {
  interface Window {
    mello: MelloApi
  }
}
