// A classe do tema no <html> (TEM-01, TEM-03). Quem decide o tema é o main: ele passa a escolha
// das Configurações para o Chromium (nativeTheme.themeSource), e o prefers-color-scheme responde
// com o tema escolhido, ou com o do Windows em "Igual ao sistema", avisando quando muda. Assim a
// tela troca na hora, sem esperar a configuração chegar, e a primeira pintura já sai no tema certo.
import { useEffect } from 'react'

const DARK = '(prefers-color-scheme: dark)'

export function applyThemeClass(): void {
  const dark = typeof matchMedia === 'function' ? matchMedia(DARK).matches : true
  const root = document.documentElement
  root.classList.toggle('tema-escuro', dark)
  root.classList.toggle('tema-claro', !dark)
}

export function useThemeClass(): void {
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const media = matchMedia(DARK)
    applyThemeClass()
    media.addEventListener('change', applyThemeClass)
    return () => media.removeEventListener('change', applyThemeClass)
  }, [])
}
