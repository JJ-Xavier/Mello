// Editor de fundo do quadro (tela 6, Fundo.dc.html): a prévia ao vivo com o quadro em miniatura à
// esquerda e, à direita, as abas Imagem, Cor e Gradiente (FUN-01). A imagem chega por clique ou
// arrastando (FUN-02) e ganha o ajuste automático (FUN-04): foco, zoom, escurecer e desfoque, que
// podem ser refinados à mão (FUN-05), com o indicador de legibilidade (FUN-06). Nada muda no
// quadro até "Aplicar ao quadro"; Cancelar descarta (FUN-07).
import { useEffect, useId, useState, type DragEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router'
import type {
  BackgroundImage,
  BoardDetail,
  SetBackgroundInput
} from '../../../../shared/ipc/boards'
import type { PickedFile } from '../../../../shared/ipc/files'
import {
  BACKGROUND_DEFAULTS,
  BLUR_RANGE,
  BOARD_COLORS,
  BOARD_GRADIENTS,
  DEFAULT_BACKGROUND,
  DIM_RANGE,
  SCREEN_RATIO,
  visibleArea,
  ZOOM_RANGE,
  type BackgroundKind
} from '../../../../shared/rules/background'
import { isLegible, type BackgroundAnalysis } from '../../../../shared/rules/backgroundAuto'
import { BoardBackdrop, type BackdropBackground } from '../../components/BoardBackdrop'
import { Icon } from '../../components/Icon'
import ui from '../../components/ui.module.css'
import { api, ApiError, unwrap } from '../../lib/api'
import { cx } from '../../lib/cx'
import { useAction, useBoard } from '../../lib/queries'
import { queryKeys } from '../../lib/queryKeys'
import { analyzeImage } from '../../lib/sampleImage'
import styles from './BackgroundEditor.module.css'

// Quem abre o editor diz para onde voltar (o quadro ou o calendário do quadro).
export interface BackgroundLocationState {
  from?: string
}

const TABS: { kind: BackgroundKind; label: string }[] = [
  { kind: 'image', label: 'Imagem' },
  { kind: 'color', label: 'Cor' },
  { kind: 'gradient', label: 'Gradiente' }
]

const FOCUS_NAMES = [
  'superior esquerdo',
  'superior central',
  'superior direito',
  'meio esquerdo',
  'centro',
  'meio direito',
  'inferior esquerdo',
  'inferior central',
  'inferior direito'
]

// Onde a marca do foco fica na prévia (a do protótipo).
const MARK_X = ['18%', '50%', '82%']
const MARK_Y = ['22%', '50%', '78%']

type ImageDraft = Omit<BackgroundImage, 'name'> & { name: string | null }

interface Adjust {
  auto: boolean
  focus: number
  zoom: number
  dim: number
  blur: number
}

// "Retrato 1080 × 1920 → recortado para a tela (16:10)" (Fundo.dc.html).
function shapeText(width: number, height: number): string {
  const size = `${width} × ${height}`
  if (Math.abs(width / height - SCREEN_RATIO) < 0.01) return `${size}, na proporção da tela (16:10)`
  if (height > width) return `Retrato ${size} → recortado para a tela (16:10)`
  if (width > height) return `Paisagem ${size} → recortada para a tela (16:10)`
  return `Quadrada ${size} → recortada para a tela (16:10)`
}

function AutoTag() {
  return <span className={styles.autoTag}>Auto</span>
}

function Slider({
  label,
  value,
  unit,
  range,
  auto,
  onChange
}: {
  label: string
  value: number
  unit: string
  range: { min: number; max: number }
  auto: boolean
  onChange: (value: number) => void
}) {
  const id = useId()
  return (
    <div className={styles.control}>
      <div className={styles.controlHead}>
        <label className={styles.lab} htmlFor={id}>
          {label} · {value}
          {unit}
        </label>
        {auto && <AutoTag />}
      </div>
      <input
        id={id}
        type="range"
        className={styles.range}
        min={range.min}
        max={range.max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  )
}

// A imagem enviada: a miniatura com o recorte da tela, o nome e o tamanho.
function ImageCard({ image, adjust }: { image: ImageDraft; adjust: Adjust }) {
  const long = 96
  const [width, height] =
    image.width >= image.height
      ? [long, Math.round((long * image.height) / image.width)]
      : [Math.round((long * image.width) / image.height), long]
  const area = visibleArea(image.width, image.height, adjust.focus, adjust.zoom)
  return (
    <div className={styles.fileCard}>
      <div
        className={styles.fileThumb}
        style={{ width, height, backgroundImage: `url("${image.url}")` }}
        aria-hidden="true"
      >
        <span
          className={styles.crop}
          style={{
            left: `${area.left * 100}%`,
            top: `${area.top * 100}%`,
            width: `${area.width * 100}%`,
            height: `${area.height * 100}%`
          }}
        />
      </div>
      <div className={styles.fileInfo}>
        <span className={styles.fileName}>{image.name ?? 'Imagem do quadro'}</span>
        <span className={styles.fileMeta}>{shapeText(image.width, image.height)}</span>
        {adjust.auto ? (
          <span className={styles.fileAuto}>
            <Icon name="check" size={14} />
            Ajustado automaticamente
          </span>
        ) : (
          <span className={styles.fileMeta}>Ajustado à mão</span>
        )}
      </div>
    </div>
  )
}

function ImagePanel({
  image,
  adjust,
  analysis,
  uploading,
  error,
  onChoose,
  onDrop,
  onChange,
  onAuto
}: {
  image: ImageDraft | null
  adjust: Adjust
  analysis: BackgroundAnalysis | null
  uploading: boolean
  error: string
  onChoose: () => void
  onDrop: (files: File[]) => void
  onChange: (next: Partial<Adjust>) => void
  onAuto: (on: boolean) => void
}) {
  const focusId = useId()
  const [over, setOver] = useState(false)
  const legible = analysis ? isLegible(analysis.rgb, adjust.dim, adjust.blur) : null

  const drop = (event: DragEvent) => {
    event.preventDefault()
    setOver(false)
    const files = [...event.dataTransfer.files]
    if (files.length > 0) onDrop(files)
  }

  return (
    <div className={styles.panel}>
      <button
        type="button"
        className={cx(styles.drop, over && styles.dropOver)}
        disabled={uploading}
        onClick={onChoose}
        onDragOver={(event) => {
          event.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
      >
        <Icon name="upload" size={22} />
        {uploading ? 'Enviando…' : 'Enviar imagem'}
        <span className={styles.dropHint}>Arraste aqui ou clique · JPG, PNG, WEBP</span>
      </button>
      {error && (
        <p className={cx(ui.note, ui.danger)} role="alert">
          {error}
        </p>
      )}
      {image && (
        <>
          <ImageCard image={image} adjust={adjust} />
          <label className={styles.autoToggle}>
            <span className={styles.autoText}>
              <span className={styles.autoTitle}>Ajuste automático</span>
              <span className={styles.autoHint}>
                O Mello enquadra, aproxima e escurece para os cards ficarem legíveis
              </span>
            </span>
            <input
              type="checkbox"
              className={styles.autoCheck}
              checked={adjust.auto}
              onChange={(event) => onAuto(event.target.checked)}
            />
          </label>
          <div className={styles.controls}>
            <div className={styles.control}>
              <div className={styles.controlHead}>
                <p className={styles.lab} id={focusId}>
                  PONTO DE FOCO
                </p>
                {adjust.auto && <AutoTag />}
              </div>
              <div role="group" aria-labelledby={focusId} className={styles.focusGrid}>
                {FOCUS_NAMES.map((name, i) => (
                  <button
                    key={name}
                    type="button"
                    className={cx(styles.focusCell, adjust.focus === i && styles.focusOn)}
                    aria-label={`Foco ${name}`}
                    aria-pressed={adjust.focus === i}
                    onClick={() => onChange({ focus: i })}
                  />
                ))}
              </div>
            </div>
            <Slider
              label="ZOOM"
              unit="%"
              value={adjust.zoom}
              range={ZOOM_RANGE}
              auto={adjust.auto}
              onChange={(zoom) => onChange({ zoom })}
            />
            <Slider
              label="ESCURECER"
              unit="%"
              value={adjust.dim}
              range={DIM_RANGE}
              auto={adjust.auto}
              onChange={(dim) => onChange({ dim })}
            />
            <Slider
              label="DESFOQUE"
              unit=" px"
              value={adjust.blur}
              range={BLUR_RANGE}
              auto={adjust.auto}
              onChange={(blur) => onChange({ blur })}
            />
            {legible !== null && (
              <p
                className={cx(styles.legibility, legible ? styles.legible : styles.lowContrast)}
                role="status"
              >
                <Icon name="legible" />
                {legible
                  ? 'Cards legíveis sobre este fundo'
                  : 'Pouco contraste: aumente o escurecer ou o desfoque'}
              </p>
            )}
            {!adjust.auto && (
              <button
                type="button"
                className={styles.restore}
                disabled={!analysis}
                onClick={() => onAuto(true)}
              >
                Restaurar automático
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// A prévia: o fundo escolhido com o quadro em miniatura (a barra, as listas e os cards de verdade).
function Preview({
  board,
  background,
  focus
}: {
  board: BoardDetail
  background: BackdropBackground
  focus: number | null
}) {
  return (
    <div
      className={styles.preview}
      role="img"
      aria-label={`Prévia do fundo no quadro ${board.title}`}
    >
      <BoardBackdrop background={background} />
      <div className={styles.miniBar}>{board.title}</div>
      <div className={styles.miniLists}>
        {board.lists.slice(0, 4).map((list) => (
          <div key={list.id} className={styles.miniList}>
            <div className={styles.miniTitle}>{list.title}</div>
            {list.cards.slice(0, 3).map((card) => (
              <div key={card.id} className={styles.miniCard} />
            ))}
          </div>
        ))}
      </div>
      {focus !== null && (
        <span
          className={styles.focusMark}
          style={{ left: MARK_X[focus % 3], top: MARK_Y[Math.floor(focus / 3)] }}
        />
      )}
    </div>
  )
}

function Editor({ board }: { board: BoardDetail }) {
  const navigate = useNavigate()
  const location = useLocation()
  const run = useAction()
  const back = (location.state as BackgroundLocationState | null)?.from ?? `/boards/${board.id}`
  const current = board.background

  const [tab, setTab] = useState<BackgroundKind>(current.kind)
  const [color, setColor] = useState(
    current.kind === 'color' ? current.value : BOARD_COLORS[0]!.hex
  )
  const [gradient, setGradient] = useState(
    current.kind === 'gradient' ? current.value : DEFAULT_BACKGROUND.value
  )
  const [image, setImage] = useState<ImageDraft | null>(
    current.kind === 'image' && current.url
      ? {
          fileId: current.value,
          url: current.url,
          width: current.width ?? 0,
          height: current.height ?? 0,
          name: null
        }
      : null
  )
  const [adjust, setAdjust] = useState<Adjust>(() =>
    current.kind === 'image'
      ? {
          auto: current.auto,
          focus: current.focus,
          zoom: current.zoom,
          dim: current.dim,
          blur: current.blur
        }
      : BACKGROUND_DEFAULTS
  )
  const [analysis, setAnalysis] = useState<BackgroundAnalysis | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  // A imagem que o quadro já tem: a análise serve ao indicador e ao "Restaurar automático"; os
  // ajustes continuam os salvos.
  const savedUrl = current.kind === 'image' ? current.url : null
  useEffect(() => {
    if (!savedUrl) return
    let alive = true
    analyzeImage(savedUrl).then(
      (result) => alive && setAnalysis(result),
      () => alive && setError('Não foi possível ler a imagem do quadro.')
    )
    return () => {
      alive = false
    }
  }, [savedUrl])

  // FUN-04: a imagem nova chega já com o ajuste automático.
  const upload = async (choose: () => Promise<PickedFile[]>) => {
    setError('')
    try {
      const [first] = await choose()
      if (!first) return
      setUploading(true)
      const saved = await unwrap(
        api().boards.uploadBackground({ boardId: board.id, token: first.token })
      )
      const result = await analyzeImage(saved.url)
      setImage(saved)
      setAnalysis(result)
      setAdjust({ auto: true, ...result.auto })
      setTab('image')
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure.message
          : 'Não foi possível ler a imagem. Tente outra.'
      )
    } finally {
      setUploading(false)
    }
  }

  // FUN-05: mexer num ajuste desliga o automático; ligar de novo (ou "Restaurar automático")
  // volta os valores calculados.
  const change = (next: Partial<Adjust>) => setAdjust((was) => ({ ...was, ...next, auto: false }))
  const setAuto = (on: boolean) => {
    if (!on) return setAdjust((was) => ({ ...was, auto: false }))
    if (analysis) setAdjust({ auto: true, ...analysis.auto })
  }

  const { focus, zoom, dim, blur } = adjust
  const preview: BackdropBackground =
    tab === 'image'
      ? {
          kind: 'image',
          value: image?.fileId ?? '',
          url: image?.url ?? null,
          focus,
          zoom,
          dim,
          blur
        }
      : { kind: tab, value: tab === 'color' ? color : gradient, url: null, ...BACKGROUND_DEFAULTS }
  const canApply = tab !== 'image' || (image !== null && analysis !== null)

  const apply = async () => {
    const background: SetBackgroundInput['background'] =
      tab === 'image'
        ? { kind: 'image', value: image!.fileId, ...adjust, avgColor: analysis!.avgColor }
        : tab === 'color'
          ? { kind: 'color', value: color }
          : { kind: 'gradient', value: gradient }
    const applied = await run(async () => {
      await unwrap(api().boards.setBackground({ boardId: board.id, background }))
      return true
    }, [queryKeys.board(board.id), queryKeys.boards])
    if (applied) navigate(back)
  }

  return (
    <div className={styles.screen}>
      <div className={styles.stage}>
        <div className={styles.stageBar}>
          <Link to={back} className={styles.back}>
            <Icon name="chevronLeft" />
            Voltar ao quadro
          </Link>
          <span className={styles.live}>Pré-visualização em tempo real</span>
        </div>
        <Preview
          board={board}
          background={preview}
          focus={tab === 'image' && image ? focus : null}
        />
      </div>

      <aside aria-label="Editor de fundo" className={styles.aside}>
        <div className={styles.head}>
          <div className={styles.headText}>
            <h1 className={styles.title}>Fundo do quadro</h1>
            <p className={styles.subtitle}>{board.title} · cada quadro tem o seu fundo</p>
          </div>
          <Link to={back} className={styles.close} aria-label="Fechar">
            <Icon name="close" size={20} />
          </Link>
        </div>

        <div role="tablist" aria-label="Tipo de fundo" className={styles.tabs}>
          {TABS.map((t) => (
            <button
              key={t.kind}
              type="button"
              role="tab"
              aria-selected={tab === t.kind}
              className={cx(styles.tab, tab === t.kind && styles.tabOn)}
              onClick={() => setTab(t.kind)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className={styles.body} role="tabpanel">
          {tab === 'image' && (
            <ImagePanel
              image={image}
              adjust={adjust}
              analysis={analysis}
              uploading={uploading}
              error={error}
              onChoose={() => void upload(() => unwrap(api().files.pick({ imagesOnly: true })))}
              onDrop={(files) => void upload(() => unwrap(api().files.dropped(files)))}
              onChange={change}
              onAuto={setAuto}
            />
          )}
          {tab === 'color' && (
            <div className={styles.colors}>
              {BOARD_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  className={cx(styles.swatch, color === c.hex && styles.swatchOn)}
                  style={{ background: c.hex }}
                  aria-label={c.name}
                  aria-pressed={color === c.hex}
                  onClick={() => setColor(c.hex)}
                />
              ))}
            </div>
          )}
          {tab === 'gradient' && (
            <div className={styles.gradients}>
              {BOARD_GRADIENTS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={cx(
                    styles.swatch,
                    styles.gradient,
                    gradient === g.id && styles.swatchOn
                  )}
                  style={{ background: g.css }}
                  aria-pressed={gradient === g.id}
                  onClick={() => setGradient(g.id)}
                >
                  {g.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={styles.foot}>
          <Link to={back} className={styles.cancel}>
            Cancelar
          </Link>
          <button
            type="button"
            className={cx(ui.pri, styles.apply)}
            disabled={!canApply}
            onClick={() => void apply()}
          >
            Aplicar ao quadro
          </button>
        </div>
      </aside>
    </div>
  )
}

export function BackgroundEditor() {
  const { boardId = '' } = useParams()
  const board = useBoard(boardId)
  if (board.error instanceof ApiError && board.error.code === 'NOT_FOUND') {
    return <Navigate to="/" replace />
  }
  if (!board.data) return null
  return <Editor key={board.data.id} board={board.data} />
}
