import { useRef, useCallback, useState, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyMedia, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import type { ModuleResult, GenerateStatus } from '@/types'

interface CenterPanelProps {
  status: GenerateStatus; modules: ModuleResult[]; mandatoryKeys: string[]
  onEdit: (moduleKey: string, content: string) => void; onReorder: (newOrder: string[]) => void
  onAddBlock: () => void; onDeleteBlock: (moduleKey: string) => void
  showToast: (msg: string, type?: 'info' | 'success' | 'error') => void
  triggerExpandHint?: number // 变化时触发文字扩充气泡
}

const MODULE_LABELS: Record<string, string> = { hook: '首屏钩子', price: '价格福利', taste: '口感体验', trust: '基础信任', aftercare: '物流售后', tips: '储存贴士', cta: '行动召唤', ingredient: '成分科普', origin: '原料溯源', brand: '品牌背书', scene: '场景共情', feedback: '用户反馈', comparison: '全网比价', faq: '常见问题' }
function getLabel(key: string): string { return MODULE_LABELS[key] || '自定义文本' }

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

// 骨架屏宽度池，模拟真实文本的错落感
const SKEL_WIDTHS = ['w-full', 'w-11/12', 'w-4/5', 'w-3/4', 'w-5/6', 'w-2/3', 'w-7/8', 'w-full', 'w-3/5', 'w-4/6']

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
function typewrite(finalContents: Record<string, string>, onEdit: (key: string, content: string) => void, onDone: () => void) {
  const keys = Object.keys(finalContents)
  if (keys.length === 0) { onDone(); return }
  const totalChars = keys.reduce((sum, k) => sum + finalContents[k].length, 0); const DURATION = Math.min(6000, Math.max(800, totalChars * 15)); const start = Date.now()
  const tick = () => {
    const progress = Math.min(1, (Date.now() - start) / DURATION)
    let allDone = true
    for (const k of keys) {
      const full = finalContents[k]; const n = Math.floor(full.length * progress)
      if (n < full.length) allDone = false
      onEdit(k, full.slice(0, n))
    }
    if (allDone) { keys.forEach(k => onEdit(k, autoStructure(finalContents[k]))); onDone() }
    else setTimeout(tick, 33)
  }
  setTimeout(tick, 33)
}

type HistoryEntry = { type: 'content'; key: string; content: string } | { type: 'order'; order: string[] }
let undoStack: HistoryEntry[] = []; let redoStack: HistoryEntry[] = []; const MAX_HISTORY = 100

export function CenterPanel({ status, modules, mandatoryKeys, onEdit, onReorder, onAddBlock, onDeleteBlock, showToast, triggerExpandHint }: CenterPanelProps) {
  const getModule = (key: string) => modules.find(m => m.moduleKey === key)
  const isIdle = status === 'idle'; const isBlocked = status === 'blocked'
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editorRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const focusedKeyRef = useRef<string | null>(null); const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const pendingActionKeyRef = useRef<string | null>(null) // 工具栏操作前暂存当前聚焦模块
  const composingRef = useRef(false)
  const lastSavedRef = useRef<Record<string, string>>({})
  const savePointRef = useRef<Record<string, string>>({})
  const [chatInput, setChatInput] = useState(''); const [chatLoading, setChatLoading] = useState(false); const chatLoadingRef = useRef(false)
  const chatRef = useRef<HTMLTextAreaElement>(null); const [chatFocused, setChatFocused] = useState(false)
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([])
  const [optimizingKeys, setOptimizingKeys] = useState<Set<string>>(new Set())

  useEffect(() => { chatLoadingRef.current = chatLoading }, [chatLoading])
  useEffect(() => { if (triggerExpandHint && triggerExpandHint > 0 && !localStorage.getItem('expand_hint_shown')) { showToast('💡 生成的文字过少了？请尝试点击「📝 扩充文案」试试', 'info'); localStorage.setItem('expand_hint_shown', '1') } }, [triggerExpandHint])
  useEffect(() => { if (composingRef.current) return; modules.forEach(mod => { const el = editorRefs.current[mod.moduleKey]; if (!el || !mod.content) return; if (lastSavedRef.current[mod.moduleKey] === mod.content) return; lastSavedRef.current[mod.moduleKey] = mod.content; el.innerHTML = mod.content }) }, [modules])

  const handleUndo = useCallback(() => { if (undoStack.length === 0) return; const entry = undoStack.pop()!; if (entry.type === 'content') { const mod = getModule(entry.key); const current = mod?.content || ''; redoStack.push({ type: 'content', key: entry.key, content: current }); delete lastSavedRef.current[entry.key]; onEdit(entry.key, entry.content) } else { redoStack.push({ type: 'order', order: [...mandatoryKeys] }); onReorder(entry.order) } }, [mandatoryKeys, getModule, onEdit, onReorder])
  const handleRedo = useCallback(() => { if (redoStack.length === 0) return; const entry = redoStack.pop()!; if (entry.type === 'content') { const mod = getModule(entry.key); const current = mod?.content || ''; undoStack.push({ type: 'content', key: entry.key, content: current }); delete lastSavedRef.current[entry.key]; onEdit(entry.key, entry.content) } else { undoStack.push({ type: 'order', order: [...mandatoryKeys] }); onReorder(entry.order) } }, [mandatoryKeys, getModule, onEdit, onReorder])
  const pushContentHistory = useCallback((key: string, oldContent: string) => { if (undoStack.length > 0) { const last = undoStack[undoStack.length - 1]; if (last.type === 'content' && last.key === key && last.content === oldContent) return } undoStack.push({ type: 'content', key, content: oldContent }); redoStack = []; if (undoStack.length > MAX_HISTORY) undoStack.shift() }, [])
  const handleEditorInput = useCallback((key: string) => { if (composingRef.current) return; const el = editorRefs.current[key]; if (!el) return; const newContent = el.innerHTML; const mod = getModule(key); const oldContent = mod?.content || ''; if (newContent !== oldContent) { pushContentHistory(key, oldContent); lastSavedRef.current[key] = newContent; onEdit(key, newContent) } }, [getModule, onEdit, pushContentHistory])
  const handleCompositionEnd = useCallback((key: string) => { composingRef.current = false; const el = editorRefs.current[key]; if (!el) return; const newContent = el.innerHTML; const mod = getModule(key); const oldContent = mod?.content || ''; if (newContent !== oldContent) { pushContentHistory(key, oldContent); lastSavedRef.current[key] = newContent; onEdit(key, newContent) } }, [getModule, onEdit, pushContentHistory])
  const handleInsertImage = useCallback(() => { fileInputRef.current?.click() }, [])
  const handleImagePicked = useCallback((e: React.ChangeEvent<HTMLInputElement>) => { const files = e.target.files; if (!files || files.length === 0) return; const key = pendingActionKeyRef.current || focusedKeyRef.current; if (!key) { showToast('请先点击一个编辑模块再插入图片', 'info'); e.target.value = ''; return }; const el = editorRefs.current[key]; if (!el) { e.target.value = ''; return }; el.focus(); const mod = getModule(key); if (mod) pushContentHistory(key, mod.content); let loaded = 0; Array.from(files).forEach(file => { const reader = new FileReader(); reader.onload = () => { loaded++; const img = `<img src="${reader.result}" alt="${file.name}" style="max-width:100%;border-radius:8px;margin:8px 0" />`; document.execCommand('insertHTML', false, img); if (loaded === files.length) onEdit(key, el.innerHTML) }; reader.readAsDataURL(file) }); e.target.value = '' }, [getModule, onEdit, pushContentHistory, showToast])
  const handleExportWord = useCallback(() => { const content = mandatoryKeys.map(key => getModule(key)?.content || '').filter(Boolean).join('<br>'); const body = content.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>'); const html = `<html><head><meta charset="utf-8"><style>body{font-family:'PingFang SC',sans-serif;line-height:1.8;padding:40px;white-space:pre-wrap}</style></head><body>${body}</body></html>`; const blob = new Blob([html], { type: 'application/msword' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '笔记定稿.doc'; a.click(); URL.revokeObjectURL(a.href) }, [mandatoryKeys, getModule])

  const handleChatSubmit = useCallback(async (instructionOverride?: string) => { const instruction = (instructionOverride || chatInput).trim(); if (!instruction || chatLoading || mandatoryKeys.length === 0) return;
  // 去除emoji：本地处理，不调 AI
  if (instruction === '__STRIP_EMOJI__') { setChatLoading(true); showToast('正在去除emoji...', 'info'); const targetModule = focusedKeyRef.current; const keys = targetModule ? [targetModule] : mandatoryKeys.filter(k => getModule(k)?.content); let changed = 0; keys.forEach(k => { const mod = getModule(k); if (!mod?.content) return; const stripped = mod.content.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}‍️]/gu, '').replace(/\s{2,}/g, ' ').trim(); if (stripped !== mod.content.replace(/<[^>]+>/g, '').trim()) { pushContentHistory(k, mod.content); delete lastSavedRef.current[k]; onEdit(k, stripped); changed++ } }); setChatLoading(false); showToast(changed > 0 ? `已去除 ${changed} 个模块的emoji` : '没有找到emoji', changed > 0 ? 'success' : 'info'); chatRef.current?.focus(); return }
  setChatInput(''); setChatLoading(true); showToast('AI 正在优化文案...', 'info'); const allModules = mandatoryKeys.map(key => { const mod = getModule(key); return { key, label: getLabel(key), content: mod?.content || '' } })
    // 模块定位：聚焦的模块优先，否则扫描指令中的关键词匹配模块 label
    const targetModule = focusedKeyRef.current || (() => { let best: { key: string; len: number } | null = null; for (const { key, label } of allModules) { if (instruction.includes(label) && label.length > (best?.len || 0)) { best = { key, len: label.length } } } return best?.key || null })()
    // 聚焦单模块时只发那一个模块给 AI，大幅节省 token
    const moduleList = targetModule ? allModules.filter(m => m.key === targetModule) : allModules
    const keysToOptimize = targetModule ? [targetModule] : mandatoryKeys.filter(k => getModule(k)?.content)
    setOptimizingKeys(new Set(keysToOptimize))
    console.log('[CenterPanel] targetModule:', targetModule, '| 发送模块:', moduleList.map(m => m.key).join(', '), '| 内容长度:', moduleList.map(m => m.key + ':' + (m.content?.replace(/<[^>]+>/g,'').length || 0)).join(', '))
    try { const response = await fetch('/api/chat/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instruction, modules: moduleList, history: chatHistory, targetModule }) }); if (!response.ok) throw new Error('API error'); const reader = response.body!.getReader(); const decoder = new TextDecoder(); let buf = ''; const contents: Record<string, string> = {}; let curMod = ''
      while (true) { const { done, value } = await reader.read(); if (done) break; buf += decoder.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop() || ''; for (const line of lines) { if (!line.startsWith('data: ')) continue; const d = line.slice(6); let p; try { p = JSON.parse(d) } catch { continue }; if (p.type === 'done') continue; if (p.type === 'text' && p.content) { contents[curMod] = (contents[curMod] || '') + p.content; const m = /===(\w+)===/.exec(contents[curMod] || ''); if (m) { const matchedKey = m[1]; const sentKeys = moduleList.map(m => m.key); if (matchedKey === 'SKIP' || sentKeys.includes(matchedKey) || (!targetModule && mandatoryKeys.includes(matchedKey))) { const idx = (contents[curMod] || '').indexOf(m[0]); const before = (contents[curMod] || '').slice(0, idx); const after = (contents[curMod] || '').slice(idx + m[0].length); const prevMod = curMod; if (before.trim()) contents[prevMod] = before; else delete contents[prevMod]; curMod = matchedKey; contents[curMod] = (contents[curMod] || '') + after } }
        if (contents['SKIP']) { showToast('抱歉，我仅支持帮您优化文案哦～'); setChatLoading(false); setOptimizingKeys(new Set()); chatRef.current?.focus(); return } } } }
      if (contents['SKIP']) { showToast('抱歉，我仅支持帮您优化文案哦～'); setChatLoading(false); setOptimizingKeys(new Set()); chatRef.current?.focus(); return }
      console.log('[CenterPanel] AI返回的模块:', Object.keys(contents).filter(k => k && contents[k]).join(', '))
      // 准备最终文案，用发送给 AI 的模块列表（而非中栏已有模块）来遍历
      const finalContents: Record<string, string> = {}; let hasChange = false
      const processKeys = [...new Set([...moduleList.map(m => m.key), ...mandatoryKeys])]
      processKeys.forEach(k => { if (contents[k] && (!targetModule || k === targetModule)) { const mod = getModule(k); const oldContent = mod?.content || ''; const oldPlain = oldContent.replace(/<[^>]+>/g, '').trim(); const newPlain = contents[k].replace(/===\w+===/g, '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim(); console.log(`[CenterPanel] 模块 ${k}: 原文${oldPlain.length}字 → 新文${newPlain.length}字${oldPlain === newPlain ? ' (未变化!)' : ''}`); console.log(`  原文预览: ${oldPlain.slice(0, 80)}`); console.log(`  新文预览: ${newPlain.slice(0, 80)}`); if (oldPlain !== newPlain) hasChange = true; if (oldContent) pushContentHistory(k, oldContent); delete lastSavedRef.current[k]; finalContents[k] = (() => { let t = contents[k].replace(/===\w+===/g, ''); t = t.replace(/(?:^|\n)\s*(?:["‘]?\s*(?:【[^】]*】|\[[^\]]*\]|---[^-]*---|\[文案\]|文案)\s*["’]?|===\w*===)\s*(?:<br\s*\/?>|\n)*/gi, '\n'); t = t.replace(/\[\]/g, ''); t = t.replace(/===\w*===/g, ''); t = t.replace(/^\[|\]$/gm, ''); t = t.replace(/^\]|\[$/gm, ''); t = t.replace(/<br\s*\/?>/gi, '\n').replace(/<\/tr>/gi, '\n').replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, ' / ').replace(/<[^>]+>/g, '').replace(/\[BR\]/g, '<br>').replace(/\n/g, '<br>'); t = t.replace(/^(<br\s*\/?>)+/i, '').trim(); return t })() } })
      // 去掉骨架屏，启动打字机效果
      setOptimizingKeys(new Set()); const successMsg = hasChange ? '优化成功' : '😭 我溜号了，再让我执行一次吧～'
      typewrite(finalContents, onEdit, () => { setChatLoading(false); showToast(successMsg, hasChange ? 'success' : 'info'); setChatHistory(prev => [...prev.slice(-4), { role: 'user', content: instruction }, { role: 'assistant', content: '已完成文案优化' }]); if (targetModule) { setFocusedKey(targetModule); focusedKeyRef.current = targetModule; setTimeout(() => editorRefs.current[targetModule]?.focus(), 50) } })
    } catch (e) { console.error('Chat error:', e); showToast('优化失败，请重试', 'error'); setOptimizingKeys(new Set()); setChatLoading(false) };
    setOptimizingKeys(new Set()); if (!targetModule) chatRef.current?.focus() }, [chatInput, chatLoading, mandatoryKeys, getModule, onEdit, pushContentHistory, showToast])
  const handleChatKeyDown = useCallback((e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSubmit() } }, [handleChatSubmit])

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(index)); const img = new Image(); img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; e.dataTransfer.setDragImage(img, 0, 0) }, [])
  const handleDrop = useCallback((e: React.DragEvent, targetIndex: number) => { e.preventDefault(); setDragOverIndex(null); const sourceIndex = Number(e.dataTransfer.getData('text/plain')); if (isNaN(sourceIndex) || sourceIndex === targetIndex) return; undoStack.push({ type: 'order', order: [...mandatoryKeys] }); redoStack = []; const newOrder = [...mandatoryKeys]; const [item] = newOrder.splice(sourceIndex, 1); newOrder.splice(targetIndex, 0, item); onReorder(newOrder) }, [mandatoryKeys, onReorder])

  return (<div className="flex flex-col h-full">
    <div className="flex-shrink-0 flex items-start gap-1 px-4 py-2.5 border-b border-border bg-white">
      <button className="flex flex-col items-center justify-center gap-1.5 rounded-lg h-[52px] w-[52px] text-[11px] leading-tight text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" onClick={handleUndo}><svg width="17" height="17" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3.5 5.5L1.5 7.5l2 2" /><path d="M1.5 7.5h8a4 4 0 010 8" /></svg><span>撤销</span></button>
      <button className="flex flex-col items-center justify-center gap-1.5 rounded-lg h-[52px] w-[52px] text-[11px] leading-tight text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" onClick={handleRedo}><svg width="17" height="17" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11.5 5.5L13.5 7.5l-2 2" /><path d="M13.5 7.5h-8a4 4 0 000 8" /></svg><span>重做</span></button>
      <label className="flex flex-col items-center justify-center gap-1.5 rounded-lg h-[52px] w-[52px] text-[11px] leading-tight text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer" onMouseDown={() => { pendingActionKeyRef.current = focusedKeyRef.current }}><svg width="17" height="17" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1.5" y="2.5" width="12" height="10" rx="1.5" /><circle cx="5" cy="6" r="1.25" /><path d="M1.5 11l3-3 3 3L10.5 7.5l3 3.5" /></svg><span>插入图片</span><input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImagePicked} /></label>
      <button className="flex flex-col items-center justify-center gap-1.5 rounded-lg h-[52px] w-[52px] text-[11px] leading-tight text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" onClick={onAddBlock}><svg width="17" height="17" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7.5 2v11M2 7.5h11" /></svg><span>文本块</span></button><button className="flex flex-col items-center justify-center gap-1.5 rounded-lg h-[52px] w-[52px] text-[11px] leading-tight text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors" onClick={() => { if (!confirm('确定清空所有编辑区文案吗？此操作可撤销。')) return; mandatoryKeys.forEach(k => { const mod = getModule(k); if (mod?.content && mod.content !== '<br>') { pushContentHistory(k, mod.content); delete lastSavedRef.current[k]; onEdit(k, '<br>') } }); showToast('已清空，可使用撤销恢复', 'info') }}><svg width="17" height="17" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2.5 4.5h10M5.5 4.5V3a1 1 0 011-1h2a1 1 0 011 1v1.5M4.5 4.5l.5 8.5a1 1 0 001 1h3a1 1 0 001-1l.5-8.5" /></svg><span>清空文案</span></button>
            <div className="flex-1" />
      <button className="flex flex-col items-center justify-center gap-1.5 rounded-lg h-[52px] w-[52px] text-[11px] leading-tight text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" onClick={() => { const content = mandatoryKeys.map(key => getModule(key)?.content || '').filter(Boolean).join('<br>'); const body = content.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>'); const w = window.open('', '_blank', 'width=420,height=780'); if (w) { w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0;box-sizing:border-box}html{scrollbar-width:none}html::-webkit-scrollbar{display:none}body{font-family:"PingFang SC",sans-serif;line-height:1.8;font-size:15px;color:#333;background:#fff}.top-img{width:100%;max-width:400px;display:block;margin:0 auto}.content{max-width:400px;margin:0 auto;padding:20px 16px;white-space:pre-wrap}.content img{max-width:100%;height:auto;border-radius:8px;margin:8px 0}.bottom-wrap{position:fixed;bottom:0;left:0;right:0;display:flex;justify-content:center}.bottom-img{width:100%;max-width:400px;display:block}.spacer{padding-bottom:100px}</style></head><body><img class="top-img" src="/docs/1.png"><div class="content">'+body+'</div><div class="spacer"></div><div class="bottom-wrap"><img class="bottom-img" src="/docs/2.png"></div></body></html>'); w.document.close() } }}><svg width="17" height="17" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="7.5" cy="7.5" r="2.5"/><path d="M2.5 7.5c0-2.8 2.2-5 5-5s5 2.2 5 5-2.2 5-5 5-5-2.2-5-5z"/><path d="M7.5 2.5v10"/></svg><span>预览</span></button><button className="flex flex-col items-center justify-center gap-1.5 rounded-lg h-[52px] w-[52px] text-[11px] leading-tight text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" onClick={handleExportWord}><svg width="17" height="17" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2.5 1.5h10a1 1 0 011 1v10a1 1 0 01-1 1h-10a1 1 0 01-1-1v-10a1 1 0 011-1zM4.5 4.5h6M4.5 7.5h6M4.5 10.5h4" /></svg><span>导出Word</span></button><button className="flex flex-col items-center justify-center gap-1.5 rounded-lg h-[52px] w-[52px] text-[11px] leading-tight bg-[#07C160] text-white hover:bg-[#06AD56] transition-colors font-medium"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg><span>去发布</span></button>
    </div>
    <div className={`center-scroll-area flex-1 overflow-y-auto ${isIdle || isBlocked ? 'flex items-center justify-center' : ''} ${chatLoading ? 'cursor-not-allowed' : ''}`} style={{ paddingBottom: chatFocused ? '180px' : '72px' }}>
      <div className="py-8 px-4 w-[92%] max-w-4xl mx-auto translate-x-[5px]">
        {isIdle && (<Empty><EmptyHeader><EmptyMedia variant="icon"><svg width="20" height="20" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7.5 1.5v5m0 0l-2-2m2 2l2-2M2.5 5.5v6a1 1 0 001 1h8a1 1 0 001-1v-6" /></svg></EmptyMedia><EmptyTitle>在左侧配置商品信息后开始生成</EmptyTitle><EmptyDescription>完成必填项后点击「一键生成」，AI 文案将出现在右栏，采纳后可在此编辑定稿</EmptyDescription></EmptyHeader></Empty>)}
        {isBlocked && (<Empty><EmptyHeader><EmptyMedia variant="icon"><svg width="20" height="20" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7.5 6.5v-4m0 0l-2 2m2-2l2 2M1.5 12.5l6-6 6 6" /></svg></EmptyMedia><EmptyTitle className="text-destructive">生成被阻断</EmptyTitle><EmptyDescription>检测到输入内容包含高危违规词，请修改后重试</EmptyDescription></EmptyHeader></Empty>)}
        {!isIdle && !isBlocked && (<div className={chatLoading ? 'pointer-events-none select-none' : ''}>{mandatoryKeys.map((key, index) => { const mod = getModule(key)
          return (<div key={key} onDragOver={e => { e.preventDefault(); setDragOverIndex(index) }} onDragLeave={() => setDragOverIndex(null)} onDrop={e => handleDrop(e, index)} className={`relative group ${index > 0 ? 'mt-8' : ''} transition-all duration-200 rounded-lg ${focusedKey === key ? 'ring-2 ring-primary/20 bg-primary/5 px-2 py-2 -mx-2 -my-2' : ''} ${dragOverIndex === index ? 'border-t-2 border-primary bg-primary/5 -mt-[2px]' : 'border-t-2 border-transparent'}`}>
            <div className="flex items-center justify-between mb-1"><div draggable onDragStart={e => handleDragStart(e, index)} onDragEnd={() => setDragOverIndex(null)} className={`inline-flex items-center gap-1 cursor-grab active:cursor-grabbing transition-colors rounded ${focusedKey === key ? 'text-primary' : 'text-muted-foreground/25 hover:text-muted-foreground/50'}`}><span className="text-xs select-none leading-none">⋮⋮</span><span className={`text-[11px] font-medium select-none leading-tight whitespace-nowrap ${focusedKey === key ? 'text-primary' : 'text-muted-foreground/30'}`}>{getLabel(key)}</span></div>
            <button onClick={() => { const m = getModule(key); if (m && m.content && m.content !== '<br>' && !confirm('确定删除？')) return; onDeleteBlock(key) }} className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity text-muted-foreground/30 hover:text-destructive"><svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2.5 4.5h10M5.5 4.5V3a1 1 0 011-1h2a1 1 0 011 1v1.5M4.5 4.5l.5 8.5a1 1 0 001 1h3a1 1 0 001-1l.5-8.5" /></svg></button></div>
            <div>{optimizingKeys.has(key) ? (<div key="skel" className="flex flex-col gap-2 py-0.5">{Array.from({ length: estimateLines(mod?.content || '') }, (_, i) => (<Skeleton key={i} className={`h-4 rounded ${SKEL_WIDTHS[i % SKEL_WIDTHS.length]}`} />))}</div>) : (<div key="editor" data-block-key={key} ref={el => { editorRefs.current[key] = el; if (el && mod && mod.content && mod.content !== '<br>' && el.innerHTML !== mod.content && !el.textContent?.trim()) el.innerHTML = mod.content }} contentEditable suppressContentEditableWarning data-placeholder="从右栏版本候选区点击「采纳」后，文案将出现在此处供编辑定稿" onFocus={() => { focusedKeyRef.current = key; setFocusedKey(key); savePointRef.current[key] = editorRefs.current[key]?.innerHTML || '' }} onCompositionStart={() => { composingRef.current = true }} onCompositionEnd={() => handleCompositionEnd(key)} onInput={() => handleEditorInput(key)} onBlur={() => { setTimeout(() => { if (chatLoadingRef.current) return; const ae = document.activeElement; if (ae !== chatRef.current && focusedKeyRef.current === key) { setFocusedKey(null); focusedKeyRef.current = null } }, 120) }} className="text-base leading-relaxed outline-none text-justify empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/40 empty:before:italic" style={{ lineHeight: '1.7' }} />)}</div>
          </div>)})}</div>)}
      </div>
    </div>
    <div className="flex-shrink-0 h-10 pointer-events-none" style={{ background: 'linear-gradient(to top, #ffffff, transparent)', marginTop: '-2.5rem', position: 'relative', zIndex: 1 }} />
    <div className="flex-shrink-0 bg-white px-4 py-3" style={{ boxShadow: '0 -6px 16px rgba(0,0,0,0.04), 0 -2px 4px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.04)' }}>
      <div className="flex items-center gap-1.5 mb-2 overflow-x-auto"><span className="text-[11px] text-muted-foreground/60 shrink-0 mr-0.5">帮我改：</span>{[{ label: '👭 闺蜜风', instruction: '改写为日常闺蜜风（按系统指令中的闺蜜风各模块写作规则执行）', cls: 'bg-pink-50 text-pink-700 border border-pink-200 hover:bg-pink-100', tip: '像跟闺蜜聊天一样轻松推荐' },{ label: '📋 简约风', instruction: '改写为简约功能风（按系统指令中的简约风各模块写作规则执行）', cls: 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100', tip: '零emoji纯文字，极简参数风格' },{ label: '🤪 趣味风', instruction: '改写为趣味风（按系统指令中的趣味风各模块写作规则执行）', cls: 'bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100', tip: '脱口秀段子手，夸张幽默反差' },{ label: '✨ 高端风', instruction: '改写为高端大气风（按系统指令中的高端风各模块写作规则执行）', cls: 'bg-stone-50 text-stone-700 border border-stone-200 hover:bg-stone-100', tip: '一句一段，留白美学，不提价格' },{ label: '📝 扩充文案', instruction: '文字扩充（篇幅翻倍）', cls: 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100', tip: '篇幅翻倍，丰富细节和场景描写' },{ label: '✨ 增加emoji', instruction: '增加emoji（只加emoji不改文字不改排版，仅插入emoji）', cls: 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 hover:text-amber-800', tip: '只加emoji不改文字，大胆穿插叠加' },{ label: '🚫 去除emoji', instruction: '__STRIP_EMOJI__', cls: 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100', tip: '一键过滤所有emoji，保留纯文字' },{ label: '结构化排版', instruction: '结构化排版（只调整换行和分段，不改任何文字和emoji）', cls: 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground', tip: '智能分段换行，不改任何文字内容' },{ label: '强化卖点', instruction: '强化卖点', cls: 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground', tip: '放大价格优势和差异化亮点' },{ label: '口语化改写', instruction: '口语化改写', cls: 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground', tip: '书面语转口语，像在跟朋友聊天' }].map(item => (<Tooltip key={item.label} text={item.tip}><button disabled={chatLoading} onClick={() => handleChatSubmit(item.instruction)} className={`shrink-0 rounded-full px-3 py-1 text-[11px] active:scale-95 transition-all duration-150 ${chatLoading ? 'opacity-40 cursor-not-allowed' : item.cls}`}>{item.label}</button></Tooltip>))}</div>
      <Textarea ref={chatRef} value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={handleChatKeyDown} onFocus={() => setChatFocused(true)} onBlur={() => { setChatFocused(false); if (!chatInput.trim()) setChatInput('') }} placeholder={focusedKey ? `当前聚焦在「${getLabel(focusedKey)}」，可以和我讲讲您想如何优化此部分呢？按Enter键发送` : '有什么想让我帮您优化的请和我讲哦～按Enter键发送'} disabled={chatLoading} rows={chatFocused ? 4 : 2} className="min-h-[36px] resize-none rounded-lg bg-muted/50 text-sm transition-all duration-200 placeholder:text-muted-foreground/40 focus-visible:ring-1 focus-visible:ring-border/60" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 2px 6px rgba(0,0,0,0.03)', maxHeight: '220px' }} />
    </div>
  </div>)
}
