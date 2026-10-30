// Tabela de canais: cada canal liga um schema Zod a uma função de módulo (valida → chama →
// Result). Não importa o Electron: o index.ts registra as rotas no ipcMain e os testes da tela as
// usam direto, com um banco em memória.
import path from 'node:path'
import { z } from 'zod'
import { CHANNELS, type AppInfo } from '../../shared/ipc/api'
import {
  boardIdInput,
  createBoardInput,
  createListInput,
  listIdInput,
  moveBoardInput,
  moveListInput,
  moveListToBoardInput,
  setBackgroundInput,
  sortListInput,
  updateBoardInput,
  updateListInput,
  uploadBackgroundInput
} from '../../shared/ipc/boards'
import { calendarAddCardInput, calendarMonthInput } from '../../shared/ipc/calendar'
import {
  cardIdInput,
  copyCardInput,
  createCardInput,
  matchingInput,
  moveCardInput,
  setCoverInput,
  setLabelsInput,
  updateCardInput
} from '../../shared/ipc/cards'
import {
  checklistIdInput,
  createChecklistInput,
  createItemInput,
  itemIdInput,
  moveChecklistInput,
  moveItemInput,
  toggleItemInput,
  updateChecklistInput,
  updateItemInput
} from '../../shared/ipc/checklists'
import {
  addAttachmentsInput,
  attachmentIdInput,
  droppedFilesInput,
  pickFilesInput,
  uploadCoverInput
} from '../../shared/ipc/files'
import { setClockInput } from '../../shared/ipc/dev'
import { createLabelInput, labelIdInput, updateLabelInput } from '../../shared/ipc/labels'
import { deleteAllInput, restoreBackupInput } from '../../shared/ipc/data'
import { occurrenceIdInput, saveRecurrenceInput } from '../../shared/ipc/recurrence'
import { searchInput } from '../../shared/ipc/search'
import { setSettingInput, type Theme } from '../../shared/ipc/settings'
import {
  createBoardFromTemplateInput,
  createCardFromTemplateInput,
  setTemplateBoardInput,
  setTemplateCardInput
} from '../../shared/ipc/templates'
import { AppError } from '../../shared/result'
import type { Clock } from '../clock'
import type { Db } from '../db/client'
import type { Scheduler } from '../scheduler'
import * as attachments from '../modules/attachments'
import * as boards from '../modules/boards'
import * as calendar from '../modules/calendar'
import * as cards from '../modules/cards'
import * as checklists from '../modules/checklists'
import type { DataService } from '../modules/data'
import { createPicks, type FileStore } from '../modules/files'
import * as labels from '../modules/labels'
import * as lists from '../modules/lists'
import * as recurrence from '../modules/recurrence'
import { search } from '../modules/search'
import * as settings from '../modules/settings'
import * as templates from '../modules/templates'
import { createHandler, type Handler } from './handler'

export interface RouteContext {
  db: Db
  app: AppInfo
  // O "agora" de tudo o que o main grava; no modo de desenvolvimento, pode estar adiantado.
  clock: Clock
  // Pasta dos arquivos guardados e o que o main usa do Windows (janela de abrir, programa padrão).
  files: FileStore
  // O agendador (repetições e lembretes): roda de novo quando o relógio de teste muda e guarda os
  // lembretes perdidos. Sem ele (testes da tela), não há lembretes perdidos.
  scheduler?: Pick<Scheduler, 'tick' | 'takeMissed'>
  // Esconder a janela na bandeja ("Entendi" no aviso da bandeja, P4).
  hideToTray?: () => void
  // Dados e backup (DAD). Sem ele, os canais data:* recusam.
  data?: DataService
  // O que muda no Windows junto com a configuração: o tema da janela (TEM-01, TEM-03) e o
  // "Iniciar com o Windows" (P4).
  desktop?: DesktopPort
  onUnexpectedError?: (channel: string, error: unknown) => void
}

export interface DesktopPort {
  applyTheme(theme: Theme): void
  setAutoStart(enabled: boolean): void
}

export type Routes = Map<string, Handler<unknown>>

export function createRoutes({
  db,
  app,
  clock,
  files,
  scheduler,
  hideToTray,
  data,
  desktop,
  onUnexpectedError
}: RouteContext): Routes {
  const routes: Routes = new Map()
  const now = () => clock.now()
  const none = z.undefined()
  // Arquivos escolhidos ou soltos, à espera da confirmação da tela (modules/files.ts).
  const picks = createPicks()

  function route<S extends z.ZodType, T>(
    channel: string,
    schema: S,
    fn: (input: z.output<S>) => T | Promise<T>
  ): void {
    routes.set(
      channel,
      createHandler(schema, fn, (error) => onUnexpectedError?.(channel, error))
    )
  }

  // Para os canais que não devolvem nada: o Result leva null.
  function done(fn: () => unknown): null {
    fn()
    return null
  }

  route(CHANNELS.appInfo, none, () => app)

  route(CHANNELS.boardsList, none, () => boards.listOpen(db))
  route(CHANNELS.boardsListClosed, none, () => boards.listClosed(db))
  route(CHANNELS.boardsGet, boardIdInput, ({ boardId }) => boards.get(db, boardId))
  route(CHANNELS.boardsCreate, createBoardInput, ({ title }) => boards.create(db, title, now()))
  route(CHANNELS.boardsUpdate, updateBoardInput, (input) => boards.update(db, input, now()))
  route(CHANNELS.boardsMove, moveBoardInput, ({ boardId, index }) =>
    done(() => boards.move(db, boardId, index, now()))
  )
  route(CHANNELS.boardsClose, boardIdInput, ({ boardId }) =>
    done(() => boards.close(db, boardId, now()))
  )
  route(CHANNELS.boardsReopen, boardIdInput, ({ boardId }) =>
    done(() => boards.reopen(db, boardId, now()))
  )
  route(CHANNELS.boardsDelete, boardIdInput, ({ boardId }) =>
    done(() => boards.remove(db, boardId))
  )
  route(CHANNELS.boardsArchived, boardIdInput, ({ boardId }) => boards.archived(db, boardId))
  route(CHANNELS.boardsUploadBackground, uploadBackgroundInput, ({ boardId, token }) => {
    const [pick] = picks.take([token])
    return boards.uploadBackground(db, files, boardId, pick!, now())
  })
  route(CHANNELS.boardsSetBackground, setBackgroundInput, (input) =>
    done(() => boards.setBackground(db, input, now()))
  )

  route(CHANNELS.listsCreate, createListInput, ({ boardId, title }) =>
    lists.create(db, boardId, title, now())
  )
  route(CHANNELS.listsUpdate, updateListInput, (input) => lists.update(db, input, now()))
  route(CHANNELS.listsMove, moveListInput, ({ listId, index }) =>
    done(() => lists.move(db, listId, index, now()))
  )
  route(CHANNELS.listsCopy, listIdInput, ({ listId }) => lists.copy(db, listId, now()))
  route(CHANNELS.listsMoveToBoard, moveListToBoardInput, ({ listId, boardId, index }) =>
    done(() => lists.moveToBoard(db, listId, boardId, index, now()))
  )
  route(CHANNELS.listsSort, sortListInput, ({ listId, by }) =>
    done(() => lists.sort(db, listId, by))
  )
  route(CHANNELS.listsArchive, listIdInput, ({ listId }) =>
    done(() => lists.archive(db, listId, now()))
  )
  route(CHANNELS.listsArchiveCards, listIdInput, ({ listId }) =>
    lists.archiveCards(db, listId, now())
  )
  route(CHANNELS.listsRestore, listIdInput, ({ listId }) =>
    done(() => lists.restore(db, listId, now()))
  )

  route(CHANNELS.cardsGet, cardIdInput, ({ cardId }) => cards.get(db, cardId))
  route(CHANNELS.cardsCreate, createCardInput, ({ listId, title }) =>
    cards.create(db, listId, title, now())
  )
  route(CHANNELS.cardsUpdate, updateCardInput, (input) =>
    done(() => cards.update(db, input, now()))
  )
  route(CHANNELS.cardsCopy, copyCardInput, (input) => cards.copy(db, input, now()))
  route(CHANNELS.cardsSetLabels, setLabelsInput, ({ cardId, labelIds }) =>
    done(() => cards.setLabels(db, cardId, labelIds, now()))
  )
  route(CHANNELS.cardsArchive, cardIdInput, ({ cardId }) =>
    done(() => cards.archive(db, cardId, now()))
  )
  route(CHANNELS.cardsMatching, matchingInput, ({ boardId, keyword }) =>
    cards.matching(db, boardId, keyword)
  )
  route(CHANNELS.cardsMove, moveCardInput, ({ cardId, listId, index }) =>
    done(() => cards.move(db, cardId, listId, index, now()))
  )
  route(CHANNELS.cardsRestore, cardIdInput, ({ cardId }) =>
    done(() => cards.restore(db, cardId, now()))
  )
  route(CHANNELS.cardsDelete, cardIdInput, ({ cardId }) => done(() => cards.remove(db, cardId)))
  route(CHANNELS.cardsSetCover, setCoverInput, ({ cardId, cover }) =>
    done(() => attachments.setCover(db, cardId, cover, now()))
  )
  route(CHANNELS.cardsUploadCover, uploadCoverInput, async ({ cardId, token }) => {
    const [pick] = picks.take([token])
    await attachments.uploadCover(db, files, cardId, pick!.path, now())
    return null
  })

  route(CHANNELS.filesPick, pickFilesInput, async ({ imagesOnly }) =>
    picks.register(await files.system.chooseFiles({ imagesOnly }))
  )
  route(CHANNELS.filesDropped, droppedFilesInput, ({ paths }) => picks.register(paths))
  route(CHANNELS.attachmentsAdd, addAttachmentsInput, async ({ cardId, tokens }) => {
    await attachments.add(db, files, cardId, picks.take(tokens), now())
    return null
  })
  route(CHANNELS.attachmentsOpen, attachmentIdInput, ({ attachmentId }) =>
    attachments.open(db, files, attachmentId)
  )
  route(CHANNELS.attachmentsDelete, attachmentIdInput, ({ attachmentId }) =>
    done(() => attachments.remove(db, attachmentId, now()))
  )

  route(CHANNELS.labelsList, boardIdInput, ({ boardId }) => labels.list(db, boardId))
  route(CHANNELS.labelsCreate, createLabelInput, (input) => labels.create(db, input))
  route(CHANNELS.labelsUpdate, updateLabelInput, (input) => labels.update(db, input))
  route(CHANNELS.labelsDelete, labelIdInput, ({ labelId }) =>
    done(() => labels.remove(db, labelId))
  )

  route(CHANNELS.checklistsCreate, createChecklistInput, ({ cardId, title }) =>
    checklists.create(db, cardId, title, now())
  )
  route(CHANNELS.checklistsUpdate, updateChecklistInput, (input) =>
    done(() => checklists.update(db, input, now()))
  )
  route(CHANNELS.checklistsMove, moveChecklistInput, ({ checklistId, index }) =>
    done(() => checklists.move(db, checklistId, index, now()))
  )
  route(CHANNELS.checklistsDelete, checklistIdInput, ({ checklistId }) =>
    done(() => checklists.remove(db, checklistId, now()))
  )
  route(CHANNELS.itemsCreate, createItemInput, ({ checklistId, text }) =>
    checklists.createItem(db, checklistId, text, now())
  )
  route(CHANNELS.itemsUpdate, updateItemInput, (input) =>
    done(() => checklists.updateItem(db, input, now()))
  )
  route(CHANNELS.itemsToggle, toggleItemInput, ({ itemId, isDone }) =>
    done(() => checklists.toggleItem(db, itemId, isDone, now()))
  )
  route(CHANNELS.itemsMove, moveItemInput, ({ itemId, index }) =>
    done(() => checklists.moveItem(db, itemId, index, now()))
  )
  route(CHANNELS.itemsDelete, itemIdInput, ({ itemId }) =>
    done(() => checklists.removeItem(db, itemId, now()))
  )

  route(CHANNELS.calendarMonth, calendarMonthInput, (input) => calendar.month(db, input))
  route(CHANNELS.calendarAddCard, calendarAddCardInput, (input) =>
    calendar.addCard(db, input, now())
  )

  route(CHANNELS.settingsGet, none, () => settings.get(db))
  route(CHANNELS.settingsSet, setSettingInput, (input) => {
    settings.set(db, input.key, input.value as never)
    if (input.key === 'theme') desktop?.applyTheme(input.value)
    if (input.key === 'app.autoStart') desktop?.setAutoStart(input.value)
    return settings.get(db)
  })

  // Dados e backup (DAD). As pastas vêm da janela do Windows; a tela só manda o nome de um
  // backup da pasta atual.
  const dataService = (): DataService => {
    if (!data) throw new AppError('CONFLICT', 'Dados e backup não estão disponíveis aqui.')
    return data
  }
  route(CHANNELS.dataBackups, none, () => dataService().overview())
  route(CHANNELS.dataBackupNow, none, () => dataService().backupNow())
  route(CHANNELS.dataChooseBackupFolder, none, async () => {
    const service = dataService()
    const chosen = await files.system.chooseFolder({
      title: 'Escolher a pasta de backup',
      defaultPath: service.folder()
    })
    if (!chosen) return null
    await service.setFolder(chosen)
    return service.overview()
  })
  route(CHANNELS.dataRestore, restoreBackupInput, async ({ name }) => {
    await dataService().restore(name)
    return null
  })
  route(CHANNELS.dataExport, none, async () => {
    const service = dataService()
    const parent = await files.system.chooseFolder({
      title: 'Escolher onde salvar a exportação',
      defaultPath: service.exportsDefault
    })
    if (!parent) return null
    const exported = await service.exportTo(parent)
    files.system.showInFolder(exported.json)
    return { folder: path.basename(exported.folder) }
  })
  route(CHANNELS.dataOpenFolder, none, async () => {
    const error = await files.system.openPath(app.dataDir)
    if (error) throw new AppError('CONFLICT', `Não foi possível abrir a pasta: ${error}`)
    return null
  })
  route(CHANNELS.dataDeleteAll, deleteAllInput, ({ alsoBackups }) =>
    done(() => dataService().deleteAll(alsoBackups))
  )
  route(CHANNELS.dataNotices, none, () => data?.takeNotices() ?? [])

  // Relógio de teste (decidido em 24/10/2026). O app instalado só informa que não está adiantado.
  route(CHANNELS.devClock, none, () => ({ offset: clock.offset() }))
  route(CHANNELS.devSetClock, setClockInput, ({ offset }) => {
    if (!app.dev) {
      throw new AppError('CONFLICT', 'O relógio de teste só existe no modo de desenvolvimento.')
    }
    clock.setOffset(offset)
    // O relógio andou: as repetições e os lembretes que venceram nesse intervalo saem agora.
    scheduler?.tick()
    return { offset }
  })

  // Repetição (REP). Configurar e remover zeram o envelhecimento do card (ENV-05).
  route(CHANNELS.recurrenceSave, saveRecurrenceInput, ({ cardId, rule }) =>
    done(() => recurrence.save(db, cardId, rule, now()))
  )
  route(CHANNELS.recurrenceRemove, cardIdInput, ({ cardId }) =>
    done(() => recurrence.remove(db, cardId, now()))
  )
  route(CHANNELS.recurrenceCreateAnyway, occurrenceIdInput, ({ occurrenceId }) =>
    cards.summaryOf(db, recurrence.createAnyway(db, occurrenceId, now()))
  )
  route(CHANNELS.recurrenceDismiss, occurrenceIdInput, ({ occurrenceId }) =>
    done(() => recurrence.dismiss(db, occurrenceId, now()))
  )

  // Lembretes perdidos com o app fechado (LEM-06) e o aviso da bandeja (P4).
  route(CHANNELS.remindersMissed, none, () => scheduler?.takeMissed() ?? [])
  route(CHANNELS.appHideToTray, none, () =>
    done(() => {
      settings.set(db, 'tray.noticeShown', true)
      hideToTray?.()
    })
  )

  route(CHANNELS.searchQuery, searchInput, ({ text }) => search(db, text))

  // Modelos (MOD).
  route(CHANNELS.templatesSetCard, setTemplateCardInput, ({ cardId, isTemplate }) =>
    done(() => templates.setCard(db, cardId, isTemplate, now()))
  )
  route(CHANNELS.templatesCreateCard, createCardFromTemplateInput, (input) =>
    templates.createCard(db, input, now())
  )
  route(CHANNELS.templatesListBoards, none, () => templates.listBoards(db))
  route(CHANNELS.templatesSetBoard, setTemplateBoardInput, ({ boardId, isTemplate }) =>
    done(() => templates.setBoard(db, boardId, isTemplate, now()))
  )
  route(CHANNELS.templatesCreateBoard, createBoardFromTemplateInput, (input) =>
    templates.createBoard(db, input, now())
  )

  return routes
}
