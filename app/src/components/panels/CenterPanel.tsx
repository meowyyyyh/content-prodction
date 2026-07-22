import { useRef, useCallback, useState, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyMedia, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import type { ModuleResult, GenerateStatus, ProductInput, ClassifiedImage } from '@/types'
import { exportToDisk } from '@/utils/export-files'

interface CenterPanelProps {
  status: GenerateStatus; modules: ModuleResult[]; mandatoryKeys: string[]
  onEdit: (moduleKey: string, content: string) => void; onReorder: (newOrder: string[]) => void
  onAddBlock: () => void; onAddVideo: () => void; onDeleteBlock: (moduleKey: string) => void
  showToast: (msg: string, type?: 'info' | 'success' | 'error') => void
  triggerExpandHint?: number
  onClearAll?: () => void
  input?: ProductInput
  classifiedImages?: ClassifiedImage[]
  fileMapRef?: React.MutableRefObject<Map<string, { file: File; preview: string }>>
  onExportCorpus?: () => void
}

const MODULE_LABELS: Record<string, string> = { hook: '首屏钩子', price: '价格福利', taste: '口感体验', trust: '基础信任', aftercare: '物流售后', tips: '储存贴士', cta: '行动召唤', ingredient: '成分科普', origin: '原料溯源', brand: '品牌背书', scene: '场景共情', feedback: '用户反馈', faq: '常见问题' }
function getLabel(key: string): string { if (key.startsWith('__video_')) return '视频'; return MODULE_LABELS[key] || '自定义文本' }
function isVideoModule(key: string): boolean { return key.startsWith('__video_') }

/** 估算模块内容的行数以匹配骨架屏 */
function estimateLines(html: string): number {
  if (!html || html === '<br>') return 2
  const plain = html.replace(/<[^>]+>/g, '').trim()
  if (!plain) return 2
  const segments = plain.split(/\n|<br\s*\/?>/i)
  let lines = 0
  for (const seg of segments) {
    const text = seg.trim()
    if (!text) { lines += 1; continue } // 空行也占一行
    // 中文字符约 16px，max-w-2xl=672px，每行约 40 字
    lines += Math.max(1, Math.ceil(text.length / 40))
  }
  return Math.min(Math.max(lines, 2), 10)
}

function Tooltip({ children, text }: { children: React.ReactNode; text: string }) { const [state, setState] = useState<'hide' | 'show' | 'exit'>('hide'); const [pos, setPos] = useState({ x: 0, y: 0 }); const ref = useRef<HTMLDivElement>(null); const timerRef = useRef<number | null>(null); const showTip = () => { if (timerRef.current) clearTimeout(timerRef.current); if (ref.current) { const r = ref.current.getBoundingClientRect(); setPos({ x: r.left + r.width / 2, y: r.top }) }; setState('show') }; const hideTip = () => { setState('exit'); timerRef.current = window.setTimeout(() => setState('hide'), 250) }; const visible = state === 'show' || state === 'exit'; return (<div ref={ref} className="shrink-0" onMouseEnter={showTip} onMouseLeave={hideTip}>{children}{visible && ReactDOM.createPortal(<div className="fixed pointer-events-none" style={{ left: pos.x, top: pos.y - 6, transform: 'translate(-50%, -100%)', zIndex: 99999, opacity: state === 'show' ? 1 : 0, transition: 'opacity 250ms ease-out, transform 250ms ease-out', transformOrigin: 'bottom center' }}><div className={`bg-white text-gray-700 text-[11px] rounded-lg px-2.5 py-1.5 shadow-md border border-gray-200 whitespace-nowrap ${state === 'show' ? 'scale-100 translate-y-0' : 'scale-95 translate-y-1'}`} style={{ transition: 'transform 250ms ease-out' }}>{text}</div><div className="absolute top-full left-1/2 -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-white" style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.06))' }} /></div>, document.body)}</div>) }

/** 压缩base64图片到目标宽度（浏览器canvas） */
function compressImageDataUrl(base64: string, mimeType: string, maxW: number): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width)
      if (scale >= 1) { resolve({ base64, mimeType }); return }
      const w = Math.round(img.width * scale); const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')!; ctx.drawImage(img, 0, 0, w, h)
      resolve({ base64: canvas.toDataURL(mimeType, 0.8).split(',')[1], mimeType })
    }
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = `data:${mimeType};base64,${base64}`
  })
}

// 骨架屏宽度池，模拟真实文本的错落感
const SKEL_WIDTHS = ['w-full', 'w-11/12', 'w-4/5', 'w-3/4', 'w-5/6', 'w-2/3', 'w-7/8', 'w-full', 'w-3/5', 'w-4/6']

/** 规范化图片HTML：将折叠的.img-expand展开为可见状态，消除rAF直接操作DOM造成的state/DOM不一致 */
function expandImagesInHtml(html: string): string {
  if (!html || !html.includes('img-expand')) return html
  const div = document.createElement('div')
  div.innerHTML = html
  div.querySelectorAll('.img-expand').forEach((el: Element) => {
    const s = (el as HTMLElement).style
    s.maxHeight = 'none'
    s.overflow = 'visible'
    s.opacity = '1'
  })
  return div.innerHTML
}

/** 自动结构化排版：兜底规范化换行 */
function autoStructure(html: string): string {
  return html
    .replace(/(?:^|<br\s*\/?>)\s*(?:["'']?\s*(?:【[^】]*】|\[[^\]]*\]|---[^-]*---|\[文案\]|文案)\s*["'']?|===\w*===)\s*(?:<br\s*\/?>)?/gi, '<br>').replace(/===\w*===/g, '').replace(/^\[|\]$|^\]|\[$/gm, '').replace(/\[文案\]/gi, '').replace(/[""][文案][""]/g, '').replace(/[''][文案]['']/g, '') // 全文扫标题、分隔符、格式标记、首尾孤立括号
    .replace(/\[\]/g, '')
    .replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
    .replace(/^(<br\s*\/?>\s*)+/i, '')
    .replace(/(\s*<br\s*\/?>\s*)+$/i, '')
}

/** 打字机效果：逐字显示文案，约3秒完成，完成后自动结构化排版 */
function typewrite(finalContents: Record<string, string>, imageSkeletons: Record<string, string>, onEdit: (key: string, content: string) => void, onDone: () => void, stopRef: { current: (() => void) | null }, opts?: { onFirstFrame?: () => void; finalImages?: Record<string, string> }) {
  const keys = Object.keys(finalContents)
  if (keys.length === 0) { onDone(); return }
  const totalChars = keys.reduce((sum, k) => sum + finalContents[k].length, 0); const DURATION = Math.min(6000, Math.max(800, totalChars * 15)); const start = Date.now(); let stopped = false; let firstFrame = true
  stopRef.current = () => { stopped = true }
  const finalImgs = opts?.finalImages || {}
  const tick = () => {
    if (stopped) return
    const progress = Math.min(1, (Date.now() - start) / DURATION)
    let allDone = true
    for (const k of keys) {
      const full = finalContents[k]; const n = Math.max(1, Math.floor(full.length * progress))
      if (n < full.length) allDone = false
      onEdit(k, (imageSkeletons[k] || '') + full.slice(0, n))
    }
    if (firstFrame) { firstFrame = false; opts?.onFirstFrame?.() }
    if (allDone) { keys.forEach(k => onEdit(k, (finalImgs[k] || '') + autoStructure(finalContents[k]))); stopRef.current = null; onDone() }
    else { const id = window.setTimeout(tick, 33); if (stopRef.current) { const orig = stopRef.current; stopRef.current = () => { stopped = true; clearTimeout(id); orig?.() } } }
  }
  const id = window.setTimeout(tick, 33); stopRef.current = () => { stopped = true; clearTimeout(id); stopRef.current = null }
}

type HistoryEntry = { type: 'content'; key: string; content: string } | { type: 'order'; order: string[] } | { type: 'batch'; modules: Record<string, string> }
let undoStack: HistoryEntry[] = []; let redoStack: HistoryEntry[] = []; const MAX_HISTORY = 100

export function CenterPanel({ status, modules, mandatoryKeys, onEdit, onReorder, onAddBlock, onAddVideo, onDeleteBlock, showToast, triggerExpandHint, onClearAll, input, classifiedImages, fileMapRef, onExportCorpus }: CenterPanelProps) {
  const getModule = (key: string) => modules.find(m => m.moduleKey === key)
  const isIdle = status === 'idle'; const isBlocked = status === 'blocked'
  // Smooth pointer-event drag-and-drop
  const [isDragging, setIsDragging] = useState(false)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const overRef = useRef<number>(-1)
  const dragRef = useRef<{ sourceIndex: number; offsetY: number; srcHeight: number; srcTop: number; mouseStartY: number; ghost: HTMLDivElement | null }>({ sourceIndex: -1, offsetY: 0, srcHeight: 0, srcTop: 0, mouseStartY: 0, ghost: null })
  const moduleElRefs = useRef<(HTMLDivElement | null)[]>([])
  const getDragStyles = (index: number): React.CSSProperties => {
    if (!isDragging) return { transition: 'transform 0.25s cubic-bezier(0.2,0,0,1), opacity 0.25s ease' }
    const { sourceIndex } = dragRef.current
    if (index === sourceIndex) return { opacity: 0.25, transform: 'scale(0.98)', transition: 'transform 0.25s cubic-bezier(0.2,0,0,1), opacity 0.25s ease' }
    const over = dragOverIdx
    if (over === null || over === sourceIndex) return { transition: 'transform 0.25s cubic-bezier(0.2,0,0,1), opacity 0.25s ease' }
    const srcH = dragRef.current.srcHeight + 32
    if (sourceIndex < over && index > sourceIndex && index <= over) return { transform: `translateY(-${srcH}px)`, transition: 'transform 0.25s cubic-bezier(0.2,0,0,1), opacity 0.25s ease' }
    if (sourceIndex > over && index >= over && index < sourceIndex) return { transform: `translateY(${srcH}px)`, transition: 'transform 0.25s cubic-bezier(0.2,0,0,1), opacity 0.25s ease' }
    return { transition: 'transform 0.25s cubic-bezier(0.2,0,0,1), opacity 0.25s ease' }
  }
  const editorRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const moduleHeightsRef = useRef<Record<string, number>>({}) // 骨架屏时保持原模块高度
  const focusedKeyRef = useRef<string | null>(null); const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const pendingActionKeyRef = useRef<string | null>(null) // 工具栏操作前暂存当前聚焦模块
  const composingRef = useRef(false)
  const lastSavedRef = useRef<Record<string, string>>({})
  const savePointRef = useRef<Record<string, string>>({})
  const [chatInput, setChatInput] = useState(''); const [chatLoading, setChatLoading] = useState(false); const chatLoadingRef = useRef(false)
  const chatRef = useRef<HTMLTextAreaElement>(null); const [chatFocused, setChatFocused] = useState(false)
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([])
  const [optimizingKeys, setOptimizingKeys] = useState<Set<string>>(new Set())
  const [typewritingKeys, setTypewritingKeys] = useState<Set<string>>(new Set()) // 打字中，保持 min-height
  const abortRef = useRef<AbortController | null>(null); const snapshotRef = useRef<Record<string, string>>({}); const typewriteTimerRef = useRef<number | null>(null); const activeInstructionRef = useRef<string>('')
  const savedRangeRef = useRef<Range | null>(null) // 保存光标位置，用于图片插入定位
  const imageClipboardRef = useRef<{ src: string; alt: string } | null>(null)
  // 图片悬浮工具栏
  const hoveredImageRef = useRef<HTMLImageElement | null>(null)
  const toolbarTimerRef = useRef<number | null>(null)
  const [hoveredImagePos, setHoveredImagePos] = useState<{ left: number; top: number; width: number; height: number; key: string } | null>(null)
  const selectedImageRef = useRef<HTMLImageElement | null>(null)
  const [selectedImageKey, setSelectedImageKey] = useState<string | null>(null)
  // 视频文件映射: moduleKey → File + objectUrl，用于预览和导出
  const videoFilesRef = useRef<Map<string, { file: File; objectUrl: string }>>(new Map())
  // 触发视频文件选择
  const triggerVideoUpload = useCallback((moduleKey: string) => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = 'video/*'
    input.onchange = () => { const f = input.files?.[0]; if (!f) return; const old = videoFilesRef.current.get(moduleKey); if (old) URL.revokeObjectURL(old.objectUrl); const objectUrl = URL.createObjectURL(f); videoFilesRef.current.set(moduleKey, { file: f, objectUrl }); onEdit(moduleKey, JSON.stringify({ type: 'video', name: f.name, size: f.size })); showToast('视频已上传', 'success') }
    input.click()
  }, [onEdit, showToast])
  // 清理视频 objectUrl
  useEffect(() => () => { videoFilesRef.current.forEach(v => URL.revokeObjectURL(v.objectUrl)) }, [])

  useEffect(() => { chatLoadingRef.current = chatLoading }, [chatLoading])
  useEffect(() => { if (triggerExpandHint && triggerExpandHint > 0 && !localStorage.getItem('expand_hint_shown')) { showToast('💡 生成的文字过少了？请尝试点击「📝 扩充文案」试试', 'info'); localStorage.setItem('expand_hint_shown', '1') } }, [triggerExpandHint])
  const suppressInputRef = useRef(false)
  useEffect(() => { if (composingRef.current) return; modules.forEach(mod => { const el = editorRefs.current[mod.moduleKey]; if (!el || !mod.content) return; if (lastSavedRef.current[mod.moduleKey] === mod.content) return; lastSavedRef.current[mod.moduleKey] = mod.content; suppressInputRef.current = true; el.focus(); document.execCommand("selectAll"); document.execCommand("insertHTML", false, mod.content); suppressInputRef.current = false }) }, [modules])

  const handleUndo = useCallback(() => { if (undoStack.length === 0) return; if (chatLoading) { if (abortRef.current) { abortRef.current.abort(); abortRef.current = null } if (typewriteTimerRef.current) { typewriteTimerRef.current(); typewriteTimerRef.current = null } snapshotRef.current = {}; setChatLoading(false); setOptimizingKeys(new Set()); setTypewritingKeys(new Set()) } const entry = undoStack.pop()!; console.log('[UNDO-DEBUG] 撤销弹出', { type: entry.type, keys: entry.type==='batch' ? Object.keys(entry.modules) : (entry.type==='content' ? [entry.key] : ['order']), stackRemaining: undoStack.length }); if (entry.type === 'batch') { const cur: Record<string, string> = {}; for (const k of Object.keys(entry.modules)) { const mod = getModule(k); if (mod) cur[k] = mod.content || '' } redoStack.push({ type: 'batch', modules: cur }); for (const [k, v] of Object.entries(entry.modules)) { delete lastSavedRef.current[k]; onEdit(k, expandImagesInHtml(v)) } console.log('[UNDO-DEBUG] batch撤销完成，redoStack:', redoStack.length) } else if (entry.type === 'content') { const mod = getModule(entry.key); const current = mod?.content || ''; redoStack.push({ type: 'content', key: entry.key, content: current }); delete lastSavedRef.current[entry.key]; onEdit(entry.key, expandImagesInHtml(entry.content)); console.log('[UNDO-DEBUG] content撤销完成 key:', entry.key) } else { redoStack.push({ type: 'order', order: [...mandatoryKeys] }); onReorder(entry.order) } }, [chatLoading, mandatoryKeys, getModule, onEdit, onReorder])
  const handleRedo = useCallback(() => { if (redoStack.length === 0) return; const entry = redoStack.pop()!; console.log('[UNDO-DEBUG] 重做弹出', { type: entry.type, keys: entry.type==='batch' ? Object.keys(entry.modules) : (entry.type==='content' ? [entry.key] : ['order']), stackRemaining: redoStack.length }); if (entry.type === 'batch') { const cur: Record<string, string> = {}; for (const k of Object.keys(entry.modules)) { const mod = getModule(k); if (mod) cur[k] = mod.content || '' } undoStack.push({ type: 'batch', modules: cur }); for (const [k, v] of Object.entries(entry.modules)) { delete lastSavedRef.current[k]; onEdit(k, expandImagesInHtml(v)) } console.log('[UNDO-DEBUG] batch撤销完成，redoStack:', redoStack.length) } else if (entry.type === 'content') { const mod = getModule(entry.key); const current = mod?.content || ''; undoStack.push({ type: 'content', key: entry.key, content: current }); delete lastSavedRef.current[entry.key]; onEdit(entry.key, expandImagesInHtml(entry.content)); console.log('[UNDO-DEBUG] content重做完成 key:', entry.key) } else { undoStack.push({ type: 'order', order: [...mandatoryKeys] }); onReorder(entry.order) } }, [mandatoryKeys, getModule, onEdit, onReorder])
  const pushContentHistory = useCallback((key: string, oldContent: string) => { if (undoStack.length > 0) { const last = undoStack[undoStack.length - 1]; if (last.type === 'content' && last.key === key && last.content === oldContent) return } undoStack.push({ type: 'content', key, content: oldContent }); redoStack = []; if (undoStack.length > MAX_HISTORY) undoStack.shift() }, [])
  const handleEditorInput = useCallback((key: string) => { if (suppressInputRef.current || composingRef.current) return; const el = editorRefs.current[key]; if (!el) return; const newContent = el.innerHTML; const mod = getModule(key); const oldContent = mod?.content || ''; if (newContent !== oldContent) { pushContentHistory(key, oldContent); lastSavedRef.current[key] = newContent; onEdit(key, newContent) } }, [getModule, onEdit, pushContentHistory])
  const handleCompositionEnd = useCallback((key: string) => { if (suppressInputRef.current) return; composingRef.current = false; const el = editorRefs.current[key]; if (!el) return; const newContent = el.innerHTML; const mod = getModule(key); const oldContent = mod?.content || ''; if (newContent !== oldContent) { pushContentHistory(key, oldContent); lastSavedRef.current[key] = newContent; onEdit(key, newContent) } }, [getModule, onEdit, pushContentHistory])
  // 保存当前光标位置
  const saveSelection = useCallback(() => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0 && sel.anchorNode) {
      // 检查光标是否在某个编辑器内
      for (const key of mandatoryKeys) {
        const el = editorRefs.current[key]
        if (el && el.contains(sel.anchorNode)) {
          savedRangeRef.current = sel.getRangeAt(0).cloneRange()
          return
        }
      }
    }
    savedRangeRef.current = null
  }, [mandatoryKeys])

  // 恢复光标位置到指定编辑器
  const restoreSelection = useCallback((key: string): boolean => {
    const el = editorRefs.current[key]
    if (!el) return false
    el.focus()
    const range = savedRangeRef.current
    if (range && el.contains(range.commonAncestorContainer)) {
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
      return true
    }
    // fallback：光标放到编辑器末尾
    const sel = window.getSelection()
    sel?.selectAllChildren(el)
    sel?.collapseToEnd()
    return false
  }, [])
  // 图片点击选中 → 聚焦所在模块
  const handleEditorClick = useCallback((e: React.MouseEvent, key: string) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'IMG') {
      // Focus the module editor
      const ed = editorRefs.current[key]
      if (ed) ed.focus()
      selectedImageRef.current = target as HTMLImageElement
      setSelectedImageKey(key)
      e.stopPropagation()
    } else if (!(target as HTMLElement).closest('[data-img-toolbar]')) {
      selectedImageRef.current = null
      setSelectedImageKey(null)
    }
  }, [])

  // 在指定模块的光标位置插入图片
  const insertImageAtCursor = useCallback((key: string, file: File, dataUrl: string) => {
    const el = editorRefs.current[key]
    if (!el) return
    const mod = getModule(key)
    if (mod) pushContentHistory(key, mod.content)
    restoreSelection(key)
    const img = `<img src="${dataUrl}" alt="${file.name}" style="display:block;max-width:100%;border-radius:8px;margin:8px 0" />`
    document.execCommand('insertHTML', false, img)
    onEdit(key, el.innerHTML)
    el.focus()
  }, [getModule, onEdit, pushContentHistory, restoreSelection])

  // 拖拽图片到编辑器
  const handleEditorDrop = useCallback((e: React.DragEvent, key: string) => {
    // 左侧配置区拖拽图片到中栏
    const dragImgData = (window as any).__dragImageData__
    if (dragImgData) {
      e.preventDefault()
      const el = editorRefs.current[key]
      if (!el) { (window as any).__dragImageData__ = null; return }
      const mod = getModule(key)
      if (mod) pushContentHistory(key, mod.content)
      el.focus()
      if (document.caretRangeFromPoint) {
        const r = document.caretRangeFromPoint(e.clientX, e.clientY)
        if (r) { const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r) }
      }
      document.execCommand('insertHTML', false, `<img src="${dragImgData.src}" alt="${dragImgData.alt}" style="display:block;max-width:100%;border-radius:8px;margin:8px 0" />`)
      onEdit(key, el.innerHTML)
      (window as any).__dragImageData__ = null
      return
    }
    const files = e.dataTransfer.files
    if (!files || files.length === 0) return
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (imageFiles.length === 0) return
    e.preventDefault()
    // 用 drop 的位置作为光标位置
    const el = editorRefs.current[key]
    if (!el) return
    el.focus()
    // 尝试从 drop 坐标获取光标位置
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(e.clientX, e.clientY)
      if (pos && el.contains(pos.offsetNode)) {
        const range = document.createRange()
        range.setStart(pos.offsetNode, pos.offset)
        range.collapse(true)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
        savedRangeRef.current = range.cloneRange()
      }
    } else if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(e.clientX, e.clientY)
      if (range && el.contains(range.startContainer)) {
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
        savedRangeRef.current = range.cloneRange()
      }
    }
    imageFiles.forEach(file => {
      const reader = new FileReader()
      reader.onload = () => insertImageAtCursor(key, file, reader.result as string)
      reader.readAsDataURL(file)
    })
  }, [insertImageAtCursor])
  // 图片悬浮工具栏
  const handleChatSubmit = useCallback(async (instructionOverride?: string) => { const instruction = (instructionOverride || chatInput).trim(); if (!instruction || chatLoading || mandatoryKeys.length === 0) return;
  // 去除emoji：本地处理，不调 AI
  if (instruction === '__STRIP_EMOJI__') { setChatLoading(true); showToast('正在去除emoji...', 'info'); const targetModule = focusedKeyRef.current; const keys = targetModule ? [targetModule] : mandatoryKeys.filter(k => getModule(k)?.content); let changed = 0; keys.forEach(k => { const mod = getModule(k); if (!mod?.content) return; const stripped = mod.content.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}‍️]/gu, '').replace(/\s{2,}/g, ' ').trim(); if (stripped !== mod.content.replace(/<[^>]+>/g, '').trim()) { pushContentHistory(k, mod.content); delete lastSavedRef.current[k]; onEdit(k, stripped); changed++ } }); setChatLoading(false); showToast(changed > 0 ? `已去除 ${changed} 个模块的emoji` : '没有找到emoji', changed > 0 ? 'success' : 'info'); chatRef.current?.focus(); return }
  // 保存快照（用于中止时恢复）
  const snapshot: Record<string, string> = {}
  mandatoryKeys.forEach(k => { const mod = getModule(k); if (mod) snapshot[k] = mod.content || '' })
  snapshotRef.current = snapshot
  // 推入撤销栈，用户不满意可一键回退到AI操作前
  if (Object.keys(snapshot).length > 0) { undoStack.push({ type: 'batch', modules: { ...snapshot } }); redoStack = []; console.log('[UNDO-DEBUG] 快照已推入撤销栈', { keys: Object.keys(snapshot), contentLengths: Object.fromEntries(Object.entries(snapshot).map(([k,v]) => [k, v.length])), stackDepth: undoStack.length }) }
  // 创建 AbortController
  const controller = new AbortController(); abortRef.current = controller
  activeInstructionRef.current = instruction
  setChatInput(''); setChatLoading(true); showToast('AI 正在优化文案...', 'info')
    // 图片→<!--IMG:N-->标记：原地替换，保持图片位置不变，AI只改文字
    const imgTags: { id: string; tag: string; base64: string; mimeType: string }[] = []
    const imgIndex: { id: string; tag: string; marker: string; desc: string }[] = []
    let globalImgIdx = 0
    const allModules = mandatoryKeys.map(key => {
      const mod = getModule(key)
      const raw = mod?.content || ''
      const stripped = raw.replace(/<img[^>]+>/gi, m => {
        // 提取src（base64数据URL）
        const srcMatch = m.match(/src="([^"]*)"/)
        const base64 = srcMatch ? srcMatch[1].replace(/^data:image\/\w+;base64,/, '') : ''
        const mime = srcMatch ? (srcMatch[1].match(/data:(image\/\w+);base64/) || [])[1] || 'image/jpeg' : 'image/jpeg'
        const altMatch = m.match(/alt="([^"]*)"/)
        const altText = altMatch ? altMatch[1] : ''
        const idx = globalImgIdx++
        const desc = altText.length > 30 ? '图片' + (idx + 1) : (altText || '图片' + (idx + 1))
        const id = key + '-' + idx
        const marker = '<!--IMG:' + idx + '-->'
        imgIndex.push({ id, tag: m, marker, desc: altText || desc })
        if (base64) imgTags.push({ id, tag: m, base64, mimeType: mime })
        return marker // 原地保留标记，AI只改文字不改图片位置
      })
      return { key, label: getLabel(key), content: stripped }
    })
    // 模块定位：聚焦的模块优先，否则扫描指令中的关键词匹配模块 label
    const targetModule = focusedKeyRef.current || (() => { let best: { key: string; len: number } | null = null; for (const { key, label } of allModules) { if (instruction.includes(label) && label.length > (best?.len || 0)) { best = { key, len: label.length } } } return best?.key || null })()
    // 聚焦单模块时只发那一个模块给 AI，大幅节省 token
    const moduleList = targetModule ? allModules.filter(m => m.key === targetModule) : allModules
    const keysToOptimize = targetModule ? [targetModule] : mandatoryKeys.filter(k => getModule(k)?.content)
    // 捕获模块当前高度，骨架屏期间维持不变
    for (const k of keysToOptimize) {
      const el = editorRefs.current[k]
      if (el) moduleHeightsRef.current[k] = el.offsetHeight
    }
    setOptimizingKeys(new Set(keysToOptimize))
    console.log('[CenterPanel] targetModule:', targetModule, '| 发送模块:', moduleList.map(m => m.key).join(', '), '| 内容长度:', moduleList.map(m => m.key + ':' + (m.content?.replace(/<[^>]+>/g,'').length || 0)).join(', '))
    // 编译图片上下文 + 标记索引（发给服务端注入prompt）
    const MODULE_LABEL_MAP: Record<string, string> = { hook:'首屏钩子',price:'价格福利',taste:'口感体验',trust:'基础信任',aftercare:'物流售后',tips:'储存贴士',cta:'行动召唤',ingredient:'成分科普',origin:'原料溯源',brand:'品牌背书',scene:'场景共情',feedback:'用户反馈',faq:'常见问题' }
    const markerIndex = imgIndex.map(e => ({ id: e.id, marker: e.marker, desc: e.desc }))
    const imageContext = (classifiedImages || []).length > 0 ? (classifiedImages || []).map(img => ({
      id: img.id,
      desc: img.desc || '',
      suggestedModule: (img as any).suggestedModule || '',
      layout_role: img.layout_role || 'detail',
      contentSummary: (img as any).imageContentSummary || ''
    })) : null
    // 有图片→多模态（豆包视觉模型），没图片→文本（DeepSeek）
    const useMultimodal = imgTags.length > 0
    const chatEndpoint = useMultimodal ? '/api/chat/multimodal' : '/api/chat/stream'

    // 多模态：压缩图片到合适分辨率
    let mmImages = null
    if (useMultimodal) {
      mmImages = await Promise.all(imgTags.map(async (t) => {
        // 按layout_role分层压缩：info类512px，其他256px
        const classified = (classifiedImages || []).find(c => {
          const srcMatch = t.tag.match(/src="([^"]*)"/)
          return srcMatch && c.preview && srcMatch[1].includes(c.preview.replace(/^data:image\/\w+;base64,/, '').slice(0, 50))
        })
        const role = classified?.layout_role || 'detail'
        const targetW = role === 'info' ? 512 : 256
        return compressImageDataUrl(t.base64, t.mimeType, targetW).then(c => ({ ...t, base64: c.base64, mimeType: c.mimeType }))
          .catch(() => t) // 压缩失败用原图
      }))
    }

    try { const response = await fetch(chatEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instruction, modules: moduleList, history: chatHistory, targetModule, images: useMultimodal ? mmImages : imageContext, markerIndex: useMultimodal ? undefined : markerIndex }), signal: controller.signal }); if (!response.ok) throw new Error('API error'); const reader = response.body!.getReader(); const decoder = new TextDecoder(); let buf = ''; const contents: Record<string, string> = {}; let curMod = ''
      while (true) { const { done, value } = await reader.read(); if (done) break; buf += decoder.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop() || ''; for (const line of lines) { if (!line.startsWith('data: ')) continue; const d = line.slice(6); let p; try { p = JSON.parse(d) } catch { continue }; if (p.type === 'done') continue; if (p.type === 'text' && p.content) { contents[curMod] = (contents[curMod] || '') + p.content; const m = /===(\w+)===/.exec(contents[curMod] || ''); if (m) { const matchedKey = m[1]; const sentKeys = moduleList.map(m => m.key); if (matchedKey === 'SKIP' || sentKeys.includes(matchedKey) || (!targetModule && mandatoryKeys.includes(matchedKey))) { const idx = (contents[curMod] || '').indexOf(m[0]); const before = (contents[curMod] || '').slice(0, idx); const after = (contents[curMod] || '').slice(idx + m[0].length); const prevMod = curMod; if (before.trim()) contents[prevMod] = before; else delete contents[prevMod]; curMod = matchedKey; contents[curMod] = (contents[curMod] || '') + after } }
        if (contents['SKIP']) { showToast('抱歉，我仅支持帮您优化文案哦～'); setChatLoading(false); setOptimizingKeys(new Set()); chatRef.current?.focus(); return } } } }
      if (contents['SKIP']) { showToast('抱歉，我仅支持帮您优化文案哦～'); setChatLoading(false); setOptimizingKeys(new Set()); chatRef.current?.focus(); return }
      console.log('[CenterPanel] AI返回的模块:', Object.keys(contents).filter(k => k && contents[k]).join(', '))
      // 准备最终文案，用发送给 AI 的模块列表（而非中栏已有模块）来遍历
      const finalContents: Record<string, string> = {}; let hasChange = false
      const processKeys = [...new Set([...moduleList.map(m => m.key), ...mandatoryKeys])]
      processKeys.forEach(k => { if (contents[k] && (!targetModule || k === targetModule)) { const mod = getModule(k); const oldContent = mod?.content || ''; const oldPlain = oldContent.replace(/<[^>]+>/g, '').trim(); const newPlain = contents[k].replace(/===\w+===/g, '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim(); console.log(`[CenterPanel] 模块 ${k}: 原文${oldPlain.length}字 → 新文${newPlain.length}字${oldPlain === newPlain ? ' (未变化!)' : ''}`); console.log(`  原文预览: ${oldPlain.slice(0, 80)}`); console.log(`  新文预览: ${newPlain.slice(0, 80)}`); if (oldPlain !== newPlain) hasChange = true; delete lastSavedRef.current[k]; finalContents[k] = (() => { let t = contents[k].replace(/===\w+===/g, ''); t = t.replace(/(?:^|\n)\s*(?:["'']?\s*(?:【[^】]*】|\[[^\]]*\]|---[^-]*---|\[文案\]|文案)\s*["'']?|===\w*===)\s*(?:<br\s*\/?>|\n)*/gi, '\n'); t = t.replace(/\[\]/g, ''); t = t.replace(/===\w*===/g, ''); t = t.replace(/^\[|\]$/gm, ''); t = t.replace(/^\]|\[$/gm, ''); t = t.replace(/<br\s*\/?>/gi, '\n').replace(/<\/tr>/gi, '\n').replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, ' / '); t = t.replace(/<[^>]+>/g, (m) => m.startsWith('<!--IMG:') ? m : ''); t = t.replace(/\[BR\]/g, '<br>').replace(/\n/g, '<br>'); t = t.replace(/^(<br\s*\/?>)+/i, '').trim(); return t })() } })
      // 全角冒号自动修正：<!--IMG：N--> → <!--IMG:N-->
      for (const k of processKeys) {
        if (finalContents[k]) {
          finalContents[k] = finalContents[k].replace(/<!--IMG：(\d+)-->/g, '<!--IMG:$1-->')
        }
      }
      // 标记→真实图片还原：Markdown标记 + <!--IMG:N-->多模态标记
      const markerMap = new Map(imgIndex.map(e => [e.id, e.tag]))
      const imgTagByIndex = imgIndex.map(e => e.tag)
      const EXPAND_WRAP = '<div class="img-expand" style="overflow:hidden;max-height:4px;opacity:0.3;transition:max-height 0.6s cubic-bezier(0.4,0,0.2,1),opacity 0.4s ease-out;border-radius:8px;margin:6px 0">$1</div>'
      const restoreImages = (text: string): string => {
        // 全角冒号修正
        text = text.replace(/<!--IMG：(\d+)-->/g, '<!--IMG:$1-->')
        // Markdown标记 ![...](img-xxx) — 兼容旧文本方案
        text = text.replace(/!\[[^\]]*\]\(img-([^)]+)\)/g, (_, id) => {
          const tag = markerMap.get(id)
          return tag ? EXPAND_WRAP.replace('$1', tag) : ''
        })
        // 多模态标记 <!--IMG:N-->
        text = text.replace(/<!--IMG:(\d+)-->/g, (_, n) => {
          const idx = parseInt(n)
          const tag = imgTagByIndex[idx]
          return tag ? EXPAND_WRAP.replace('$1', tag) : ''
        })
        return text
      }
      const typewriteKeys = Object.keys(finalContents)
      // 兜底校验：标记数量是否完整（文本+多模态两种标记都检查）
      let markerLost = false
      for (const k of typewriteKeys) {
        const origCount = (imgIndex.filter(e => e.id.startsWith(k + '-')).length || 0) + imgTags.length
        if (origCount === 0) continue
        const txtMarkers = (finalContents[k]?.match(/!\[[^\]]*\]\(img-[^)]+\)/g) || []).length
        const mmMarkers = (finalContents[k]?.match(/<!--IMG:\d+-->/g) || []).length
        // 只有在该模块原本有标记时才检查
        const moduleOrig = imgIndex.filter(e => e.id.startsWith(k + '-')).length
        if (moduleOrig > 0 && (txtMarkers < moduleOrig)) markerLost = true
        if (imgTags.length > 0 && (mmMarkers < imgTags.length)) markerLost = true
      }
      // 启动打字机效果
      const successMsg = hasChange ? '优化成功' : '😭 我溜号了，再让我执行一次吧～'
      if (markerLost) showToast('部分图片标记丢失，已回退到模块末尾', 'warning')
      typewrite(finalContents, {}, onEdit, () => {
        // 打字完成：替换标记为真实图片 + 展开动画（丢失的图堆到末尾）
        for (const k of typewriteKeys) {
          let text = finalContents[k] || ''
          text = restoreImages(text)
          // 兜底：未还原的真实img标签追加到末尾
          const lostImgs = imgIndex.filter(e => e.id.startsWith(k + '-') && !text.includes(e.tag))
          if (lostImgs.length > 0) {
            text += lostImgs.map(e => '<div class="img-expand" style="overflow:hidden;max-height:4px;opacity:0.3;transition:max-height 0.6s cubic-bezier(0.4,0,0.2,1),opacity 0.4s ease-out;border-radius:8px;margin:6px 0">' + e.tag + '</div>').join('')
          }
          // 删除 lastSavedRef 强制 useEffect 刷新 contentEditable（否则带标记的旧文本残留）
          delete lastSavedRef.current[k]
          onEdit(k, expandImagesInHtml(text))
        }
        requestAnimationFrame(() => {
          for (const key of typewriteKeys) {
            const el = editorRefs.current[key]
            if (el) {
              el.querySelectorAll('.img-expand').forEach((div: Element) => {
                const d = div as HTMLElement
                d.style.maxHeight = 'none'
                d.style.overflow = 'visible'
                d.style.opacity = '1'
              })
            }
        }})
        setTypewritingKeys(new Set())
        setOptimizingKeys(new Set()); snapshotRef.current = {}; abortRef.current = null; setChatLoading(false); showToast(successMsg, hasChange ? 'success' : 'info'); setChatHistory(prev => [...prev.slice(-4), { role: 'user', content: instruction }, { role: 'assistant', content: '已完成文案优化' }]); if (targetModule) { setFocusedKey(targetModule); focusedKeyRef.current = targetModule; setTimeout(() => editorRefs.current[targetModule]?.focus(), 50) } }, typewriteTimerRef, { onFirstFrame: () => setOptimizingKeys(new Set()) })
    } catch (e: any) { if (e?.name === 'AbortError') { /* handleStop 已处理 */ return } console.error('Chat error:', e); snapshotRef.current = {}; abortRef.current = null; showToast('优化失败，请重试', 'error'); setOptimizingKeys(new Set()); setTypewritingKeys(new Set()); setChatLoading(false) };
    setOptimizingKeys(new Set()); setTypewritingKeys(new Set()); if (!targetModule) chatRef.current?.focus() }, [chatInput, chatLoading, mandatoryKeys, getModule, onEdit, pushContentHistory, showToast])
  const handleChatKeyDown = useCallback((e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSubmit() } }, [handleChatSubmit])

  const handleEditorHoverIn = useCallback((e: React.MouseEvent, key: string) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'IMG') {
      if (toolbarTimerRef.current) clearTimeout(toolbarTimerRef.current)
      const img = target as HTMLImageElement
      // 把上一张悬浮的图片恢复原状
      if (hoveredImageRef.current && hoveredImageRef.current !== img) {
        hoveredImageRef.current.style.transform = ''
        hoveredImageRef.current.style.transition = ''
      }
      img.style.cursor = 'pointer'
      img.style.transition = 'transform 0.2s ease'
      img.style.transform = 'scale(1.03)'
      hoveredImageRef.current = img
      const r = img.getBoundingClientRect()
      setHoveredImagePos({ left: r.left, top: r.top, width: r.width, height: r.height, key })
    } else if (hoveredImageRef.current) {
      const related = e.relatedTarget as HTMLElement
      if (related?.closest && !related.closest('[data-img-toolbar]') && !target.closest('[data-img-toolbar]')) {
        if (hoveredImageRef.current) { hoveredImageRef.current.style.transform = ''; hoveredImageRef.current.style.transition = '' }
        toolbarTimerRef.current = window.setTimeout(() => { hoveredImageRef.current = null; setHoveredImagePos(null) }, 300)
      }
    }
  }, [])
  const handleEditorHoverOut = useCallback((e: React.MouseEvent) => {
    const related = e.relatedTarget as HTMLElement
    if (related?.closest && related.closest('[data-img-toolbar]')) return
    if (toolbarTimerRef.current) clearTimeout(toolbarTimerRef.current)
    if (hoveredImageRef.current) { hoveredImageRef.current.style.transform = ''; hoveredImageRef.current.style.transition = '' }
    toolbarTimerRef.current = window.setTimeout(() => { hoveredImageRef.current = null; setHoveredImagePos(null) }, 300)
  }, [])
  const handleDeleteHoveredImage = useCallback(() => {
    const img = hoveredImageRef.current
    if (!img || !hoveredImagePos) return
    const el = editorRefs.current[hoveredImagePos.key]
    if (!el) return
    const mod = getModule(hoveredImagePos.key)
    if (mod) pushContentHistory(hoveredImagePos.key, mod.content)
    // 删除图片及前后的 <br>
    const prev = img.previousElementSibling
    if (prev && prev.tagName === 'BR') prev.remove()
    const next = img.nextElementSibling
    if (next && next.tagName === 'BR') next.remove()
    img.remove()
    if (!el.innerHTML.trim() || el.innerHTML === '<br>') el.innerHTML = '<br>'
    onEdit(hoveredImagePos.key, el.innerHTML)
    hoveredImageRef.current = null
    setHoveredImagePos(null); selectedImageRef.current = null; setSelectedImageKey(null)
    if (toolbarTimerRef.current) clearTimeout(toolbarTimerRef.current)
  }, [hoveredImagePos, getModule, onEdit, pushContentHistory])
  // 图片移动 — 解析 innerHTML 中的段落，与 img 标签交换位置
  const moveImageInHtml = useCallback((html: string, direction: 'up' | 'down'): string => {
    const parts = html.split(/(<br\s*\/?>)/i)
    let imgIdx = -1
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].includes('<img')) { imgIdx = i; break }
    }
    if (imgIdx === -1) return html
    if (direction === 'up' && imgIdx >= 2) {
      const tmp = parts[imgIdx]; parts[imgIdx] = parts[imgIdx - 2]; parts[imgIdx - 2] = tmp
    } else if (direction === 'down' && imgIdx + 2 < parts.length) {
      const tmp = parts[imgIdx]; parts[imgIdx] = parts[imgIdx + 2]; parts[imgIdx + 2] = tmp
    }
    return parts.join('')
  }, [])
  const handleMoveImage = useCallback((dir: 'up' | 'down') => {
    if (!hoveredImagePos) return
    const el = editorRefs.current[hoveredImagePos.key]
    if (!el) return
    const mod = getModule(hoveredImagePos.key)
    if (mod) pushContentHistory(hoveredImagePos.key, mod.content)
    const newHtml = moveImageInHtml(el.innerHTML, dir)
    if (newHtml === el.innerHTML) return
    el.innerHTML = newHtml; onEdit(hoveredImagePos.key, newHtml)
    hoveredImageRef.current = null; setHoveredImagePos(null); selectedImageRef.current = null; setSelectedImageKey(null)
  }, [hoveredImagePos, getModule, onEdit, moveImageInHtml])
  const handleCutCopyImage = useCallback(async (action: 'cut' | 'copy') => {
    const img = hoveredImageRef.current
    if (!img || !hoveredImagePos) return
    imageClipboardRef.current = { src: img.src, alt: img.getAttribute('alt') || '' }
    // 写入系统剪贴板，方便快捷键粘贴
    try { const r = await fetch(img.src); const b = await r.blob(); await navigator.clipboard.write([new ClipboardItem({ [b.type]: b })]) } catch (_) {}
    if (action === 'cut') {
      const el = editorRefs.current[hoveredImagePos.key]
      if (!el) return
      const mod = getModule(hoveredImagePos.key)
      if (mod) pushContentHistory(hoveredImagePos.key, mod.content)
      const prev = img.previousElementSibling; if (prev && prev.tagName === 'BR') prev.remove()
      const next = img.nextElementSibling; if (next && next.tagName === 'BR') next.remove()
      img.remove(); if (!el.innerHTML.trim() || el.innerHTML === '<br>') el.innerHTML = '<br>'
      onEdit(hoveredImagePos.key, el.innerHTML)
    }
    hoveredImageRef.current = null; setHoveredImagePos(null); selectedImageRef.current = null; setSelectedImageKey(null)
  }, [hoveredImagePos, getModule, onEdit, pushContentHistory])
  // 鼠标拖拽图片（绕过浏览器默认 contentEditable 拖拽行为）
  const mouseDragRef = useRef<{ key: string; src: string; alt: string; startX: number; startY: number; dragging: boolean } | null>(null)
  const handleImageMouseDown = useCallback((e: React.MouseEvent, key: string) => {
    const target = e.target as HTMLElement
    if (target.tagName !== 'IMG') return
    const img = target as HTMLImageElement
    if (!img.draggable) return
    e.preventDefault()
    mouseDragRef.current = { key, src: img.src, alt: img.getAttribute('alt') || '', startX: e.clientX, startY: e.clientY, dragging: false }
    const onMove = (ev: MouseEvent) => {
      if (!mouseDragRef.current) return
      if (!mouseDragRef.current.dragging && (Math.abs(ev.clientX - mouseDragRef.current.startX) > 5 || Math.abs(ev.clientY - mouseDragRef.current.startY) > 5)) {
        mouseDragRef.current.dragging = true; img.style.opacity = '0.3'
        document.body.style.cursor = 'grabbing'
        const ghost = document.createElement('div')
        ghost.id = '__img_drag_ghost__'
        ghost.style.cssText = 'position:fixed;pointer-events:none;z-index:99999;opacity:0.5;transform:scale(0.35);transform-origin:top left;'
        const gImg = document.createElement('img')
        gImg.src = img.src
        gImg.style.cssText = 'max-width:300px;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.3);'
        ghost.appendChild(gImg); document.body.appendChild(ghost)
      }
      if (mouseDragRef.current?.dragging) {
        const ghost = document.getElementById('__img_drag_ghost__')
        if (ghost) { ghost.style.left = (ev.clientX + 15) + 'px'; ghost.style.top = (ev.clientY + 15) + 'px' }
        const el = document.elementFromPoint(ev.clientX, ev.clientY)
        const editor = el?.closest('[contenteditable]') as HTMLElement
        if (editor && editor.closest('[data-block-key]')) {
          const range = document.caretRangeFromPoint?.(ev.clientX, ev.clientY)
          if (range) { const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(range) }
        }
      }
    }
        const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      const ghost = document.getElementById('__img_drag_ghost__')
      if (ghost) ghost.remove()
      document.querySelectorAll('[contenteditable]').forEach(el => { (el as HTMLElement).style.outline = '' })
      if (mouseDragRef.current?.dragging) {
        const el = document.elementFromPoint(ev.clientX, ev.clientY)
        const editorDiv = el?.closest('[contenteditable]') as HTMLElement
        const targetKey = editorDiv?.getAttribute('data-block-key')
        if (targetKey && mouseDragRef.current) {
          const src = mouseDragRef.current
          const mod = getModule(targetKey)
          if (mod) pushContentHistory(targetKey, mod.content)
          const srcEl = editorRefs.current[src.key]
          if (srcEl) {
            const imgs = srcEl.querySelectorAll('img')
            for (const i of imgs) {
              if (i.src === src.src && i.getAttribute('alt') === src.alt) {
                const p = i.previousElementSibling; if (p && p.tagName === 'BR') p.remove()
                const n = i.nextElementSibling; if (n && n.tagName === 'BR') n.remove()
                i.remove(); break
              }
            }
            if (!srcEl.innerHTML.trim() || srcEl.innerHTML === '<br>') srcEl.innerHTML = '<br>'
            if (src.key !== targetKey) onEdit(src.key, srcEl.innerHTML)
          }
          const dstEl = editorRefs.current[targetKey]
          if (dstEl) {
            dstEl.focus()
            document.execCommand('insertHTML', false, `<img src="${src.src}" alt="${src.alt}" style="display:block;max-width:100%;border-radius:8px;margin:8px 0" />`)
            onEdit(targetKey, dstEl.innerHTML)
            setTimeout(() => {
              const dstEl = editorRefs.current[targetKey]
              if (dstEl) {
                const images = dstEl.querySelectorAll('img')
                const lastImg = images[images.length - 1]
                if (lastImg) {
                  lastImg.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  // 将光标定位到图片后方
                  const range = document.createRange()
                  range.setStartAfter(lastImg)
                  range.collapse(true)
                  const sel = window.getSelection()
                  sel?.removeAllRanges()
                  sel?.addRange(range)
                }
              }
            }, 100)
            // 放置后滚动视口使图片居中
          }
          if (src.key !== targetKey) { const se = editorRefs.current[src.key]; if (se) onEdit(src.key, se.innerHTML) }
        }
        img.style.opacity = '1'
      }
      mouseDragRef.current = null
      selectedImageRef.current = null; setSelectedImageKey(null)
    }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  }, [getModule, onEdit, pushContentHistory])
  
  const handlePasteImage = useCallback(() => {
    const clip = imageClipboardRef.current
    if (!clip) return
    const key = focusedKeyRef.current
    if (!key) return
    const el = editorRefs.current[key]
    if (!el) return
    const mod = getModule(key)
    if (mod) pushContentHistory(key, mod.content)
    restoreSelection(key)
    document.execCommand('insertHTML', false, `<img src="${clip.src}" alt="${clip.alt}" style="display:block;max-width:100%;border-radius:8px;margin:8px 0" />`)
    onEdit(key, el.innerHTML); imageClipboardRef.current = null; el.focus()
  }, [getModule, onEdit, pushContentHistory, restoreSelection])
  
  const handleStop = useCallback(() => {
    // 1. 中断 fetch
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null }
    // 2. 中断打字机动画
    if (typewriteTimerRef.current) { typewriteTimerRef.current(); typewriteTimerRef.current = null }
    // 3. 恢复文稿快照
    const snap = snapshotRef.current
    if (snap && Object.keys(snap).length > 0) {
      Object.entries(snap).forEach(([key, content]) => {
        delete lastSavedRef.current[key]
        onEdit(key, content)
      })
    }
    // 4. 清理状态
    setChatLoading(false); setOptimizingKeys(new Set()); setTypewritingKeys(new Set()); snapshotRef.current = {}
    showToast('已中止操作，文稿已恢复', 'info')
  }, [onEdit, showToast])

  const handleExportWord = useCallback(() => {
    const productName = input?.productName?.trim() || '笔记定稿'
    const mods = mandatoryKeys.map(key => ({ key, content: getModule(key)?.content || '' }))
    // 构建视频文件映射（File对象不可序列化，直接传递）
    const videoFiles = new Map<string, File>()
    videoFilesRef.current.forEach((v, k) => videoFiles.set(k, v.file))
    exportToDisk({
      productName,
      headline: input?.headline?.trim() || undefined,
      sellingPoints: input?.sellingPoints?.trim() || undefined,
      modules: mods,
      videoFiles,
      onExportCorpus,
      showToast,
    })
  }, [mandatoryKeys, getModule, input, onExportCorpus, showToast])
  const handleModuleDragStart = (e: React.PointerEvent, index: number) => {
    e.preventDefault(); e.stopPropagation()
    const el = moduleElRefs.current[index]
    if (!el) return
    const rect = el.getBoundingClientRect()
    dragRef.current = { sourceIndex: index, offsetY: 0, srcHeight: rect.height, srcTop: rect.top, mouseStartY: e.clientY, ghost: null }
    const ghost = el.cloneNode(true) as HTMLDivElement
    ghost.style.position = 'fixed'; ghost.style.left = rect.left + 'px'; ghost.style.top = rect.top + 'px'
    ghost.style.width = rect.width + 'px'; ghost.style.pointerEvents = 'none'; ghost.style.zIndex = '9999'
    ghost.style.opacity = '0.95'; ghost.style.boxShadow = '0 12px 40px rgba(0,0,0,0.15)'
    ghost.style.borderRadius = '12px'; ghost.style.transform = 'scale(1.015)'
    ghost.style.transition = 'box-shadow 0.2s ease'
    ghost.querySelectorAll('[contenteditable]').forEach(el => (el as HTMLElement).contentEditable = 'false')
    document.body.appendChild(ghost)
    dragRef.current.ghost = ghost
    setIsDragging(true); setDragOverIdx(index); overRef.current = index
  }

  // Global pointer listeners for drag
  useEffect(() => {
    if (!isDragging) return
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current
      const deltaY = e.clientY - d.mouseStartY
      d.offsetY = deltaY
      if (d.ghost) d.ghost.style.top = (d.srcTop + deltaY) + 'px'
      const els = moduleElRefs.current
      let over = d.sourceIndex; const cursorY = e.clientY
      for (let i = 0; i < d.sourceIndex; i++) { const el = els[i]; if (el && cursorY < el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2) { over = i; break } }
      if (over === d.sourceIndex) { for (let i = els.length - 1; i > d.sourceIndex; i--) { const el = els[i]; if (el && cursorY > el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2) { over = i + 1; break } } }
      if (over !== overRef.current) { overRef.current = over; setDragOverIdx(over) }
    }
    const onUp = () => {
      const d = dragRef.current
      if (d.ghost) { document.body.removeChild(d.ghost); d.ghost = null }
      const finalOver = overRef.current
      if (d.sourceIndex >= 0 && finalOver >= 0 && d.sourceIndex !== finalOver) {
        const adjusted = finalOver > d.sourceIndex ? finalOver - 1 : finalOver
        if (adjusted !== d.sourceIndex) {
          undoStack.push({ type: 'order', order: [...mandatoryKeys] })
          redoStack = []
          const newOrder = [...mandatoryKeys]; const [item] = newOrder.splice(d.sourceIndex, 1); newOrder.splice(adjusted, 0, item)
          onReorder(newOrder)
        }
      }
      setIsDragging(false); setDragOverIdx(null)
    }
    document.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerup', onUp)
    return () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp) }
  }, [isDragging, mandatoryKeys, onReorder])

  const handleMoveUp = useCallback((index: number) => { if (index <= 0) return; undoStack.push({ type: 'order', order: [...mandatoryKeys] }); redoStack = []; const newOrder = [...mandatoryKeys]; [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]]; onReorder(newOrder) }, [mandatoryKeys, onReorder])
  const handleMoveDown = useCallback((index: number) => { if (index >= mandatoryKeys.length - 1) return; undoStack.push({ type: 'order', order: [...mandatoryKeys] }); redoStack = []; const newOrder = [...mandatoryKeys]; [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]]; onReorder(newOrder) }, [mandatoryKeys, onReorder])

  return (<div className="flex flex-col h-full">
    <div className="flex-shrink-0 flex items-start gap-1 px-4 py-2.5 border-b border-border bg-background">
      <button className="flex flex-col items-center justify-center gap-1.5 rounded-lg h-[52px] w-[52px] text-[11px] leading-tight text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" onClick={handleUndo}><svg width="17" height="17" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3.5 5.5L1.5 7.5l2 2" /><path d="M1.5 7.5h8a4 4 0 010 8" /></svg><span>撤销</span></button>
      <button className="flex flex-col items-center justify-center gap-1.5 rounded-lg h-[52px] w-[52px] text-[11px] leading-tight text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" onClick={handleRedo}><svg width="17" height="17" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11.5 5.5L13.5 7.5l-2 2" /><path d="M13.5 7.5h-8a4 4 0 000 8" /></svg><span>重做</span></button>
      <button className="flex flex-col items-center justify-center gap-1.5 rounded-lg h-[52px] w-[52px] text-[11px] leading-tight text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" onClick={onAddBlock}><svg width="17" height="17" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7.5 2v11M2 7.5h11" /></svg><span>文本块</span></button><button className="flex flex-col items-center justify-center gap-1.5 rounded-lg h-[52px] w-[52px] text-[11px] leading-tight text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" onClick={onAddVideo}><svg width="17" height="17" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7.5 2v11M2 7.5h11" /></svg><span>视频</span></button><button className="flex flex-col items-center justify-center gap-1.5 rounded-lg h-[52px] w-[52px] text-[11px] leading-tight text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors" onClick={() => { if (!confirm('确定清空编辑区？所有文案和图片将被删除。')) return; mandatoryKeys.forEach(k => { const mod = getModule(k); if (mod?.content && mod.content !== '<br>') { pushContentHistory(k, mod.content); delete lastSavedRef.current[k]; onEdit(k, '<br>') } }); onClearAll?.(); showToast('已清空', 'info') }}><svg width="17" height="17" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2.5 4.5h10M5.5 4.5V3a1 1 0 011-1h2a1 1 0 011 1v1.5M4.5 4.5l.5 8.5a1 1 0 001 1h3a1 1 0 001-1l.5-8.5" /></svg><span>清空</span></button>
            <div className="flex-1" />
      <button className="flex flex-col items-center justify-center gap-1.5 rounded-lg h-[52px] w-[52px] text-[11px] leading-tight text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" onClick={() => { const content = mandatoryKeys.map(key => { return (getModule(key)?.content || '') }).filter(Boolean).join('<br>'); const body = content.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>'); const w = window.open('', '_blank', 'width=420,height=780'); if (w) { w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0;box-sizing:border-box}html{scrollbar-width:none}html::-webkit-scrollbar{display:none}body{font-family:"PingFang SC",sans-serif;line-height:1.8;font-size:15px;color:#333;background:#fff}.top-img{width:100%;max-width:400px;display:block;margin:0 auto}.content{max-width:400px;margin:0 auto;padding:20px 16px;white-space:pre-wrap}.content img{max-width:100%;height:auto;border-radius:8px;margin:8px 0}.bottom-wrap{position:fixed;bottom:0;left:0;right:0;display:flex;justify-content:center}.bottom-img{width:100%;max-width:400px;display:block}.spacer{padding-bottom:100px}</style></head><body><img class="top-img" src="/docs/1.png"><div class="content">'+body+'</div><div class="spacer"></div><div class="bottom-wrap"><img class="bottom-img" src="/docs/2.png"></div></body></html>'); w.document.close() } }}><svg width="17" height="17" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="7.5" cy="7.5" r="2.5"/><path d="M2.5 7.5c0-2.8 2.2-5 5-5s5 2.2 5 5-2.2 5-5 5-5-2.2-5-5z"/><path d="M7.5 2.5v10"/></svg><span>预览</span></button><button className="flex flex-col items-center justify-center gap-1.5 rounded-lg h-[52px] w-[52px] text-[11px] leading-tight text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" onClick={handleExportWord}><svg width="17" height="17" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2.5 1.5h10a1 1 0 011 1v10a1 1 0 01-1 1h-10a1 1 0 01-1-1v-10a1 1 0 011-1zM4.5 4.5h6M4.5 7.5h6M4.5 10.5h4" /></svg><span>导出</span></button><button onClick={() => { if (onExportCorpus) onExportCorpus() }} className="flex flex-col items-center justify-center gap-1.5 rounded-lg h-[52px] w-[52px] text-[11px] leading-tight bg-[#07C160] text-white hover:bg-[#06AD56] transition-colors font-medium"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg><span>去发布</span></button>
    </div>
    <div className={`center-scroll-area flex-1 overflow-y-auto ${isIdle || isBlocked ? 'flex items-center justify-center' : ''} ${chatLoading ? 'cursor-not-allowed' : ''}`} style={{ paddingBottom: chatFocused ? '180px' : '72px' }}>
      <div className="py-8 px-4 w-[92%] max-w-4xl mx-auto translate-x-[5px]">
        {isIdle && (<Empty><EmptyHeader><EmptyMedia variant="icon"><svg width="20" height="20" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7.5 1.5v5m0 0l-2-2m2 2l2-2M2.5 5.5v6a1 1 0 001 1h8a1 1 0 001-1v-6" /></svg></EmptyMedia><EmptyTitle>在左侧配置商品信息后开始生成</EmptyTitle><EmptyDescription>完成必填项后点击「一键生成」，AI 文案将出现在右栏，采纳后可在此编辑定稿</EmptyDescription></EmptyHeader></Empty>)}
        {isBlocked && (<Empty><EmptyHeader><EmptyMedia variant="icon"><svg width="20" height="20" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7.5 6.5v-4m0 0l-2 2m2-2l2 2M1.5 12.5l6-6 6 6" /></svg></EmptyMedia><EmptyTitle className="text-destructive">生成被阻断</EmptyTitle><EmptyDescription>检测到输入内容包含高危违规词，请修改后重试</EmptyDescription></EmptyHeader></Empty>)}
        {!isIdle && !isBlocked && (<div className={chatLoading ? 'pointer-events-none select-none' : ''}>{mandatoryKeys.map((key, index) => { const mod = getModule(key)
          return (<div key={key} ref={el => { moduleElRefs.current[index] = el }} className={`relative group ${index > 0 ? 'mt-8' : ''} rounded-lg ${focusedKey === key ? 'ring-2 ring-primary/20 bg-primary/5 px-2 py-2 -mx-2 -my-2' : ''}`} style={getDragStyles(index)}>
            <div className="flex items-center justify-between mb-1"><span className={`text-[11px] font-medium select-none leading-tight whitespace-nowrap ${focusedKey === key ? 'text-primary' : 'text-muted-foreground/30'}`}>{getLabel(key)}</span><div className="flex items-center gap-1">{index > 0 && <button onClick={() => handleMoveUp(index)} className="text-muted-foreground/40 hover:text-muted-foreground/70 p-1 transition-colors rounded" title="上移"><span className="text-base leading-none">↑</span></button>}{index < mandatoryKeys.length - 1 && <button onClick={() => handleMoveDown(index)} className="text-muted-foreground/40 hover:text-muted-foreground/70 p-1 transition-colors rounded" title="下移"><span className="text-base leading-none">↓</span></button>}<button onPointerDown={e => handleModuleDragStart(e, index)} className={`cursor-grab active:cursor-grabbing transition-colors rounded p-1 ${focusedKey === key ? 'text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground/70'}`} title="拖拽排序"><svg width="16" height="16" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7.5 1.5v12M1.5 7.5h12M4.5 4.5l3-3 3 3M4.5 10.5l3 3 3-3"/></svg></button><button onClick={() => { const m = getModule(key); if (m && m.content && m.content !== '<br>' && !isVideoModule(key) && !confirm('确定删除？')) return; if (isVideoModule(key)) { const vf = videoFilesRef.current.get(key); if (vf) URL.revokeObjectURL(vf.objectUrl); videoFilesRef.current.delete(key) } onDeleteBlock(key) }} className="text-muted-foreground/40 hover:text-destructive p-1 transition-colors rounded"><svg width="16" height="16" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2.5 4.5h10M5.5 4.5V3a1 1 0 011-1h2a1 1 0 011 1v1.5M4.5 4.5l.5 8.5a1 1 0 001 1h3a1 1 0 001-1l.5-8.5" /></svg></button></div></div>
            <div>{optimizingKeys.has(key) ? (<div key="skel" className="flex flex-col gap-2 py-0.5" style={moduleHeightsRef.current[key] ? { minHeight: moduleHeightsRef.current[key] + 'px' } : undefined}>{Array.from({ length: estimateLines(mod?.content || '') }, (_, i) => (<Skeleton key={i} className={`h-4 rounded ${SKEL_WIDTHS[i % SKEL_WIDTHS.length]}`} />))}</div>) : isVideoModule(key) ? (<div key="video" className="flex items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/20 bg-muted/30 min-h-[160px] cursor-pointer hover:border-muted-foreground/40 hover:bg-muted/50 transition-colors" onClick={() => triggerVideoUpload(key)} onDragOver={e => { e.preventDefault(); e.stopPropagation() }} onDrop={e => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files?.[0]; if (!f || !f.type.startsWith('video/')) return; const old = videoFilesRef.current.get(key); if (old) URL.revokeObjectURL(old.objectUrl); const objectUrl = URL.createObjectURL(f); videoFilesRef.current.set(key, { file: f, objectUrl }); onEdit(key, JSON.stringify({ type: 'video', name: f.name, size: f.size })); showToast('视频已上传', 'success') }}>{(() => { const vf = videoFilesRef.current.get(key); if (vf) { return (<video src={vf.objectUrl} controls className="max-w-full max-h-[320px] rounded" onClick={e => e.stopPropagation()} />) } return (<div className="flex flex-col items-center gap-2 text-muted-foreground/40"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg><span className="text-xs">点击或拖拽上传视频</span></div>) })()}</div>) : (<div key="editor" data-block-key={key} ref={el => { editorRefs.current[key] = el; if (el && mod && mod.content && mod.content !== '<br>' && el.innerHTML !== mod.content && lastSavedRef.current[key] !== mod.content) el.innerHTML = mod.content }} contentEditable suppressContentEditableWarning onDragOver={e => { e.preventDefault(); if ((window as any).__dragImageData__) { e.dataTransfer.dropEffect = 'copy'; if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(e.clientX, e.clientY); if (r) { const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r) } } } else { e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') ? 'copy' : 'move' } }} onDrop={e => handleEditorDrop(e, key)} onMouseOver={e => handleEditorHoverIn(e, key)} onMouseLeave={handleEditorHoverOut} onClick={e => handleEditorClick(e, key)} onMouseDown={e => handleImageMouseDown(e, key)} data-placeholder="从右栏版本候选区点击「采纳」后，文案将出现在此处供编辑定稿" onFocus={() => { focusedKeyRef.current = key; setFocusedKey(key); savePointRef.current[key] = editorRefs.current[key]?.innerHTML || '' }} onCompositionStart={() => { composingRef.current = true }} onCompositionEnd={() => handleCompositionEnd(key)} onInput={() => handleEditorInput(key)} onBlur={() => { saveSelection(); setTimeout(() => { if (chatLoadingRef.current) return; const ae = document.activeElement; if (ae !== chatRef.current && focusedKeyRef.current === key) { setFocusedKey(null); focusedKeyRef.current = null } }, 120) }} className="text-base leading-relaxed outline-none text-justify empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/40 empty:before:italic" style={{ lineHeight: '1.7' }} />)}</div>
          </div>)})}</div>)}
      </div>
    </div>
    <div className="flex-shrink-0 h-10 pointer-events-none" style={{ background: 'linear-gradient(to top, hsl(var(--background)), transparent)', marginTop: '-2.5rem', position: 'relative', zIndex: 1 }} />
    <div className="flex-shrink-0 bg-background px-4 py-2" style={{ boxShadow: '0 -6px 16px rgba(0,0,0,0.04), 0 -2px 4px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.04)' }}>
      <div className="overflow-x-auto mb-1.5">
        <div className="flex flex-col gap-1 min-w-fit">
          <div className="flex items-center gap-1">{[{ label: '🍠 小红书风', instruction: '改写为小红书种草风（按系统指令中的小红书风各模块写作规则执行）', cls: 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground', tip: '强钩子+高密度emoji+价格轰炸+紧迫感'}, {label: '👭 闺蜜风', instruction: '改写为日常闺蜜风（按系统指令中的闺蜜风各模块写作规则执行）', cls: 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground', tip: '像跟闺蜜聊天一样轻松推荐'}, {label: '📋 简约风', instruction: '改写为简约功能风（按系统指令中的简约风各模块写作规则执行）', cls: 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground', tip: '零emoji纯文字，极简参数风格'}, {label: '🤪 趣味风', instruction: '改写为趣味风（按系统指令中的趣味风各模块写作规则执行）', cls: 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground', tip: '脱口秀段子手，夸张幽默反差'}, {label: '✨ 高端风', instruction: '改写为高端大气风（按系统指令中的高端风各模块写作规则执行）', cls: 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground', tip: '一句一段，留白美学，不提价格'}, {label: '💼 团长风', instruction: '改写为资深团长风（按系统指令中的资深团长风各模块写作规则执行）', cls: 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground', tip: '老团长视角，直接报价不装不催单'}].map(item => (<Tooltip key={item.label} text={item.tip}><button disabled={chatLoading} onClick={() => handleChatSubmit(item.instruction)} className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] active:scale-95 transition-all duration-150 ${chatLoading ? 'opacity-40 cursor-not-allowed' : item.cls}`}>{item.label}</button></Tooltip>))}</div>
          <div className="flex items-center gap-1">{[{label: '📝 扩充', instruction: '文字扩充（篇幅翻倍）', cls: 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground', tip: '篇幅翻倍，丰富细节和场景描写'}, {label: '✨ +emoji', instruction: '增加emoji（只加emoji不改文字不改排版，仅插入emoji）', cls: 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground', tip: '只加emoji不改文字，大胆穿插叠加'}, {label: '🚫 -emoji', instruction: '__STRIP_EMOJI__', cls: 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground', tip: '一键过滤所有emoji，保留纯文字'}, {label: '💪 强化卖点', instruction: '强化卖点', cls: 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground', tip: '放大价格优势和差异化亮点'}, {label: '💬 口语化', instruction: '口语化改写', cls: 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground', tip: '书面语转口语，像在跟朋友聊天' }].map(item => (<Tooltip key={item.label} text={item.tip}><button disabled={chatLoading} onClick={() => handleChatSubmit(item.instruction)} className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] active:scale-95 transition-all duration-150 ${chatLoading ? 'opacity-40 cursor-not-allowed' : item.cls}`}>{item.label}</button></Tooltip>))}</div>
        </div>
        </div>
      {chatLoading ? (
        <div className="flex items-center gap-3 rounded-lg bg-muted/30 px-4 py-3 text-sm">
          <span className="inline-block size-4 animate-spin rounded-full border-2 border-primary border-t-transparent shrink-0" />
          <span className="text-muted-foreground flex-1 truncate">AI 正在优化文案...</span>
          <button onClick={handleStop} className="inline-flex items-center gap-1.5 rounded-full bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 text-xs font-medium px-3 py-1.5 transition-colors shrink-0 active:scale-95">
            <svg width="12" height="12" viewBox="0 0 15 15" fill="currentColor"><rect x="2" y="2" width="11" height="11" rx="1.5" /></svg>
            停止
          </button>
        </div>
      ) : (
        <div className="ai-input-glow"><Textarea ref={chatRef} value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={handleChatKeyDown} onFocus={() => setChatFocused(true)} onBlur={() => { setChatFocused(false); if (!chatInput.trim()) setChatInput('') }} placeholder={focusedKey ? `当前聚焦在「${getLabel(focusedKey)}」，可以和我讲讲您想如何优化此部分呢？按Enter键发送` : '有什么想让我帮您优化的请和我讲哦～按Enter键发送'} disabled={chatLoading} rows={chatFocused ? 4 : 2} className="min-h-[36px] resize-none rounded-lg bg-muted/50 text-sm transition-all duration-200 placeholder:text-muted-foreground/40 focus-visible:ring-1 focus-visible:ring-border/60" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 2px 6px rgba(0,0,0,0.03)', maxHeight: '220px' }} /></div>
      )}
    </div>
  {/* 图片悬浮工具栏 */}
  {hoveredImagePos && ReactDOM.createPortal(
    <div data-img-toolbar style={{
      position: 'fixed',
      left: hoveredImagePos.left + hoveredImagePos.width / 2,
      top: Math.max(hoveredImagePos.top - 28, (document.querySelector('.center-scroll-area')?.getBoundingClientRect().top ?? 8) + 2),
      transform: 'translateX(-50%)',
      zIndex: 99999,
    }}>
      <div style={{
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(6px)',
        borderRadius: '10px',
        padding: '5px 8px',
        display: 'flex',
        gap: '3px',
        boxShadow: '0 3px 14px rgba(0,0,0,0.3)',
        alignItems: 'center',
      }}>

        <button onClick={() => handleCutCopyImage('cut')} title="剪切图片" style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#fff', padding: '5px', borderRadius: '6px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.15s',
        }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
           onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
          <svg width="18" height="18" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="4" cy="4" r="2.5"/><path d="M7 7 13 3"/><path d="M7 8 13 12"/><circle cx="4" cy="11" r="2.5"/>
          </svg>
        </button>
        <button onClick={() => handleCutCopyImage('copy')} title="复制图片" style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#fff', padding: '5px', borderRadius: '6px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.15s',
        }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
           onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
          <svg width="18" height="18" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3.5" y="3.5" width="10" height="10" rx="1" /><path d="M1.5 10.5V2a.5.5 0 01.5-.5h8" />
          </svg>
        </button>
        <button onClick={handlePasteImage} title="粘贴图片（到当前聚焦的模块）" style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: imageClipboardRef.current ? '#fff' : 'rgba(255,255,255,0.3)',
          padding: '5px', borderRadius: '6px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.15s',
          pointerEvents: imageClipboardRef.current ? 'auto' : 'none',
        }} onMouseEnter={e => { if (imageClipboardRef.current) e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}
           onMouseLeave={e => e.currentTarget.style.background = 'none'}>
          <svg width="18" height="18" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4.5 5.5V2.5a1 1 0 011-1h7a1 1 0 011 1v8a1 1 0 01-1 1h-3" />
            <rect x="1.5" y="5.5" width="8" height="8" rx="1" />
          </svg>
        </button>
        <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.2)', margin: '0 2px' }} />
        <button onClick={handleDeleteHoveredImage} title="删除图片" style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#ff6b6b', padding: '5px', borderRadius: '6px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.15s',
        }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,107,107,0.15)')}
           onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
          <svg width="18" height="18" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2.5 4.5h10M5.5 4.5V3a1 1 0 011-1h2a1 1 0 011 1v1.5M4.5 4.5l.5 8.5a1 1 0 001 1h3a1 1 0 001-1l.5-8.5" />
          </svg>
        </button>
      </div>
    </div>,
    document.body
  )}
  </div>)
}
