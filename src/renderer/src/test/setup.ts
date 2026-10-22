// Preparação dos testes da tela (jsdom).
//
// O jsdom não tem o popover nem o <dialog> modal, que no app são nativos (Chromium do Electron).
// Aqui fica uma imitação mínima, só para os testes: abrir e fechar, o evento "toggle", o clique
// num botão com popovertarget e o modal fechando os popovers abertos.
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// Os testes montam o app inteiro com o banco de verdade. O limite padrão de 1 s dos findBy… às
// vezes estoura com o computador ocupado, mesmo sem nada errado na tela.
configure({ asyncUtilTimeout: 5000 })

const OPEN = 'data-test-popover-open'

// A folha de estilo padrão do jsdom esconde todo [popover]; o aberto precisa aparecer.
const style = document.createElement('style')
style.textContent = `[popover][${OPEN}] { display: block !important; }`
document.head.append(style)

function fireToggle(element: HTMLElement, newState: 'open' | 'closed') {
  const event = new Event('toggle')
  Object.assign(event, { newState, oldState: newState === 'open' ? 'closed' : 'open' })
  element.dispatchEvent(event)
}

HTMLElement.prototype.showPopover = function showPopover(this: HTMLElement) {
  if (this.hasAttribute(OPEN)) return
  for (const other of document.querySelectorAll<HTMLElement>(`[${OPEN}]`)) {
    if (!other.contains(this)) other.hidePopover()
  }
  this.setAttribute(OPEN, '')
  fireToggle(this, 'open')
}

HTMLElement.prototype.hidePopover = function hidePopover(this: HTMLElement) {
  if (!this.hasAttribute(OPEN)) return
  this.removeAttribute(OPEN)
  fireToggle(this, 'closed')
}

HTMLElement.prototype.togglePopover = function togglePopover(this: HTMLElement) {
  if (this.hasAttribute(OPEN)) this.hidePopover()
  else this.showPopover()
  return this.hasAttribute(OPEN)
}

document.addEventListener('click', (event) => {
  const button = (event.target as Element | null)?.closest?.('button[popovertarget]')
  if (!(button instanceof HTMLButtonElement) || button.disabled) return
  const target = document.getElementById(button.getAttribute('popovertarget') ?? '')
  if (!target) return
  const action = button.getAttribute('popovertargetaction') ?? 'toggle'
  if (action === 'show') target.showPopover()
  else if (action === 'hide') target.hidePopover()
  else target.togglePopover()
})

HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  for (const popover of document.querySelectorAll<HTMLElement>(`[${OPEN}]`)) popover.hidePopover()
  this.setAttribute('open', '')
}

HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement, value?: string) {
  if (!this.hasAttribute('open')) return
  this.removeAttribute('open')
  this.returnValue = value ?? ''
  this.dispatchEvent(new Event('close'))
}

afterEach(() => {
  cleanup()
  window.location.hash = ''
})
