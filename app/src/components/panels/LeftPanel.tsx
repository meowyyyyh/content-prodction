import { useState, useCallback, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from '@/components/ui/select'
import type { ProductInput, SubCategory, ShippingTimeliness, ShelfLifeUnit, ClassifiedImage } from '@/types'
import { CATEGORIES } from '@/data/categories'
import { MODULE_CONFIG, STYLE_CONFIG, SUB_CATEGORY_CONFIG, SHIPPING_OPTIONS } from '@/config/modules'

interface LeftPanelProps { input: ProductInput; onChange: (input: ProductInput) => void; disabled: boolean; isGenerating: boolean; onGenerate: () => void; hasRequiredFields: boolean; priceDialogOpen: boolean; setPriceDialogOpen: (v: boolean) => void; platforms: { name: string; price: string; spec: string; enabled: boolean }[]; setPlatforms: (v: { name: string; price: string; spec: string; enabled: boolean }[]) => void; priceNotes: string; setPriceNotes: (v: string) => void; classifiedImages: ClassifiedImage[]; onImagesClassified: (images: ClassifiedImage[]) => void; onFileRegistered?: (id: string, file: File) => void }
interface FormErrors { productName?: string; subCategory?: string; netWeight?: string; suggestedPrice?: string; afterSalesRules?: string }

const SHELF_LIFE_UNITS: { key: ShelfLifeUnit; label: string }[] = [{ key: 'day', label: '天' }, { key: 'month', label: '月' }, { key: 'year', label: '年' }]
const FIELD_LABELS: Record<string, string> = { productName: '商品名称', subCategory: '二级子品类', netWeight: '规格净含量', origin: '产地', suggestedPrice: '建议售价', sellingPoints: '核心卖点', coreIngredients: '核心配料/原料', shippingOrigin: '发货地', shippingTimeliness: '发货时效', courier: '快递公司', afterSalesRules: '售后规则', brandBackground: '品牌背景', targetAudience: '适用人群', usageScene: '使用场景', shelfLifeValue: '保质期' }

export function LeftPanel({ input, onChange, disabled, isGenerating, onGenerate, priceDialogOpen, setPriceDialogOpen, platforms, setPlatforms, priceNotes, setPriceNotes, classifiedImages, onImagesClassified, onFileRegistered }: LeftPanelProps) {
  const [aiOpen, setAiOpen] = useState(true); const [categoryOpen, setCategoryOpen] = useState(true); const [productOpen, setProductOpen] = useState(true); const [fileTab, setFileTab] = useState('upload'); const [pasteText, setPasteText] = useState(''); const [extractLoading, setExtractLoading] = useState(false); const fileInputRef = useRef<HTMLInputElement>(null)
  // 图片分类
  type ImageFile = { id: string; file: File; status: 'pending' | 'compressing' | 'classifying' | 'done' | 'error'; error?: string; type?: string; desc?: string; preview?: string }
  const [imageFiles, setImageFiles] = useState<ImageFile[]>([]); const [imageClassifyLoading, setImageClassifyLoading] = useState(false); const [classifyProgress, setClassifyProgress] = useState<{ done: number; total: number } | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [errors, setErrors] = useState<FormErrors>({}); const [dragIndex, setDragIndex] = useState<number | null>(null)
  // 文件上传解析
  type UploadFile = { id: string; file: File; status: 'pending' | 'parsing' | 'done' | 'error'; text?: string; error?: string }
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]); const [parseLoading, setParseLoading] = useState(false)
  const [extractedFields, setExtractedFields] = useState<Record<string, string> | null>(null); const [confirmOpen, setConfirmOpen] = useState(false); const [dragOver, setDragOver] = useState(false)
  const addFiles = (files: FileList | File[]) => { const arr = Array.from(files); const valid = arr.filter(f => /\.(docx?|txt|xlsx?|csv|pdf)$/i.test(f.name) || f.type.includes('text') || f.type.includes('pdf') || f.type.includes('spreadsheet') || f.type.includes('document')); if (valid.length === 0) return; setUploadFiles(prev => [...prev, ...valid.map(f => ({ id: Date.now().toString(36)+Math.random().toString(36).slice(2), file: f, status: 'pending' as const }))]) }
  const removeFile = (id: string) => setUploadFiles(prev => prev.filter(f => f.id !== id))
  const parseFile = async (uf: UploadFile): Promise<string> => { const { file } = uf; const name = file.name.toLowerCase()
    try { if (name.endsWith('.docx')) { const mammoth = await import('mammoth'); const buf = await file.arrayBuffer(); const r = await mammoth.extractRawText({ arrayBuffer: buf }); return r.value }
      else if (name.endsWith('.xlsx') || name.endsWith('.xls')) { const XLSX = await import('xlsx'); const buf = await file.arrayBuffer(); const wb = XLSX.read(buf, { type: 'array' }); return wb.SheetNames.map(sn => XLSX.utils.sheet_to_csv(wb.Sheets[sn])).join('\n') }
      else if (name.endsWith('.csv')) { return await file.text() }
      else if (name.endsWith('.pdf')) { const text = await file.text(); if (text.trim().length > 0) return text; throw new Error('PDF 为纯图片格式，请使用文本粘贴手动录入') }
      else { return await file.text() }
    } catch (e: any) { throw new Error(e.message || '解析失败') } }
  const handleParseAll = async () => { if (uploadFiles.length === 0 || parseLoading) return; setParseLoading(true); const allText: string[] = []
    for (const uf of uploadFiles) { setUploadFiles(prev => prev.map(f => f.id === uf.id ? { ...f, status: 'parsing' as const } : f)); try { const t = await parseFile(uf); allText.push(`--- ${uf.file?.name || '(未知)'} ---\n${t}`); setUploadFiles(prev => prev.map(f => f.id === uf.id ? { ...f, status: 'done' as const, text: t } : f)) } catch (e: any) { setUploadFiles(prev => prev.map(f => f.id === uf.id ? { ...f, status: 'error' as const, error: e.message } : f)) } }
    const combined = allText.join('\n\n').slice(0, 8000)
    if (combined.trim()) { try { const res = await fetch('/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: combined }) }); const d = await res.json(); if (d.success && d.data) { setExtractedFields(d.data); setConfirmOpen(true) } } catch { } }
    setParseLoading(false) }
  const [polishLoading, setPolishLoading] = useState(false); const [polished, setPolished] = useState(false); const prePolishRef = useRef('')
  const hasConfiguredPlatforms = platforms.some(p => p.enabled && p.price.trim())
  const [localOrigins, setLocalOrigins] = useState<string[]>(() => { return (input.origin || '').split('\n').filter(Boolean) })
  const moduleOrder = input.moduleOrder

  const updateField = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) => { if (['productName','netWeight','suggestedPrice','afterSalesRules'].includes(key as string)) setErrors(prev => ({ ...prev, [key]: undefined })); onChange({ ...input, [key]: value }) }
  const fieldCls = 'flex flex-col gap-1.5'

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => { setDragIndex(index); e.dataTransfer.effectAllowed = 'move'; const img = new Image(); img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; e.dataTransfer.setDragImage(img, 0, 0) }, [])
  const handleDragOver = useCallback((e: React.DragEvent, index: number) => { e.preventDefault(); if (dragIndex === null || dragIndex === index) return; const newOrder = [...moduleOrder]; const [item] = newOrder.splice(dragIndex, 1); newOrder.splice(index, 0, item); setDragIndex(index); const sel = input.selectedModules.filter(k => newOrder.includes(k)); sel.sort((a, b) => newOrder.indexOf(a) - newOrder.indexOf(b)); onChange({ ...input, moduleOrder: newOrder, selectedModules: sel }) }, [dragIndex, moduleOrder, input, onChange])
  const handleDragEnd = useCallback(() => { setDragIndex(null) }, [])

  const handleGenerate = () => { const newErrors: FormErrors = {}; if (!input.productName.trim()) newErrors.productName = '请输入商品名称'; if (!input.netWeight.trim()) newErrors.netWeight = '请输入规格净含量'; if (!input.suggestedPrice.trim()) newErrors.suggestedPrice = '请输入建议售价'; if (!input.afterSalesRules.trim()) newErrors.afterSalesRules = '请输入售后规则'; if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return }; onGenerate() }

  const handleExtractInfo = async () => { const text = pasteText.trim(); if (!text || extractLoading) return; setExtractLoading(true); try { const res = await fetch('/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }); const d = await res.json(); if (d.success && d.data) { const r = d.data; const updated = { ...input, ...(r.productName ? { productName: String(r.productName) } : {}), ...(r.subCategory ? { subCategory: ['dairy','snack','fresh_fruit','grain_oil','other'].includes(r.subCategory) ? r.subCategory : input.subCategory } : {}), ...(r.netWeight ? { netWeight: String(r.netWeight) } : {}), ...(r.origin ? { origin: String(r.origin) } : {}), ...(r.suggestedPrice ? { suggestedPrice: String(r.suggestedPrice) } : {}), ...(r.sellingPoints ? { sellingPoints: String(r.sellingPoints) } : {}), ...(r.coreIngredients ? { coreIngredients: String(r.coreIngredients) } : {}), ...(r.shippingTimeliness && ['24h','48h','72h','7d','custom'].includes(r.shippingTimeliness) ? { shippingTimeliness: r.shippingTimeliness } : {}), ...(r.courier ? { courier: String(r.courier) } : {}), ...(r.afterSalesRules ? { afterSalesRules: String(r.afterSalesRules) } : {}), ...(r.brandBackground ? { brandBackground: String(r.brandBackground) } : {}), ...(r.targetAudience ? { targetAudience: String(r.targetAudience) } : {}), ...(r.usageScene ? { usageScene: String(r.usageScene) } : {}), }; onChange(updated) } } catch(e) {} setExtractLoading(false) }

  // 图片压缩（浏览器端，canvas，目标 512px 宽）
  const compressImage = (file: File): Promise<{ base64: string; mimeType: string }> => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const maxW = 512
        const scale = Math.min(1, maxW / img.width)
        const w = Math.round(img.width * scale); const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')!; ctx.drawImage(img, 0, 0, w, h)
        const outputType = file.type === 'image/gif' ? 'image/png' : (file.type || 'image/jpeg'); resolve({ base64: canvas.toDataURL(outputType, 0.8).split(',')[1], mimeType: outputType })
      }
      img.onerror = () => reject(new Error('图片加载失败'))
      img.src = reader.result as string
    }
    reader.onerror = () => reject(new Error('读取失败'))
    reader.readAsDataURL(file)
  })

  // 图片上传 + 分类（并行批量）
  const handleImageClassify = async () => {
    if (imageFiles.length === 0 || imageClassifyLoading) return
    setImageClassifyLoading(true)
    const pending = imageFiles.filter(f => f.status === 'pending')
    setClassifyProgress({ done: 0, total: pending.length })

    // 并行压缩，收集 preview
    setImageFiles(prev => prev.map(f => pending.some(p => p.id === f.id) ? { ...f, status: 'compressing' } : f))
    const compressResults = await Promise.allSettled(pending.map(async f => {
      const c = await compressImage(f.file)
      const preview = `data:${c.mimeType};base64,${c.base64}`
      setImageFiles(prev => prev.map(p => p.id === f.id ? { ...p, preview, status: 'classifying' } : p))
      return { id: f.id, preview, mimeType: c.mimeType, base64: c.base64 }
    }))
    const compressed = compressResults.filter((r): r is PromiseFulfilledResult<{id:string;preview:string;mimeType:string;base64:string}> => r.status === 'fulfilled').map(r => r.value)
    // 处理失败的压缩
    compressResults.filter(r => r.status === 'rejected').forEach(r => {
      // 找出失败的文件 ID 并标记 error（兜底：所有 classifying 变 error）
    })
    if (compressed.length === 0) { setImageClassifyLoading(false); setClassifyProgress(null); return }

    // 并行调分类 API
    try {
      const res = await fetch('/api/images/classify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images: compressed }) })
      const d = await res.json()
      if (d.success && d.data?.results) {
        const results = d.data.results as Array<{id:string;type:string;desc:string}>
        // 更新 imageFiles 状态
        setImageFiles(prev => prev.map(f => {
          const r = results.find(rr => String(rr.id) === String(f.id))
          return r ? { ...f, status: 'done' as const, type: r.type, desc: r.desc } : f
        }))
        // 合并 + 上报
        const newImages = results.map(r => {
          const c = compressed.find(cp => String(cp.id) === String(r.id))
          return { id: r.id, type: r.type, desc: r.desc || '', layout_role: r.layout_role || 'detail', preview: c?.preview || '' }
        }).filter(ci => ci.preview)
        const allClassified = new Map(classifiedImages.map(c => [c.id, c]))
        newImages.forEach(c => allClassified.set(c.id, c))
        onImagesClassified([...allClassified.values()])
      }
      setClassifyProgress({ done: pending.length, total: pending.length })
    } catch (e: any) {
      setImageFiles(prev => prev.map(f => f.status === 'classifying' ? { ...f, status: 'error' as const, error: 'API 请求失败' } : f))
    }
    setImageClassifyLoading(false)
    setTimeout(() => setClassifyProgress(null), 1500)
  }

  const addImages = (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (arr.length === 0) return
    setImageFiles(prev => [...prev, ...arr.map(f => {
      const id = Date.now().toString(36)+Math.random().toString(36).slice(2)
      onFileRegistered?.(id, f)
      return { id, file: f, status: 'pending' as const }
    })])
  }
  const removeImage = (id: string) => setImageFiles(prev => prev.filter(f => f.id !== id))
  
  const handlePolishSellingPoints = async () => { const text = input.sellingPoints.trim(); if (!text || polishLoading) return; prePolishRef.current = text; setPolishLoading(true); try { const res = await fetch('/api/chat/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instruction: '请优化以下商品的核心卖点，让每条卖点更吸引人、更有说服力、表述更清晰。保持每行一条的格式，不要合并成段落，不要添加任何标题或前缀。', modules: [{ key: 'hook', label: '核心卖点', content: '商品名：' + input.productName + '\n当前卖点：\n' + text }] }) }); const reader = res.body!.getReader(); const decoder = new TextDecoder(); let buf = ''; let result = ''; while (true) { const { done, value } = await reader.read(); if (done) break; buf += decoder.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop() || ''; for (const line of lines) { if (!line.startsWith('data: ')) continue; const d = line.slice(6); let p; try { p = JSON.parse(d) } catch { continue }; if (p.type === 'text' && p.content) result += p.content } }; const cleaned = result.replace(/===\w+===/g, '').replace(/^#{1,3}\s*核心卖点\s*$/gm, '').trim(); if (cleaned && cleaned !== text) { updateField('sellingPoints', cleaned); setPolished(true) } } catch { } setPolishLoading(false) }

  return (<div className="flex flex-col h-full"><div className="flex flex-col flex-1 min-h-0 overflow-y-auto px-4 pt-3 gap-2">
    {/* AI自动分析商品信息 */}
    <Collapsible open={aiOpen} onOpenChange={setAiOpen}><CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors">AI自动分析商品信息<svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" className={'shrink-0 text-muted-foreground transition-transform duration-200 ' + (aiOpen ? 'rotate-90' : '')}><path d="M5.5 2.5l5 5-5 5" /></svg></CollapsibleTrigger><CollapsibleContent className="pt-2">
      <div className="flex flex-col gap-2">
        <div className="flex items-center rounded-lg bg-muted p-0.5"><button onClick={() => setFileTab('upload')} className={"flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200 " + (fileTab === 'upload' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground')}>上传文件</button><button onClick={() => setFileTab('paste')} className={"flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200 " + (fileTab === 'paste' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground')}>文本识别</button></div>
        {fileTab === 'upload' ? (<div className="flex flex-col gap-2" onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }} onDragLeave={e => { e.preventDefault(); const rect = e.currentTarget.getBoundingClientRect(); const { clientX, clientY } = e; if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) setDragOver(false) }} onDrop={e => { e.preventDefault(); e.stopPropagation(); setDragOver(false); if (e.dataTransfer.files) { const files = e.dataTransfer.files; const imgs = []; const docs = []; Array.from(files).forEach(f => { f.type.startsWith('image/') ? imgs.push(f) : docs.push(f) }); if (imgs.length > 0) addImages(imgs); if (docs.length > 0) addFiles(docs) } }}><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">请上传需要解析和排版的图片文件</span>{imageFiles.length + uploadFiles.length > 0 && <span className="text-[10px] text-muted-foreground/60">{imageFiles.length + uploadFiles.length} 个文件</span>}<input ref={fileInputRef} type="file" className="hidden" accept="image/*,.doc,.docx,.txt,.xlsx,.xls,.csv,.pdf" multiple onChange={e => { if (!e.target.files) return; const imgs: File[] = []; const docs: File[] = []; Array.from(e.target.files).forEach(f => { f.type.startsWith('image/') ? imgs.push(f) : docs.push(f) }); if (imgs.length > 0) addImages(imgs); if (docs.length > 0) addFiles(docs); e.target.value = '' }} /></div>
  {/* 文件滚动区 */}
  {(imageFiles.length > 0 || uploadFiles.length > 0) ? (<div style={{maxHeight: Math.min(192 + Math.max(0, (imageFiles.length + uploadFiles.length) - 2) * 12, 384) + 'px', minHeight: '192px'}} className={`flex flex-col gap-1.5 overflow-y-auto rounded-lg border p-2 transition-colors ${dragOver ? 'border-[#07C160] bg-emerald-50/30' : 'border-border/50 bg-muted/20'}`}>
    {/* 文档优先 */}
    {uploadFiles.length > 0 && (<>{uploadFiles.map(uf => (<div key={uf.id} className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs shrink-0 ${uf.status === 'error' ? 'border-red-200 bg-red-50' : uf.status === 'done' ? 'border-emerald-200 bg-emerald-50' : 'border-border bg-card'}`}><span className="shrink-0 text-base">📄</span><span className="flex-1 truncate font-medium">{uf.file?.name || '(未知)'}</span><span className="text-[10px] text-muted-foreground shrink-0">{((uf.file?.size || 0) / 1024).toFixed(1)}KB</span>{uf.status === 'parsing' && <span className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent shrink-0" />}{uf.status === 'done' && <svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke="#07C160" strokeWidth="1.5" className="shrink-0"><path d="M4.5 7.5l2 2 4-4"/></svg>}{uf.status === 'error' && <span className="text-[10px] text-red-500 shrink-0">{uf.error || '解析失败'}</span>}<button onClick={() => removeFile(uf.id)} className="text-muted-foreground/30 hover:text-destructive shrink-0"><svg width="12" height="12" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3.5 3.5l8 8M11.5 3.5l-8 8"/></svg></button></div>))}</>)}
    {/* 图片在下方 — 九宫格 */}
    {imageFiles.length > 0 && (
      <div className="grid grid-cols-3 gap-2 mt-2">
        {imageFiles.map((f, i) => (
          <div key={f.id} className={`relative rounded-md border overflow-hidden ${f.status === 'error' ? 'border-red-200 bg-red-50' : f.status === 'done' ? 'border-emerald-200 bg-emerald-50/40' : 'border-border bg-card'}`}>
            {/* 图片区域 */}
            <div className="relative aspect-square cursor-pointer overflow-hidden group"
                 draggable
                 onDragStart={e => {
                   const url = f.preview || (f.file && URL.createObjectURL(f.file));
                   if (url) { (window as any).__dragImageData__ = { src: url, alt: f.desc || f.file?.name || '' }; e.dataTransfer.setData('text/plain', 'x') }
                 }}
                 onClick={() => { const url = f.preview || (f.file && URL.createObjectURL(f.file)); if (url) setPreviewUrl(url) }}>
              {f.preview ? <img src={f.preview} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full bg-muted flex items-center justify-center text-[10px] text-muted-foreground">图{i+1}</div>}
              {/* 标签 — 左上 */}
              {f.status === 'done' && <span className="absolute top-1 left-1 text-[10px] px-1 py-0.5 rounded bg-white/90 border border-emerald-200 text-emerald-700 leading-tight">{f.type}</span>}
              {/* 删除按钮 — 右上 */}
              <button onClick={e => { e.stopPropagation(); removeImage(f.id) }} className="absolute top-1 right-1 size-5 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500">
                <svg width="12" height="12" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3.5 3.5l8 8M11.5 3.5l-8 8"/></svg>
              </button>
              {/* 状态覆盖层 */}
              {f.status === 'pending' && <div className="absolute inset-0 bg-black/20 flex items-center justify-center"><span className="text-[10px] text-white bg-black/50 px-1.5 py-0.5 rounded">等待分析</span></div>}
              {f.status === 'compressing' && <div className="absolute inset-0 bg-black/20 flex items-center justify-center"><span className="text-[10px] text-white bg-black/50 px-1.5 py-0.5 rounded">压缩中</span></div>}
              {f.status === 'classifying' && <div className="absolute inset-0 bg-black/20 flex items-center justify-center"><span className="inline-block size-4 animate-spin rounded-full border-2 border-white border-t-transparent" /></div>}
              {f.status === 'error' && <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center"><span className="text-[10px] text-red-600 bg-white/90 px-1.5 py-0.5 rounded">{f.error || '失败'}</span></div>}
            </div>
            {/* 文件名在下 */}
            <div className="px-1.5 py-1">
              <p className="text-[10px] text-muted-foreground truncate leading-tight">{f.file?.name || '(未知)'}</p>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>) : (<div className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card py-8 px-4 cursor-pointer transition-colors hover:border-muted-foreground/30" onClick={() => fileInputRef.current?.click()} style={dragOver ? { borderColor: '#07C160', backgroundColor: 'hsl(160 60% 35% / 0.08)' } : undefined}><div className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/80 transition-colors"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7.5 1.5v8m0 0l-2-2m2 2l2-2M2.5 7.5v4a1 1 0 001 1h8a1 1 0 001-1v-4"/></svg>{dragOver ? '松手即可上传' : '上传文件或拖拽至此'}</div><p className="text-[11px] text-muted-foreground/60">支持图片（JPG/PNG/WebP）+ 文档（Word/Excel/CSV/PDF），可多选拖拽</p></div>)}
  {/* 底部操作栏 */}
  {imageFiles.length + uploadFiles.length > 0 && (<div className="flex flex-col gap-2"><div className="flex items-center gap-2"><button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"><svg width="11" height="11" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7.5 2v11M2 7.5h11"/></svg>新增文件</button><div className="flex-1" /><button onClick={() => { if (confirm("确定要删除所有已上传的文件吗？")) { setUploadFiles([]); setImageFiles([]) } }} className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] text-red-400 hover:text-red-600 hover:bg-red-50/50 transition-colors"><svg width="11" height="11" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2.5 4.5h10M5.5 4.5V3a1 1 0 011-1h2a1 1 0 011 1v1.5M4.5 4.5l.5 8.5a1 1 0 001 1h3a1 1 0 001-1l.5-8.5"/></svg>全部删除</button></div><button onClick={() => { handleParseAll(); handleImageClassify() }} disabled={parseLoading || imageClassifyLoading} className="ai-glow-btn ai-glow-btn--active w-full rounded-full flex items-center justify-center gap-2 text-xs px-4 py-2.5 disabled:opacity-40">{parseLoading || imageClassifyLoading ? <><span className="inline-block size-3.5 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground/60" />分析中{classifyProgress ? ` ${classifyProgress.done}/${classifyProgress.total}` : '...'} {classifyProgress && classifyProgress.done > 0 ? `· 约${Math.max(1, Math.round((classifyProgress.total - classifyProgress.done) * 7))}s` : ''}</> : '立即分析'}</button></div>)}</div>) : fileTab === 'paste' ? (<div className="flex flex-col gap-2"><Textarea rows={6} placeholder="在此粘贴商品资料文本，AI将自动识别并提取关键字段" value={pasteText} onChange={e => setPasteText(e.target.value)} className="text-xs" /><button onClick={handleExtractInfo} disabled={extractLoading || !pasteText.trim()} className="flex items-center justify-center gap-1.5 rounded-md bg-[#07C160] hover:bg-[#06AD56] disabled:opacity-50 text-white text-xs font-medium py-2 px-4 transition-colors">{extractLoading ? (<><span className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent"/>AI正在提取...</>) : (<><svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7.5 1.5L9.5 5l4 .5-3 3 1 4.5-3.5-2-3.5 2 1-4.5-3-3 4-.5 2-3.5z"/></svg>AI 智能提取</>)}</button></div>) : null}
      </div>
    </CollapsibleContent></Collapsible>

    {/* 类目选择 — 三级联动 */}
    <Collapsible open={categoryOpen} onOpenChange={setCategoryOpen}><CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors">类目选择<svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" className={'shrink-0 text-muted-foreground transition-transform duration-200 ' + (categoryOpen ? 'rotate-90' : '')}><path d="M5.5 2.5l5 5-5 5" /></svg></CollapsibleTrigger><CollapsibleContent className="pt-2"><Card><CardContent className="p-4"><div className="flex flex-col gap-3">
      <div className={fieldCls}><Label className="text-xs text-muted-foreground">一级类目</Label><Select value={input.catLevel1} onValueChange={v => { onChange({ ...input, catLevel1: v, catLevel2: '', catLevel3: '' }) }}><SelectTrigger className="h-8 text-sm"><span>{input.catLevel1 || '请选择'}</span></SelectTrigger><SelectContent><SelectGroup>{CATEGORIES.level1s.map(l1 => <SelectItem key={l1} value={l1}>{l1}</SelectItem>)}</SelectGroup></SelectContent></Select></div>
      {input.catLevel1 && <div className={fieldCls}><Label className="text-xs text-muted-foreground">二级类目</Label><Select value={input.catLevel2} onValueChange={v => { onChange({ ...input, catLevel2: v, catLevel3: '' }) }}><SelectTrigger className="h-8 text-sm"><span>{input.catLevel2 || '请选择'}</span></SelectTrigger><SelectContent><SelectGroup>{(CATEGORIES.byLevel1[input.catLevel1]?.level2s || []).map(l2 => <SelectItem key={l2} value={l2}>{l2}</SelectItem>)}</SelectGroup></SelectContent></Select></div>}
      {input.catLevel1 && input.catLevel2 && <div className={fieldCls}><Label className="text-xs text-muted-foreground">三级类目</Label><Select value={input.catLevel3} onValueChange={v => { onChange({ ...input, catLevel3: v }) }}><SelectTrigger className="h-8 text-sm"><span>{input.catLevel3 || '请选择'}</span></SelectTrigger><SelectContent><SelectGroup>{(CATEGORIES.byLevel1[input.catLevel1]?.byLevel2[input.catLevel2] || []).map(l3 => <SelectItem key={l3} value={l3}>{l3}</SelectItem>)}</SelectGroup></SelectContent></Select></div>}
    </div></CardContent></Card></CollapsibleContent></Collapsible>

    {/* 商品信息 */}
    <Collapsible open={productOpen} onOpenChange={setProductOpen}><CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors">商品信息<svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" className={'shrink-0 text-muted-foreground transition-transform duration-200 ' + (productOpen ? 'rotate-90' : '')}><path d="M5.5 2.5l5 5-5 5" /></svg></CollapsibleTrigger><CollapsibleContent className="pt-2">
      <div className="flex flex-col gap-4">
        <Card><CardHeader className="pb-3"><CardTitle className="text-sm">基础商品信息</CardTitle></CardHeader><CardContent><div className="flex flex-col gap-4">
          <div className={fieldCls}><Label htmlFor="productName" className="text-sm">商品名称 <span className="text-destructive">*</span></Label><Input id="productName" placeholder="例：认养一头牛每日吨吨木姜子香茅酸奶" value={input.productName} onChange={e => updateField('productName', e.target.value)} disabled={disabled} aria-invalid={!!errors.productName} />{errors.productName && <p className="text-xs text-destructive">{errors.productName}</p>}</div>
<div className={fieldCls}><Label htmlFor="netWeight" className="text-sm">规格净含量 <span className="text-destructive">*</span></Label><Textarea id="netWeight" placeholder="例：200g×12瓶" rows={1} value={input.netWeight} onChange={e => { updateField('netWeight', e.target.value); const el = e.target; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px' }} disabled={disabled} aria-invalid={!!errors.netWeight} className="resize-none overflow-hidden" />{errors.netWeight && <p className="text-xs text-destructive">{errors.netWeight}</p>}</div>
          <div className={fieldCls}><div className="flex items-center justify-between"><Label className="text-sm">产地</Label>{localOrigins.length < 6 && (<button type="button" onClick={(e) => { e.stopPropagation(); const no = [...localOrigins, '']; setLocalOrigins(no); updateField('origin', no.join('\n')) }} disabled={disabled} className="text-xs text-muted-foreground hover:text-[#07C160] disabled:opacity-30 transition-colors flex items-center gap-0.5"><svg width="11" height="11" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7.5 2v11M2 7.5h11"/></svg>添加</button>)}</div><div className="flex flex-col gap-1.5">{localOrigins.map((o, i) => (<div key={i} className="flex items-center gap-1"><Input placeholder="例：内蒙古呼和浩特" value={o} onChange={e => { const no = [...localOrigins]; no[i] = e.target.value; setLocalOrigins(no); updateField('origin', no.join('\n')) }} disabled={disabled} className="flex-1" /><button type="button" onClick={(e) => { e.stopPropagation(); if (localOrigins.length <= 1) return; const no = localOrigins.filter((_,j) => j !== i); setLocalOrigins(no); updateField('origin', no.join('\n')) }} className="text-muted-foreground/30 hover:text-destructive shrink-0"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3.5 3.5l8 8M11.5 3.5l-8 8"/></svg></button></div>))}</div></div>
          <div className={fieldCls}><Label htmlFor="productionDate" className="text-sm">生产日期</Label><div className="relative"><Input id="productionDate" type="date" value={input.productionDate} onChange={e => updateField('productionDate', e.target.value)} disabled={disabled} onKeyDown={e => e.preventDefault()} className="cursor-pointer" /></div></div>
          <div className={fieldCls}><Label htmlFor="shelfLife" className="text-sm">保质期</Label><div className="flex gap-2"><Input id="shelfLife" type="number" placeholder="例：6" className="flex-1" value={input.shelfLifeValue} onChange={e => updateField('shelfLifeValue', e.target.value)} disabled={disabled} /><Select value={input.shelfLifeUnit} onValueChange={v => updateField('shelfLifeUnit', v as ShelfLifeUnit)} disabled={disabled}><SelectTrigger className="w-20">{input.shelfLifeUnit ? SHELF_LIFE_UNITS.find(u => u.key === input.shelfLifeUnit)?.label : <span className="text-muted-foreground">单位</span>}</SelectTrigger><SelectContent><SelectGroup>{SHELF_LIFE_UNITS.map(u => (<SelectItem key={u.key} value={u.key}>{u.label}</SelectItem>))}</SelectGroup></SelectContent></Select></div></div>
          <div className={fieldCls}><Label htmlFor="suggestedPrice" className="text-sm">建议售价 <span className="text-destructive">*</span></Label><div className="relative"><Input id="suggestedPrice" type="number" placeholder="例：45.90" value={input.suggestedPrice} onChange={e => updateField('suggestedPrice', e.target.value)} disabled={disabled} aria-invalid={!!errors.suggestedPrice} className="pr-10" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">元</span></div>{errors.suggestedPrice && <p className="text-xs text-destructive">{errors.suggestedPrice}</p>}</div>
          <div className={fieldCls}><Label htmlFor="coreIngredients" className="text-sm">核心配料 / 原料</Label><Textarea id="coreIngredients" rows={2} placeholder="主要配料、特色原料说明" value={input.coreIngredients} onChange={e => updateField('coreIngredients', e.target.value)} disabled={disabled} /></div>
          <div className="flex flex-col gap-1.5"><div className="flex items-center justify-between"><Label htmlFor="sellingPoints" className="text-sm">核心卖点</Label><div className="flex items-center gap-1.5">{polished && <Button variant="ghost" size="sm" className="text-xs text-primary hover:text-[#001f7a]" onClick={() => { updateField('sellingPoints', prePolishRef.current); setPolished(false) }}>撤销</Button>}<Button variant="secondary" size="sm" className="ai-glow-btn gap-1 rounded-full" onClick={handlePolishSellingPoints} disabled={polishLoading || !input.sellingPoints.trim()}>{polishLoading ? <><span className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />润色中</> : 'AI 润色'}</Button></div></div><Textarea id="sellingPoints" rows={6} placeholder="每行一条核心卖点，支持手动输入 3-6 条，约 200 字" value={input.sellingPoints} onChange={e => updateField('sellingPoints', e.target.value)} disabled={disabled} /></div>
        </div></CardContent></Card>
        <Card><CardHeader className="pb-3"><CardTitle className="text-sm">物流售后信息</CardTitle></CardHeader><CardContent><div className="flex flex-col gap-4">
          <div className={fieldCls}><Label htmlFor="shippingOrigin" className="text-sm">发货地</Label><Input id="shippingOrigin" placeholder="例：上海" value={input.shippingOrigin} onChange={e => updateField('shippingOrigin', e.target.value)} disabled={disabled} /></div>
          <div className={fieldCls}><Label className="text-sm">发货时效 <span className="text-destructive">*</span></Label><RadioGroup value={input.shippingTimeliness} onValueChange={v => updateField('shippingTimeliness', v as ShippingTimeliness)} disabled={disabled} className="flex flex-col gap-2">{SHIPPING_OPTIONS.map(opt => (<div key={opt.key} className="flex items-center gap-2"><RadioGroupItem value={opt.key} id={'shipping-' + opt.key} /><Label htmlFor={'shipping-' + opt.key} className="text-sm font-normal cursor-pointer">{opt.label}</Label></div>))}</RadioGroup>{input.shippingTimeliness === 'custom' && (<div className="flex items-center gap-2 mt-1"><Input type="number" placeholder="天数" className="w-24" value={input.customShippingDays} onChange={e => updateField('customShippingDays', e.target.value)} disabled={disabled} /><span className="text-sm text-muted-foreground">天</span></div>)}</div>
          <div className={fieldCls}><Label htmlFor="courier" className="text-sm">快递公司</Label><Input id="courier" placeholder="例：顺丰冷链" value={input.courier} onChange={e => updateField('courier', e.target.value)} disabled={disabled} /></div>
          <div className={fieldCls}><Label className="text-sm">补邮费地区</Label><RadioGroup value={input.extraShippingFeeEnabled ? 'yes' : 'no'} onValueChange={v => updateField('extraShippingFeeEnabled', v === 'yes')} disabled={disabled} className="flex gap-4"><div className="flex items-center gap-2"><RadioGroupItem value="no" id="fee-no" /><Label htmlFor="fee-no" className="text-sm font-normal">否</Label></div><div className="flex items-center gap-2"><RadioGroupItem value="yes" id="fee-yes" /><Label htmlFor="fee-yes" className="text-sm font-normal">是</Label></div></RadioGroup>{input.extraShippingFeeEnabled && (<Textarea className="mt-2" rows={2} placeholder="请填写具体补邮费地区" value={input.extraShippingFeeAreas} onChange={e => updateField('extraShippingFeeAreas', e.target.value)} disabled={disabled} />)}</div>
          <div className={fieldCls}><Label className="text-sm">不发货地区</Label><RadioGroup value={input.noShippingAreasEnabled ? 'yes' : 'no'} onValueChange={v => updateField('noShippingAreasEnabled', v === 'yes')} disabled={disabled} className="flex gap-4"><div className="flex items-center gap-2"><RadioGroupItem value="no" id="ns-no" /><Label htmlFor="ns-no" className="text-sm font-normal">否</Label></div><div className="flex items-center gap-2"><RadioGroupItem value="yes" id="ns-yes" /><Label htmlFor="ns-yes" className="text-sm font-normal">是</Label></div></RadioGroup>{input.noShippingAreasEnabled && (<Textarea className="mt-2" rows={2} placeholder="请填写具体不发货地区" value={input.noShippingAreas} onChange={e => updateField('noShippingAreas', e.target.value)} disabled={disabled} />)}</div>
          <div className={fieldCls}><Label htmlFor="afterSalesRules" className="text-sm">售后规则 <span className="text-destructive">*</span></Label><Textarea id="afterSalesRules" rows={2} placeholder="例：生鲜不支持7天无理由，质量问题24小时内理赔" value={input.afterSalesRules} onChange={e => updateField('afterSalesRules', e.target.value)} disabled={disabled} aria-invalid={!!errors.afterSalesRules} />{errors.afterSalesRules && <p className="text-xs text-destructive">{errors.afterSalesRules}</p>}</div>
        </div></CardContent></Card>
        <Card><CardHeader className="pb-3"><CardTitle className="text-sm">扩展信息 <span className="text-xs text-muted-foreground font-normal">（对应可选模块）</span></CardTitle></CardHeader><CardContent><div className="flex flex-col gap-4">
          <div className={fieldCls}><Label htmlFor="brandBackground" className="text-sm">品牌背景</Label><Textarea id="brandBackground" rows={2} placeholder="品牌实力、认证、奖项等" value={input.brandBackground} onChange={e => updateField('brandBackground', e.target.value)} disabled={disabled} /></div>
          <div className={fieldCls}><Label htmlFor="targetAudience" className="text-sm">适用人群</Label><Input id="targetAudience" placeholder="如：久坐办公党、注重健康的家庭" value={input.targetAudience} onChange={e => updateField('targetAudience', e.target.value)} disabled={disabled} /></div>
          <div className={fieldCls}><Label htmlFor="usageScene" className="text-sm">使用场景</Label><Input id="usageScene" placeholder="如：早餐搭配、办公室下午茶、健身后加餐" value={input.usageScene} onChange={e => updateField('usageScene', e.target.value)} disabled={disabled} /></div>
          <div className={fieldCls}><Label htmlFor="additionalNotes" className="text-sm">补充备注</Label><Textarea id="additionalNotes" rows={2} placeholder="其他需要 AI 融入的信息" value={input.additionalNotes} onChange={e => updateField('additionalNotes', e.target.value)} disabled={disabled} /></div>
        </div></CardContent></Card>
      </div>
    </CollapsibleContent></Collapsible>

    {/* 生成设置 */}
    <div className="rounded-lg px-3 py-2 text-sm font-medium">生成设置</div>
    <div className="flex flex-col gap-4">

      {/* 笔记结构 */}
      <Card><CardHeader className="pb-3"><div className="flex items-center justify-between"><CardTitle className="text-sm">笔记结构</CardTitle><Button variant="ghost" size="sm" className="text-xs h-6 text-primary" onClick={() => { const def = MODULE_CONFIG.map(m => m.key); const sel = input.selectedModules.filter(k => def.includes(k)); sel.sort((a, b) => def.indexOf(a) - def.indexOf(b)); onChange({ ...input, moduleOrder: def, selectedModules: sel }) }}>默认排序</Button></div></CardHeader><CardContent><div className="flex flex-col gap-1.5">
        {moduleOrder.map((key, index) => { const m = MODULE_CONFIG.find(mod => mod.key === key); if (!m) return null; const isMandatory = m.category === 'mandatory'; const isSelected = input.selectedModules.includes(key)
          return (<div key={m.key} draggable onDragStart={e => handleDragStart(e, index)} onDragOver={e => handleDragOver(e, index)} onDragEnd={handleDragEnd}
            onClick={() => {
              if (dragIndex !== null) return
              const isSel = input.selectedModules.includes(key)
              if (key === 'comparison') {
                if (!isSel && !hasConfiguredPlatforms) {
                  // 未配置任何平台 → 打开弹窗先配置
                  setPriceDialogOpen(true)
                } else if (!isSel && hasConfiguredPlatforms) {
                  // 已配置 → 直接选中
                  updateField('selectedModules', [...input.selectedModules, key])
                } else {
                  // 取消选中
                  updateField('selectedModules', input.selectedModules.filter(k => k !== key))
                }
              } else {
                const sel = isSel ? input.selectedModules.filter(k => k !== key) : [...input.selectedModules, key]
                updateField('selectedModules', sel)
              }
            }}
            className={'flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 transition-all duration-150 cursor-pointer select-none ' + (dragIndex === index ? 'opacity-30 bg-muted/10' : 'bg-muted/20')}>
            <span className="text-muted-foreground/40 cursor-grab active:cursor-grabbing text-xs leading-none select-none shrink-0">⋮⋮</span>
            <span onClick={e => e.stopPropagation()}><Checkbox checked={isSelected} onCheckedChange={() => { const isSel = input.selectedModules.includes(key); if (key === 'comparison') { if (!isSel && !hasConfiguredPlatforms) { setPriceDialogOpen(true) } else if (!isSel && hasConfiguredPlatforms) { updateField('selectedModules', [...input.selectedModules, key]) } else { updateField('selectedModules', input.selectedModules.filter(k => k !== key)) } } else { const sel = isSel ? input.selectedModules.filter(k => k !== key) : [...input.selectedModules, key]; updateField('selectedModules', sel) } }} className="shrink-0" /></span>
            <div className="flex flex-col min-w-0 flex-1"><div className="flex items-center justify-between"><span className="text-sm font-medium text-foreground">{m.label}</span>{key === 'comparison' && (<button onClick={e => { e.stopPropagation(); setPriceDialogOpen(true) }} className="text-[11px] text-muted-foreground hover:text-[#07C160] transition-colors flex items-center gap-0.5 ml-auto">配置比价清单<svg width="10" height="10" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5.5 2.5l5 5-5 5" /></svg></button>)}</div><span className="text-xs text-muted-foreground">{m.description}</span></div>
          </div>)})}
      </div></CardContent></Card>
    </div>
  </div>

  {/* 底部按钮 */}
  <div className="flex-shrink-0 flex flex-col gap-2 px-4 py-3 border-t border-border bg-sidebar">
    <button className="generate-btn w-full rounded-full flex items-center justify-center gap-2" onClick={handleGenerate} disabled={isGenerating}>
      {isGenerating ? (<><span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />生成中...</>) : (<><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="gen-icon shrink-0"><path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z" /><path d="M18 16l.8 2.5L21 19l-2.2.5L18 22l-.8-2.5L15 19l2.2-.5z" /><path d="M6 5l.5 1.5L8 7l-1.5.5L6 9l-.5-1.5L4 7l1.5-.5z" /></svg>立即生成</>)}
    </button>
    <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={() => { onChange({ ...input, productName: '', netWeight: '', origin: '', productionDate: '', shelfLifeValue: '', shelfLifeUnit: 'day', suggestedPrice: '', sellingPoints: '', coreIngredients: '', shippingOrigin: '', shippingTimeliness: '48h', customShippingDays: '', courier: '', extraShippingFeeEnabled: false, extraShippingFeeAreas: '', noShippingAreasEnabled: false, noShippingAreas: '', afterSalesRules: '', brandBackground: '', targetAudience: '', usageScene: '', additionalNotes: '', textLength: 'long' as const, moduleOrder: MODULE_CONFIG.map(m => m.key) }); setErrors({}) }} disabled={isGenerating}>清空配置项</Button>
  </div>

  {/* 文件解析结果确认 Dialog */}
  {confirmOpen && extractedFields && (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setConfirmOpen(false)}>
      <div className="bg-card rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6 border border-border" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-1">AI 已识别以下信息</h3>
        <p className="text-sm text-muted-foreground mb-4">请确认并修改后填入表单</p>
        <div className="flex flex-col gap-3 mb-4">
          {Object.entries(extractedFields).filter(([,v]) => v).map(([key, value]) => (
            <div key={key} className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">{FIELD_LABELS[key] || key}</Label>
              <Textarea rows={key === 'sellingPoints' ? 3 : 1} value={String(value)} onChange={e => setExtractedFields(prev => prev ? { ...prev, [key]: e.target.value } : null)} className="text-xs" />
            </div>
          ))}
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={() => { setConfirmOpen(false); setExtractedFields(null); setUploadFiles([]) }}>取消</Button>
          <Button size="sm" className="bg-[#07C160] hover:bg-[#06AD56]" onClick={() => { if (!extractedFields) return; const updated = { ...input }; Object.entries(extractedFields).forEach(([k, v]) => { if (v && k in updated) (updated as any)[k] = String(v) }); onChange(updated); setConfirmOpen(false); setExtractedFields(null); setUploadFiles([]) }}>确认填入表单</Button>
        </div>
      </div>
    </div>
  )}
</div>)

  {/* 图片预览遮罩 */}
  {previewUrl && (
    <div className="fixed inset-0 z-[999] bg-black/70 flex items-center justify-center p-8" onClick={() => setPreviewUrl(null)} onKeyDown={e => { if (e.key === 'Escape') setPreviewUrl(null) }} tabIndex={0} ref={el => el?.focus()}>
      <img src={previewUrl} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" alt="预览" onClick={e => e.stopPropagation()} />
      <button onClick={() => setPreviewUrl(null)} className="absolute top-4 right-4 size-10 rounded-full bg-white/20 hover:bg-white/40 text-white flex items-center justify-center text-xl transition-colors">✕</button>
    </div>
  )}
}
