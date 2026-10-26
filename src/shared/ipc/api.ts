// Contrato entre a tela e o main: os nomes dos canais e a forma de window.mello.
// O preload implementa MelloApi; a tela só enxerga este tipo.
import type { Result } from '../result'
import type {
  ArchivedItems,
  BoardDetail,
  BoardIdInput,
  BoardSummary,
  CreateBoardInput,
  CreateListInput,
  ListIdInput,
  ListSummary,
  MoveBoardInput,
  MoveListInput,
  MoveListToBoardInput,
  SortListInput,
  UpdateBoardInput,
  UpdateListInput
} from './boards'
import type { CalendarAddCardInput, CalendarMonth, CalendarMonthInput } from './calendar'
import type {
  CardDetail,
  CardIdInput,
  CardSummary,
  CopyCardInput,
  CreateCardInput,
  MatchingInput,
  MoveCardInput,
  SetCoverInput,
  SetLabelsInput,
  UpdateCardInput
} from './cards'
import type {
  Checklist,
  ChecklistIdInput,
  ChecklistItem,
  CreateChecklistInput,
  CreateItemInput,
  ItemIdInput,
  MoveChecklistInput,
  MoveItemInput,
  ToggleItemInput,
  UpdateChecklistInput,
  UpdateItemInput
} from './checklists'
import type {
  AddAttachmentsInput,
  AttachmentIdInput,
  OpenResult,
  PickedFile,
  PickFilesInput,
  UploadCoverInput
} from './files'
import type { DevClock, SetClockInput } from './dev'
import type { CreateLabelInput, Label, LabelIdInput, UpdateLabelInput } from './labels'
import type { Settings } from './settings'

export const CHANNELS = {
  appInfo: 'app:info',
  boardsList: 'boards:list',
  boardsListClosed: 'boards:listClosed',
  boardsGet: 'boards:get',
  boardsCreate: 'boards:create',
  boardsUpdate: 'boards:update',
  boardsMove: 'boards:move',
  boardsClose: 'boards:close',
  boardsReopen: 'boards:reopen',
  boardsDelete: 'boards:delete',
  boardsArchived: 'boards:archived',
  listsCreate: 'lists:create',
  listsUpdate: 'lists:update',
  listsMove: 'lists:move',
  listsCopy: 'lists:copy',
  listsMoveToBoard: 'lists:moveToBoard',
  listsSort: 'lists:sort',
  listsArchive: 'lists:archive',
  listsArchiveCards: 'lists:archiveCards',
  listsRestore: 'lists:restore',
  cardsGet: 'cards:get',
  cardsCreate: 'cards:create',
  cardsUpdate: 'cards:update',
  cardsMove: 'cards:move',
  cardsCopy: 'cards:copy',
  cardsSetLabels: 'cards:setLabels',
  cardsArchive: 'cards:archive',
  cardsRestore: 'cards:restore',
  cardsDelete: 'cards:delete',
  cardsMatching: 'cards:matching',
  cardsSetCover: 'cards:setCover',
  cardsUploadCover: 'cards:uploadCover',
  filesPick: 'files:pick',
  filesDropped: 'files:dropped',
  attachmentsAdd: 'attachments:add',
  attachmentsOpen: 'attachments:open',
  attachmentsDelete: 'attachments:delete',
  labelsList: 'labels:list',
  labelsCreate: 'labels:create',
  labelsUpdate: 'labels:update',
  labelsDelete: 'labels:delete',
  checklistsCreate: 'checklists:create',
  checklistsUpdate: 'checklists:update',
  checklistsMove: 'checklists:move',
  checklistsDelete: 'checklists:delete',
  itemsCreate: 'items:create',
  itemsUpdate: 'items:update',
  itemsToggle: 'items:toggle',
  itemsMove: 'items:move',
  itemsDelete: 'items:delete',
  calendarMonth: 'calendar:month',
  calendarAddCard: 'calendar:addCard',
  settingsGet: 'settings:get',
  devClock: 'dev:clock',
  devSetClock: 'dev:setClock'
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
  boards: {
    list(): Promise<Result<BoardSummary[]>>
    listClosed(): Promise<Result<BoardSummary[]>>
    get(input: BoardIdInput): Promise<Result<BoardDetail>>
    create(input: CreateBoardInput): Promise<Result<BoardSummary>>
    update(input: UpdateBoardInput): Promise<Result<BoardSummary>>
    move(input: MoveBoardInput): Promise<Result<null>>
    close(input: BoardIdInput): Promise<Result<null>>
    reopen(input: BoardIdInput): Promise<Result<null>>
    delete(input: BoardIdInput): Promise<Result<null>>
    archived(input: BoardIdInput): Promise<Result<ArchivedItems>>
  }
  lists: {
    create(input: CreateListInput): Promise<Result<ListSummary>>
    update(input: UpdateListInput): Promise<Result<ListSummary>>
    move(input: MoveListInput): Promise<Result<null>>
    copy(input: ListIdInput): Promise<Result<ListSummary>>
    moveToBoard(input: MoveListToBoardInput): Promise<Result<null>>
    sort(input: SortListInput): Promise<Result<null>>
    archive(input: ListIdInput): Promise<Result<null>>
    archiveCards(input: ListIdInput): Promise<Result<number>>
    restore(input: ListIdInput): Promise<Result<null>>
  }
  cards: {
    get(input: CardIdInput): Promise<Result<CardDetail>>
    create(input: CreateCardInput): Promise<Result<CardSummary>>
    update(input: UpdateCardInput): Promise<Result<null>>
    move(input: MoveCardInput): Promise<Result<null>>
    copy(input: CopyCardInput): Promise<Result<CardSummary>>
    setLabels(input: SetLabelsInput): Promise<Result<null>>
    archive(input: CardIdInput): Promise<Result<null>>
    restore(input: CardIdInput): Promise<Result<null>>
    delete(input: CardIdInput): Promise<Result<null>>
    matching(input: MatchingInput): Promise<Result<string[]>>
    setCover(input: SetCoverInput): Promise<Result<null>>
    uploadCover(input: UploadCoverInput): Promise<Result<null>>
  }
  files: {
    // Abre a janela "Abrir" do Windows. Cancelar devolve uma lista vazia.
    pick(input: PickFilesInput): Promise<Result<PickedFile[]>>
    // Arquivos soltos no modal. Pastas ficam de fora.
    dropped(files: File[]): Promise<Result<PickedFile[]>>
  }
  attachments: {
    add(input: AddAttachmentsInput): Promise<Result<null>>
    open(input: AttachmentIdInput): Promise<Result<OpenResult>>
    delete(input: AttachmentIdInput): Promise<Result<null>>
  }
  labels: {
    list(input: BoardIdInput): Promise<Result<Label[]>>
    create(input: CreateLabelInput): Promise<Result<Label>>
    update(input: UpdateLabelInput): Promise<Result<Label>>
    delete(input: LabelIdInput): Promise<Result<null>>
  }
  checklists: {
    create(input: CreateChecklistInput): Promise<Result<Checklist>>
    update(input: UpdateChecklistInput): Promise<Result<null>>
    move(input: MoveChecklistInput): Promise<Result<null>>
    delete(input: ChecklistIdInput): Promise<Result<null>>
  }
  items: {
    create(input: CreateItemInput): Promise<Result<ChecklistItem>>
    update(input: UpdateItemInput): Promise<Result<null>>
    toggle(input: ToggleItemInput): Promise<Result<null>>
    move(input: MoveItemInput): Promise<Result<null>>
    delete(input: ItemIdInput): Promise<Result<null>>
  }
  calendar: {
    month(input: CalendarMonthInput): Promise<Result<CalendarMonth>>
    addCard(input: CalendarAddCardInput): Promise<Result<CardSummary>>
  }
  settings: {
    get(): Promise<Result<Settings>>
  }
  // Relógio de teste: só muda no modo de desenvolvimento.
  dev: {
    clock(): Promise<Result<DevClock>>
    setClock(input: SetClockInput): Promise<Result<DevClock>>
  }
}

// Monta window.mello a partir de uma função que entrega (canal, entrada) ao main. O preload passa
// o ipcRenderer.invoke; os testes da tela passam as rotas do main direto.
// pathOf dá o caminho de um arquivo solto no modal (no preload, webUtils.getPathForFile). Ele só
// existe para arquivos de verdade vindos do Windows: um File criado pela tela não tem caminho, e o
// caminho nunca volta para a tela.
export function createApi(
  invoke: (channel: string, input?: unknown) => Promise<unknown>,
  pathOf: (file: File) => string = () => ''
): MelloApi {
  const call =
    <T>(channel: string) =>
    (input?: unknown) =>
      invoke(channel, input) as Promise<Result<T>>
  return {
    app: {
      info: call(CHANNELS.appInfo)
    },
    boards: {
      list: call(CHANNELS.boardsList),
      listClosed: call(CHANNELS.boardsListClosed),
      get: call(CHANNELS.boardsGet),
      create: call(CHANNELS.boardsCreate),
      update: call(CHANNELS.boardsUpdate),
      move: call(CHANNELS.boardsMove),
      close: call(CHANNELS.boardsClose),
      reopen: call(CHANNELS.boardsReopen),
      delete: call(CHANNELS.boardsDelete),
      archived: call(CHANNELS.boardsArchived)
    },
    lists: {
      create: call(CHANNELS.listsCreate),
      update: call(CHANNELS.listsUpdate),
      move: call(CHANNELS.listsMove),
      copy: call(CHANNELS.listsCopy),
      moveToBoard: call(CHANNELS.listsMoveToBoard),
      sort: call(CHANNELS.listsSort),
      archive: call(CHANNELS.listsArchive),
      archiveCards: call(CHANNELS.listsArchiveCards),
      restore: call(CHANNELS.listsRestore)
    },
    cards: {
      get: call(CHANNELS.cardsGet),
      create: call(CHANNELS.cardsCreate),
      update: call(CHANNELS.cardsUpdate),
      move: call(CHANNELS.cardsMove),
      copy: call(CHANNELS.cardsCopy),
      setLabels: call(CHANNELS.cardsSetLabels),
      archive: call(CHANNELS.cardsArchive),
      restore: call(CHANNELS.cardsRestore),
      delete: call(CHANNELS.cardsDelete),
      matching: call(CHANNELS.cardsMatching),
      setCover: call(CHANNELS.cardsSetCover),
      uploadCover: call(CHANNELS.cardsUploadCover)
    },
    files: {
      pick: call(CHANNELS.filesPick),
      dropped: (files) =>
        call<PickedFile[]>(CHANNELS.filesDropped)({
          paths: files.map((file) => pathOf(file)).filter((path) => path !== '')
        })
    },
    attachments: {
      add: call(CHANNELS.attachmentsAdd),
      open: call(CHANNELS.attachmentsOpen),
      delete: call(CHANNELS.attachmentsDelete)
    },
    labels: {
      list: call(CHANNELS.labelsList),
      create: call(CHANNELS.labelsCreate),
      update: call(CHANNELS.labelsUpdate),
      delete: call(CHANNELS.labelsDelete)
    },
    checklists: {
      create: call(CHANNELS.checklistsCreate),
      update: call(CHANNELS.checklistsUpdate),
      move: call(CHANNELS.checklistsMove),
      delete: call(CHANNELS.checklistsDelete)
    },
    items: {
      create: call(CHANNELS.itemsCreate),
      update: call(CHANNELS.itemsUpdate),
      toggle: call(CHANNELS.itemsToggle),
      move: call(CHANNELS.itemsMove),
      delete: call(CHANNELS.itemsDelete)
    },
    calendar: {
      month: call(CHANNELS.calendarMonth),
      addCard: call(CHANNELS.calendarAddCard)
    },
    settings: {
      get: call(CHANNELS.settingsGet)
    },
    dev: {
      clock: call(CHANNELS.devClock),
      setClock: call(CHANNELS.devSetClock)
    }
  }
}
