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
import type {
  CardDetail,
  CardIdInput,
  CardSummary,
  CopyCardInput,
  CreateCardInput,
  MatchingInput,
  MoveCardInput,
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
import type { CreateLabelInput, Label, LabelIdInput, UpdateLabelInput } from './labels'

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
  itemsDelete: 'items:delete'
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
}

// Monta window.mello a partir de uma função que entrega (canal, entrada) ao main. O preload passa
// o ipcRenderer.invoke; os testes da tela passam as rotas do main direto.
export function createApi(
  invoke: (channel: string, input?: unknown) => Promise<unknown>
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
      matching: call(CHANNELS.cardsMatching)
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
    }
  }
}
