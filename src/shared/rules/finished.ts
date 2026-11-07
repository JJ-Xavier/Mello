// O que conta como finalizado (FIN-01) e o ✓ automático ao trocar de lista (FIN-02, FIN-03).
// A mesma regra serve ao quadro, ao calendário, ao envelhecimento, à repetição e aos lembretes.

export interface DoneListFlag {
  isDoneList: boolean
}

// FIN-01: finalizado = numa lista de conclusão E com o ✓ marcado. O ✓ fora de uma lista de
// conclusão não finaliza (FIN-04).
export function isFinished(isDone: boolean, list: DoneListFlag): boolean {
  return list.isDoneList && isDone
}

// O ✓ depois de levar o card de `from` para `to`: entrar numa lista de conclusão marca (FIN-02),
// sair dela para uma lista comum desmarca (FIN-03); nos outros casos fica como está.
export function doneAfterMove(isDone: boolean, from: DoneListFlag, to: DoneListFlag): boolean {
  if (to.isDoneList && !from.isDoneList) return true
  if (from.isDoneList && !to.isDoneList) return false
  return isDone
}
