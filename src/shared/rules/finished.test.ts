import { describe, expect, it } from 'vitest'
import { doneAfterMove, isFinished } from './finished'

const common = { isDoneList: false }
const done = { isDoneList: true }

describe('finalizado (FIN)', () => {
  it('FIN-01: só com o ✓ e numa lista de conclusão', () => {
    expect(isFinished(true, done)).toBe(true)
    expect(isFinished(false, done)).toBe(false)
    expect(isFinished(true, common)).toBe(false) // FIN-04
    expect(isFinished(false, common)).toBe(false)
  })

  it('FIN-02: entrar numa lista de conclusão marca o ✓', () => {
    expect(doneAfterMove(false, common, done)).toBe(true)
    expect(doneAfterMove(true, common, done)).toBe(true)
  })

  it('FIN-03: sair para uma lista comum desmarca; entre duas de conclusão fica como está', () => {
    expect(doneAfterMove(true, done, common)).toBe(false)
    expect(doneAfterMove(true, done, done)).toBe(true)
    expect(doneAfterMove(false, done, done)).toBe(false)
  })

  it('FIN-04: entre listas comuns o ✓ marcado à mão continua', () => {
    expect(doneAfterMove(true, common, common)).toBe(true)
    expect(doneAfterMove(false, common, common)).toBe(false)
  })
})
