import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
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
import { getModuleConfig, getDefaultModules, getAvailableModules, makeCatCode, DEFAULT_MODULE_ORDER, fuzzyMatchAllLevels } from '@/config/moduleRegistry'
import { buildCategoryTreeString } from '@/data/categories'

interface LeftPanelProps { input: ProductInput; onChange: (input: ProductInput) => void; disabled: boolean; isGenerating: boolean; onGenerate: (rawText?: string) => void; hasRequiredFields: boolean; priceDialogOpen: boolean; setPriceDialogOpen: (v: boolean) => void; platforms: { name: string; price: string; spec: string; enabled: boolean }[]; setPlatforms: (v: { name: string; price: string; spec: string; enabled: boolean }[]) => void; priceNotes: string; setPriceNotes: (v: string) => void; classifiedImages: ClassifiedImage[]; onImagesClassified: (images: ClassifiedImage[]) => void; onFileRegistered?: (id: string, file: File) => void; onConfirmImages?: (images: ClassifiedImage[]) => void; onOpenImageConfirm?: () => void; onClearClassifiedImages?: () => void; onRemoveClassifiedImage?: (id: string) => void }
interface FormErrors { productName?: string; subCategory?: string; netWeight?: string; suggestedPrice?: string; groupBuyPrice?: string; afterSalesRules?: string }

const SHELF_LIFE_UNITS: { key: ShelfLifeUnit; label: string }[] = [{ key: 'day', label: '天' }, { key: 'month', label: '月' }, { key: 'year', label: '年' }]
const FIELD_LABELS: Record<string, string> = { productName: '商品名称', subCategory: '二级子品类', netWeight: '规格净含量', origin: '产地', suggestedPrice: '建议售价', sellingPoints: '核心卖点', coreIngredients: '核心配料/原料', shippingOrigin: '发货地', shippingTimeliness: '发货时效', courier: '快递公司', afterSalesRules: '售后规则', brandBackground: '品牌背景', targetAudience: '适用人群', usageScene: '使用场景', shelfLifeValue: '保质期' }



export function LeftPanel({ input, onChange, disabled, isGenerating, onGenerate, priceDialogOpen, setPriceDialogOpen, platforms, setPlatforms, priceNotes, setPriceNotes, classifiedImages, onImagesClassified, onFileRegistered, onConfirmImages, onOpenImageConfirm, onClearClassifiedImages, onRemoveClassifiedImage }: LeftPanelProps) {

  const [aiOpen, setAiOpen] = useState(true); const [productOpen, setProductOpen] = useState(true); const [fileTab, setFileTab] = useState('paste'); const [pasteText, setPasteText] = useState(''); const [extractLoading, setExtractLoading] = useState(false); const fileInputRef = useRef<HTMLInputElement>(null)
  // 图片分类
  type ImageFile = { id: string; file: File; status: 'pending' | 'compressing' | 'classifying' | 'done' | 'error'; error?: string; type?: string; desc?: string; preview?: string; imageContentSummary?: string }
  const [imageFiles, setImageFiles] = useState<ImageFile[]>([]); const [imageClassifyLoading, setImageClassifyLoading] = useState(false);  const [classifyProgress, setClassifyProgress] = useState<{ done: number; total: number } | null>(null)
  // 当弹窗保存后 classifiedImages 更新时，同步 type/desc 到本地 imageFiles
  const classifiedMap = useMemo(() => {
    const map = new Map<string, { type: string; desc: string }>()
    classifiedImages.forEach(c => map.set(c.id, { type: c.type, desc: c.desc }))
    return map
  }, [classifiedImages])
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [errors, setErrors] = useState<FormErrors>({}); const [dragIndex, setDragIndex] = useState<number | null>(null)

  // === 智能类目识别 + 模块深推 ===
  const [categoryHint, setCategoryHint] = useState<{ type: 'success' | 'warning' | 'info'; text: string } | null>(null)
  const [extractDebouncing, setExtractDebouncing] = useState(false)
  const userManuallyChangedCategoryRef = useRef(false)    // 小co #1: 竞态防护
  const autoCategoryRef = useRef(false)                    // 小co #2: useEffect 冲突防护
  const lastExtractTextRef = useRef('')                    // 小co #6: 文本变化判断
  const userTouchedModulesRef = useRef<Set<string>>(new Set()) // 小co #5: 用户手动改模块
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const categoryTreeStrRef = useRef<string>('')
  // 文件我的商品图
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
  const [extractSPLoading, setExtractSPLoading] = useState(false)
  const hasConfiguredPlatforms = platforms.some(p => p.enabled && p.price.trim())
  const [localOrigins, setLocalOrigins] = useState<string[]>(() => { return (input.origin || '').split('\n').filter(Boolean) })
  const moduleOrder = input.moduleOrder

  // 初始化：如果已有三级类目但 moduleOrder 为空或顺序不对，自动按品类排序
  // 小co #2: autoCategoryRef 守卫 → AI 自动填入时不触发 moduleOrder 重置
  useEffect(() => {
    if (input.catLevel3 && !autoCategoryRef.current) {
      const order = DEFAULT_MODULE_ORDER[input.catLevel1] || DEFAULT_MODULE_ORDER['__default__']
      const avail = getAvailableModules(input.catLevel1, input.catLevel2, input.catLevel3)
      const expected = order.filter(k => avail.includes(k))
      const currentKeys = input.moduleOrder.filter(k => avail.includes(k))
      if (expected.length > 0 && JSON.stringify(expected) !== JSON.stringify(currentKeys)) {
        onChange({ ...input, moduleOrder: expected })
      }
    }
  }, [input.catLevel1, input.catLevel2, input.catLevel3])

  // === debounce 监听 pasteText → 自动调 /api/extract ===
  useEffect(() => {
    const text = pasteText.trim()
    // 清空 → 重置
    if (!text) {
      if (input.catLevel1 || input.catLevel2 || input.catLevel3) {
        autoCategoryRef.current = true
        onChange({ ...input, catLevel1: '', catLevel2: '', catLevel3: '', catCode: '' })
        setTimeout(() => { autoCategoryRef.current = false }, 100)
      }
      setCategoryHint(null)
      setExtractDebouncing(false)
      lastExtractTextRef.current = ''
      return
    }
    // 小co #6: 文本变化判断——长度变化>20%或新增>50字符
    const prevLen = lastExtractTextRef.current.length
    const newLen = text.length
    const lenChange = prevLen > 0 ? Math.abs(newLen - prevLen) / prevLen : 1
    const addedChars = newLen > prevLen ? newLen - prevLen : 0
    if (prevLen > 0 && lenChange <= 0.2 && addedChars < 50) return

    // debounce 1.2s
    setExtractDebouncing(true)
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(async () => {
      setExtractDebouncing(false)
      lastExtractTextRef.current = text

      // 懒加载类目树字符串
      if (!categoryTreeStrRef.current) categoryTreeStrRef.current = buildCategoryTreeString()

      try {
        const res = await fetch('/api/extract', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, categoryTree: categoryTreeStrRef.current }),
        })
        const d = await res.json()
        if (!d.success || !d.data) { setCategoryHint({ type: 'info', text: '未识别到匹配类目，请手动选择' }); return }

        const r = d.data

        // --- 类目处理 ---
        if (!userManuallyChangedCategoryRef.current && (r.catLevel1 || r.catLevel2 || r.catLevel3)) {
          const match = fuzzyMatchAllLevels(
            r.catLevel1 || '', r.catLevel2 || '', r.catLevel3 || '',
            CATEGORIES.level1s,
            (l1) => CATEGORIES.byLevel1[l1]?.level2s || [],
            (l1, l2) => CATEGORIES.byLevel1[l1]?.byLevel2[l2] || [],
          )
          if (match.matchType !== 'none' && match.catLevel1) {
            // 构建更新对象
            const updates: any = {}
            if (match.catLevel1) updates.catLevel1 = match.catLevel1
            if (match.catLevel2) updates.catLevel2 = match.catLevel2
            if (match.catLevel3) {
              updates.catLevel3 = match.catLevel3
              const code = makeCatCode(match.catLevel1, match.catLevel2, match.catLevel3)
              updates.catCode = code
              // 深推模块
              const defModules = getDefaultModules(match.catLevel1, match.catLevel2, match.catLevel3)
              const availModules = getAvailableModules(match.catLevel1, match.catLevel2, match.catLevel3)
              const order = DEFAULT_MODULE_ORDER[match.catLevel1] || DEFAULT_MODULE_ORDER['__default__']
              const newOrder = order.filter(k => availModules.includes(k))

              // 小co #5: 深推算法——getDefaultModules + suggested - exclude（mandatory不可移除）
              const config = getModuleConfig(match.catLevel1, match.catLevel2, match.catLevel3)
              const mandatorySet = new Set(config.mandatory)
              const suggested = (r.suggestedModules || []).filter((k: string) => availModules.includes(k) && !mandatorySet.has(k))
              const excluded = (r.excludeModules || []).filter((k: string) => !mandatorySet.has(k))

              let finalModules = [...defModules]
              // 加 suggested（去重，按 DEFAULT_MODULE_ORDER 排序）
              for (const sk of suggested) {
                if (!finalModules.includes(sk)) finalModules.push(sk)
              }
              // 减 excluded（不影响 userTouched 的模块）
              const touchedSet = userTouchedModulesRef.current
              finalModules = finalModules.filter(k => !excluded.includes(k) || touchedSet.has(k))
              // 按 order 排序
              finalModules.sort((a, b) => newOrder.indexOf(a) - newOrder.indexOf(b))

              updates.selectedModules = finalModules
              updates.moduleOrder = newOrder

              // 小co #2: 标记 AI 自动填入，避免 useEffect 覆盖
              autoCategoryRef.current = true
            }
            // 字段提取 + 类目一起写入
            const fieldUpdates: any = { ...input, ...updates }
            if (r.productName) fieldUpdates.productName = String(r.productName)
            if (r.netWeight) fieldUpdates.netWeight = String(r.netWeight)
            if (r.origin) fieldUpdates.origin = String(r.origin)
            if (r.suggestedPrice) fieldUpdates.suggestedPrice = String(r.suggestedPrice)
            if (r.sellingPoints) fieldUpdates.sellingPoints = String(r.sellingPoints)
            if (r.coreIngredients) fieldUpdates.coreIngredients = String(r.coreIngredients)
            if (r.shippingTimeliness && ['24h','48h','72h','7d','custom'].includes(r.shippingTimeliness)) fieldUpdates.shippingTimeliness = r.shippingTimeliness
            if (r.courier) fieldUpdates.courier = String(r.courier)
            if (r.afterSalesRules) fieldUpdates.afterSalesRules = String(r.afterSalesRules)
            if (r.brandBackground) fieldUpdates.brandBackground = String(r.brandBackground)
            if (r.targetAudience) fieldUpdates.targetAudience = String(r.targetAudience)
            if (r.usageScene) fieldUpdates.usageScene = String(r.usageScene)

            onChange(fieldUpdates)
            setTimeout(() => { autoCategoryRef.current = false }, 200)

            // 小co #8: 类目提示
            if (match.matchType === 'exact') {
              setCategoryHint({ type: 'success', text: 'AI 已识别类目，如有误请手动修改' })
            } else {
              setCategoryHint({ type: 'warning', text: 'AI 推断类目，建议确认' })
            }
          } else {
            setCategoryHint({ type: 'info', text: '未识别到匹配类目，请手动选择' })
          }
        } else {
          // 用户手动改过类目 → 跳过了类目覆盖但字段仍提取
          if (!r.catLevel1 && !r.catLevel2 && !r.catLevel3) {
            setCategoryHint({ type: 'info', text: '未识别到匹配类目，请手动选择' })
          }
        }
      } catch {
        setCategoryHint({ type: 'info', text: '未识别到匹配类目，请手动选择' })
      }
    }, 1200)

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [pasteText])

  const updateField = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) => { if (['productName','netWeight','suggestedPrice','groupBuyPrice','afterSalesRules'].includes(key as string)) setErrors(prev => ({ ...prev, [key]: undefined })); onChange({ ...input, [key]: value }) }
  const fieldCls = 'flex flex-col gap-1.5'

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => { setDragIndex(index); e.dataTransfer.effectAllowed = 'move'; const img = new Image(); img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; e.dataTransfer.setDragImage(img, 0, 0) }, [])
  const handleDragOver = useCallback((e: React.DragEvent, index: number) => { e.preventDefault(); if (dragIndex === null || dragIndex === index) return; const newOrder = [...moduleOrder]; const [item] = newOrder.splice(dragIndex, 1); newOrder.splice(index, 0, item); setDragIndex(index); const sel = input.selectedModules.filter(k => newOrder.includes(k)); sel.sort((a, b) => newOrder.indexOf(a) - newOrder.indexOf(b)); onChange({ ...input, moduleOrder: newOrder, selectedModules: sel }) }, [dragIndex, moduleOrder, input, onChange])
  const handleDragEnd = useCallback(() => { setDragIndex(null) }, [])

  const genBtnRef = useRef<HTMLButtonElement>(null)
  const handleGenerateRef = useRef<() => void>(() => {})

  const handleGenerate = useCallback(() => {
    const newErrors: FormErrors = {};
    const hasPasteText = pasteText.trim().length > 0;
    if (!hasPasteText) {
      if (!input.productName.trim()) newErrors.productName = "请输入商品名称";
      if (!input.netWeight.trim()) newErrors.netWeight = "请输入规格净含量";
      if (!input.suggestedPrice.trim()) newErrors.suggestedPrice = "请输入建议售价";
      if (!input.groupBuyPrice.trim()) newErrors.groupBuyPrice = "请输入开团价";
      if (!input.afterSalesRules.trim()) newErrors.afterSalesRules = "请输入售后规则";
    }
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    const rawText = pasteText.trim() || undefined;
    onChange({ ...input, rawProductText: pasteText });
    onGenerate(rawText);
  }, [pasteText, input, onChange, onGenerate])

  // 始终保持 ref 指向最新的 handleGenerate
  useEffect(() => {
    handleGenerateRef.current = handleGenerate
  }, [handleGenerate])

  // 原生 DOM click 监听（React onClick 在某些情况下不触发，绕过它）
  useEffect(() => {
    const el = genBtnRef.current
    if (!el) return
    const handler = (e: MouseEvent) => {
      if (el.disabled) return
      handleGenerateRef.current()
    }
    el.addEventListener('click', handler)
    return () => el.removeEventListener('click', handler)
  }, [])

  const handleExtractInfo = async () => { const text = pasteText.trim(); if (!text || extractLoading) return; setExtractLoading(true); try { const res = await fetch('/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, categoryTree: categoryTreeStrRef.current || buildCategoryTreeString() }) }); const d = await res.json(); if (d.success && d.data) { const r = d.data; const updated = { ...input, ...(r.productName ? { productName: String(r.productName) } : {}), ...(r.netWeight ? { netWeight: String(r.netWeight) } : {}), ...(r.origin ? { origin: String(r.origin) } : {}), ...(r.suggestedPrice ? { suggestedPrice: String(r.suggestedPrice) } : {}), ...(r.sellingPoints ? { sellingPoints: String(r.sellingPoints) } : {}), ...(r.coreIngredients ? { coreIngredients: String(r.coreIngredients) } : {}), ...(r.shippingTimeliness && ['24h','48h','72h','7d','custom'].includes(r.shippingTimeliness) ? { shippingTimeliness: r.shippingTimeliness } : {}), ...(r.courier ? { courier: String(r.courier) } : {}), ...(r.afterSalesRules ? { afterSalesRules: String(r.afterSalesRules) } : {}), ...(r.brandBackground ? { brandBackground: String(r.brandBackground) } : {}), ...(r.targetAudience ? { targetAudience: String(r.targetAudience) } : {}), ...(r.usageScene ? { usageScene: String(r.usageScene) } : {}), }; onChange(updated) } } catch(e) {} setExtractLoading(false) }

  // 简易图片哈希（客户端：从文件字节采样 64 个点）
  const computeImageHash = async (file: File): Promise<string> => {
    const buf = new Uint8Array(await file.arrayBuffer())
    const len = buf.length; const samples = []
    const start = Math.floor(len * 0.25); const step = Math.floor((len * 0.5) / 64)
    for (let i = 0; i < 64; i++) { const pos = start + i * step; samples.push(pos < len ? buf[pos] : 0) }
    const avg = samples.reduce((s, v) => s + v, 0) / 64
    let hash = 0n; for (let i = 0; i < 64; i++) { if (samples[i] > avg) hash |= (1n << BigInt(63 - i)) }
    return hash.toString(16).padStart(16, '0')
  }

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

    // 先查语料库匹配（图片指纹）
    let corpusMatches: Record<string, any> = {}
    try {
      const hashes = await Promise.all(pending.map(async f => ({ id: f.id, hash: await computeImageHash(f.file) })))
      const matchRes = await fetch('/api/images/match-corpus', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hashes }) })
      const matchData = await matchRes.json()
      if (matchData.success) corpusMatches = matchData.data.matches || {}
    } catch { /* 语料匹配失败，走 doubao */ }

    // 已匹配的图片直接用语料数据
    const corpusDirect: { id: string; type: string; desc: string; preview: string; imageContentSummary?: string }[] = []
    const needDoubao = compressed.filter(c => {
      const match = corpusMatches[c.id]
      if (match) {
        const preview = compressed.find(cp => String(cp.id) === String(c.id))?.preview || ''
        corpusDirect.push({ id: c.id, type: match.type, desc: match.desc || '', preview, imageContentSummary: match.imageContentSummary || '' })
        setImageFiles(prev => prev.map(p => p.id === c.id ? { ...p, status: 'done' as const, type: match.type, desc: match.desc, imageContentSummary: match.imageContentSummary || '' } : p))
        return false
      }
      return true
    })

    // 未匹配的图片调 doubao
    if (needDoubao.length > 0) {
      try {
        const res = await fetch('/api/images/classify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images: needDoubao }) })
        const d = await res.json()
        if (d.success && d.data?.results) {
          const results = d.data.results as Array<{id:string;type:string;desc:string;layout_role?:string}>
          setImageFiles(prev => prev.map(f => {
            const r = results.find(rr => String(rr.id) === String(f.id))
            return r ? { ...f, status: 'done' as const, type: r.type, desc: r.desc, imageContentSummary: (r as any).imageContentSummary || '' } : f
          }))
          // 合并 doubao 结果
          results.forEach(r => {
            const c = compressed.find(cp => String(cp.id) === String(r.id))
            if (c) corpusDirect.push({ id: r.id, type: r.type, desc: r.desc || '', preview: c.preview || '', imageContentSummary: r.imageContentSummary || c.imageContentSummary || '' })
          })
        }
      } catch (e: any) { /* doubao 失败，已匹配的语料图仍可用 */ }
      // 标记 doubao 分析失败的图片（仍在 classifying 状态 = 失败）
      setImageFiles(prev => prev.map(f => f.status === 'classifying' ? { ...f, status: 'error' as const, error: '解析失败' } : f))
    }

    // 合并所有结果（语料直接 + doubao），触发确认弹窗
    const allClassified = new Map(classifiedImages.map(c => [c.id, c]))
    // 加入语料库直接命中的
    corpusDirect.forEach(c => allClassified.set(c.id, { id: c.id, type: c.type, desc: c.desc, preview: c.preview, imageContentSummary: c.imageContentSummary || '', imageOcrText: (c as any).imageOcrText || '', suggestedModule: (c as any).suggestedModule || '' }))
    // 标记 doubao 分析失败的图片
    compressed.filter(c => !corpusDirect.find(cd => cd.id === c.id)).forEach(c => {
      if (!allClassified.has(c.id)) {
        allClassified.set(c.id, { id: c.id, type: '其他', desc: '分析失败', preview: c.preview || '', imageContentSummary: '', imageOcrText: '', suggestedModule: '' })
      }
    })
    // 把豆包成功分析的结果也加入 allClassified
    imageFiles.filter(f => f.status === 'done').forEach(f => {
      if (!allClassified.has(f.id)) {
        allClassified.set(f.id, { id: f.id, type: f.type || '其他', desc: f.desc || '', preview: f.preview || '', imageContentSummary: f.imageContentSummary || '', imageOcrText: (f as any).imageOcrText || '', suggestedModule: (f as any).suggestedModule || '' })
      }
    })
    // 标记失败的图片
    const allIds = new Set(imageFiles.map(f => f.id))
    imageFiles.filter(f => f.status === 'error' || (f.status === 'classifying' && !allClassified.has(f.id))).forEach(f => {
      if (!allClassified.has(f.id)) {
        allClassified.set(f.id, { id: f.id, type: '其他', desc: '分析失败', preview: f.preview || '', imageContentSummary: '', imageOcrText: '', suggestedModule: '' })
      }
    })
    if (onConfirmImages) {
      onConfirmImages([...allClassified.values()])
    } else {
      onImagesClassified([...allClassified.values()])
    }
    setClassifyProgress({ done: pending.length, total: pending.length })
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
  const removeImage = (id: string) => { setImageFiles(prev => prev.filter(f => f.id !== id)); onRemoveClassifiedImage?.(id) }
  
  const handleExtractSellingPoints = async () => {
    if (extractSPLoading) return
    const sourceText = pasteText.trim()
    if (!sourceText) { alert("请先在「商品信息」中粘贴商品信息文本"); return }
    setExtractSPLoading(true)
    try {
      const res = await fetch("/api/extract/selling-points", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sourceText })
      })
      const d = await res.json()
      if (d.success && d.data?.points?.length > 0) {
        updateField("sellingPoints", d.data.points.join("\n"))
      }
    } catch {}
    setExtractSPLoading(false)
  }

  return (<div className="flex flex-col h-full"><div className="flex flex-col flex-1 min-h-0 overflow-y-auto px-4 pt-3 gap-2">
    {/* AI自动分析商品信息 */}
    <Collapsible open={aiOpen} onOpenChange={setAiOpen}><CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors">AI自动分析商品信息<svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" className={'shrink-0 text-muted-foreground transition-transform duration-200 ' + (aiOpen ? 'rotate-90' : '')}><path d="M5.5 2.5l5 5-5 5" /></svg></CollapsibleTrigger><CollapsibleContent className="pt-2">
      <div className="flex flex-col gap-2">
        <div className="flex items-center rounded-lg bg-muted p-0.5"><button onClick={() => setFileTab('paste')} className={"flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200 " + (fileTab === 'paste' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground')}>商品信息</button><button onClick={() => setFileTab('upload')} className={"flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200 " + (fileTab === 'upload' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground')}>我的商品图</button></div>
        

{fileTab === 'upload' ? (<div className="flex flex-col gap-2" onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }} onDragLeave={e => { e.preventDefault(); const rect = e.currentTarget.getBoundingClientRect(); const { clientX, clientY } = e; if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) setDragOver(false) }} onDrop={e => { e.preventDefault(); e.stopPropagation(); setDragOver(false); if (e.dataTransfer.files) { const files = e.dataTransfer.files; const imgs = []; const docs = []; Array.from(files).forEach(f => { f.type.startsWith('image/') ? imgs.push(f) : docs.push(f) }); if (imgs.length > 0) addImages(imgs); if (docs.length > 0) addFiles(docs) } }}><div className="flex items-center justify-between"><div className="flex flex-col gap-0.5"><span className="text-xs text-muted-foreground">我可以帮您解析商品图片并排版（支持拖拽图片到编辑区自行更改）</span></div><input ref={fileInputRef} type="file" className="hidden" accept="image/*,.doc,.docx,.txt,.xlsx,.xls,.csv,.pdf" multiple onChange={e => { if (!e.target.files) return; const imgs = []; const docs = []; Array.from(e.target.files).forEach(f => { f.type.startsWith('image/') ? imgs.push(f) : docs.push(f) }); if (imgs.length > 0) addImages(imgs); if (docs.length > 0) addFiles(docs); e.target.value = '' }} /></div>
{(imageFiles.length > 0 || uploadFiles.length > 0) ? (<div style={{maxHeight: Math.min(192 + Math.max(0, (imageFiles.length + uploadFiles.length) - 2) * 12, 384) + 'px', minHeight: '192px'}} className={`flex flex-col gap-1.5 overflow-y-auto rounded-lg border p-2 transition-colors ${dragOver ? 'border-[#07C160] bg-emerald-50/30' : 'border-border/50 bg-muted/20'}`}>
{uploadFiles.length > 0 && (<>{uploadFiles.map(uf => (<div key={uf.id} className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs shrink-0 ${uf.status === 'error' ? 'border-red-200 bg-red-50' : uf.status === 'done' ? 'border-emerald-200 bg-emerald-50' : 'border-border bg-card'}`}><span className="shrink-0 text-base">📄</span><span className="flex-1 truncate font-medium">{uf.file?.name || '(未知)'}</span><span className="text-[10px] text-muted-foreground shrink-0">{((uf.file?.size || 0) / 1024).toFixed(1)}KB</span>{uf.status === 'parsing' && <span className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent shrink-0" />}{uf.status === 'done' && <svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke="#07C160" strokeWidth="1.5" className="shrink-0"><path d="M4.5 7.5l2 2 4-4"/></svg>}{uf.status === 'error' && <span className="text-[10px] text-red-500 shrink-0">{uf.error || '解析失败'}</span>}<button onClick={() => removeFile(uf.id)} className="text-muted-foreground/30 hover:text-destructive shrink-0"><svg width="12" height="12" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3.5 3.5l8 8M11.5 3.5l-8 8"/></svg></button></div>))}</>)}
{imageFiles.length > 0 && (<div className="grid grid-cols-3 gap-2 mt-2">
{imageFiles.map((f, i) => (<div key={f.id} className={`relative rounded-md border overflow-hidden ${f.status === 'error' ? 'border-red-200 bg-red-50' : f.status === 'done' ? 'border-emerald-200 bg-emerald-50/40' : 'border-border bg-card'}`}>
<div className="relative aspect-square cursor-pointer overflow-hidden group" draggable onDragStart={e => { const url = f.preview || (f.file && URL.createObjectURL(f.file)); if (url) { (window as any).__dragImageData__ = { src: url, alt: f.desc || f.file?.name || '' }; e.dataTransfer.setData('text/plain', 'x') } }} onClick={() => { const url = f.preview || (f.file && URL.createObjectURL(f.file)); if (url) setPreviewUrl(url) }}>
{f.preview ? <img src={f.preview} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full bg-muted flex items-center justify-center text-[10px] text-muted-foreground">图{i+1}</div>}
<button onClick={e => { e.stopPropagation(); removeImage(f.id) }} className="absolute top-1 right-1 size-5 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"><svg width="12" height="12" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3.5 3.5l8 8M11.5 3.5l-8 8"/></svg></button>
{f.status === 'pending' && <div className="absolute inset-0 bg-black/20 flex items-center justify-center"><span className="text-[10px] text-white bg-black/50 px-1.5 py-0.5 rounded">等待分析</span></div>}
{f.status === 'compressing' && <div className="absolute inset-0 bg-black/20 flex items-center justify-center"><span className="text-[10px] text-white bg-black/50 px-1.5 py-0.5 rounded">压缩中</span></div>}
{f.status === 'classifying' && <div className="absolute inset-0 bg-black/20 flex items-center justify-center"><span className="inline-block size-4 animate-spin rounded-full border-2 border-white border-t-transparent" /></div>}
{f.status === 'error' && <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center"><span className="text-[10px] text-red-600 bg-white/90 px-1.5 py-0.5 rounded">{f.error || '失败'}</span></div>}
{(f.status === 'done' || f.status === 'error') && (<button className="absolute top-1 left-1 size-5 flex items-center justify-center rounded-full bg-black/40 text-white opacity-70 group-hover:opacity-100 transition-opacity hover:bg-black/60" onClick={() => {}}><svg width="10" height="10" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="7.5" cy="7.5" r="2"/><path d="M1.5 7.5c1.5-3 4-5 6-5s4.5 2 6 5c-1.5 3-4 5-6 5s-4.5-2-6-5z"/></svg></button>)}
{(f.status === 'done' || f.status === 'error') && f.type && (<span className={`absolute bottom-1.5 left-1.5 text-[9px] px-1.5 py-0.5 rounded leading-tight ${f.status === 'error' ? 'bg-red-100/90 border border-red-200 text-red-700' : 'bg-emerald-50/90 border border-emerald-200 text-emerald-700'}`}>{classifiedMap.get(f.id)?.type || f.type}</span>)}
</div>
<div className="px-1.5 py-1"><p className="text-[10px] text-muted-foreground truncate leading-tight">{f.file?.name || '(未知)'}</p></div>
</div>))}
</div>)}
</div>) : (<div className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card py-8 px-4 cursor-pointer transition-colors hover:border-muted-foreground/30" onClick={() => fileInputRef.current?.click()} style={dragOver ? { borderColor: '#07C160', backgroundColor: 'hsl(160 60% 35% / 0.08)' } : undefined}><div className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/80 transition-colors"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7.5 1.5v8m0 0l-2-2m2 2l2-2M2.5 7.5v4a1 1 0 001 1h8a1 1 0 001-1v-4"/></svg>{dragOver ? '松手即可上传' : '上传文件或拖拽至此'}</div><p className="text-[11px] text-muted-foreground/60">支持图片（JPG/PNG/WebP），支持拖拽上传</p></div>)}
{imageFiles.length + uploadFiles.length > 0 && (<div className="flex flex-col gap-2"><div className="flex items-center gap-2">{(() => { const failedCount = classifiedImages.filter(img => !img.type || (img.type === '其他' && (!img.desc || img.desc === '分析失败'))).length; return <span className="text-[10px] text-muted-foreground/60">共 {imageFiles.length} 张图{failedCount > 0 && <>, <span className="text-red-400">{failedCount} 张失败</span></>}，{classifiedImages.length > 0 ? <span className="text-blue-500 cursor-pointer hover:text-blue-600 underline" onClick={(e) => { e.stopPropagation(); onOpenImageConfirm?.() }}>查看解析</span> : <span className="text-muted-foreground/40">查看解析</span>}</span>})()}<div className="flex-1" /><button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"><svg width="11" height="11" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7.5 2v11M2 7.5h11"/></svg>添加</button><button onClick={() => { if (confirm('确定要删除所有已上传的文件吗？')) { setUploadFiles([]); setImageFiles([]); onClearClassifiedImages?.() } }} className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] text-red-400 hover:text-red-600 hover:bg-red-50/50 transition-colors"><svg width="11" height="11" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2.5 4.5h10M5.5 4.5V3a1 1 0 011-1h2a1 1 0 011 1v1.5M4.5 4.5l.5 8.5a1 1 0 001 1h3a1 1 0 001-1l.5-8.5"/></svg>清空</button></div><button onClick={() => { handleParseAll(); handleImageClassify() }} disabled={parseLoading || imageClassifyLoading} className="ai-glow-btn ai-glow-btn--active w-full rounded-full flex items-center justify-center gap-2 text-xs px-4 py-2.5 disabled:opacity-40">{parseLoading || imageClassifyLoading ? <><span className="inline-block size-3.5 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground/60" />分析中{classifyProgress ? ` ${classifyProgress.done}/${classifyProgress.total}` : '...'} {classifyProgress && classifyProgress.done > 0 ? `· 约${Math.max(1, Math.round((classifyProgress.total - classifyProgress.done) * 7))}s` : ''}</> : '立即分析'}</button></div>)}</div>) : fileTab === 'paste' ? (<div className="flex flex-col gap-2"><Textarea rows={10} placeholder="在此粘贴商品资料文本，AI将自动识别并提取关键字段" value={pasteText} onChange={e => setPasteText(e.target.value)} className="text-xs" /></div>) : null}
      </div>
    </CollapsibleContent></Collapsible>

    {/* 生成设置 */}
    <div className="rounded-lg px-3 py-2 text-sm font-medium">生成设置</div>
    <div className="flex flex-col gap-4">



      <Card><CardHeader className="pb-3"><CardTitle className="text-sm">扩展信息</CardTitle></CardHeader><CardContent><div className="flex flex-col gap-4">
          <div className={fieldCls}><Label htmlFor="groupBuyPrice" className="text-sm">开团价 <span className="text-red-400">*</span></Label><div className="relative"><Input id="groupBuyPrice" placeholder="如 29.9" value={input.groupBuyPrice} onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) updateField('groupBuyPrice', v) }} disabled={disabled} className="pr-10" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">元</span></div></div>
          <div className="flex flex-col gap-1.5"><div className="flex items-center justify-between"><Label htmlFor="sellingPoints" className="text-sm">核心卖点</Label><Button variant="secondary" size="sm" className="ai-glow-btn gap-1 rounded-full" onClick={handleExtractSellingPoints} disabled={extractSPLoading}>{extractSPLoading ? <><span className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />AI 提炼中...</> : "帮我写"}</Button></div><Textarea id="sellingPoints" rows={6} placeholder="每行一条核心卖点，支持手动输入 3-6 条，约 200 字" value={input.sellingPoints} onChange={e => updateField("sellingPoints", e.target.value)} disabled={disabled} /></div>
          <div className={fieldCls}><Label htmlFor="targetAudience" className="text-sm">适用人群</Label><Input id="targetAudience" placeholder="如：久坐办公党、注重健康的家庭" value={input.targetAudience} onChange={e => updateField('targetAudience', e.target.value)} disabled={disabled} /></div>
          <div className={fieldCls}><Label htmlFor="usageScene" className="text-sm">使用场景</Label><Input id="usageScene" placeholder="如：早餐搭配、办公室下午茶、健身后加餐" value={input.usageScene} onChange={e => updateField('usageScene', e.target.value)} disabled={disabled} /></div>
          <div className={fieldCls}><Label htmlFor="additionalNotes" className="text-sm">补充备注</Label><Textarea id="additionalNotes" rows={2} placeholder="其他需要 AI 融入的信息" value={input.additionalNotes} onChange={e => updateField('additionalNotes', e.target.value)} disabled={disabled} /></div>
        </div>
          
        </CardContent></Card>

      {/* 笔记结构 */}
      <Card><CardHeader className="pb-3"><div className="flex items-center justify-between"><CardTitle className="text-sm">笔记结构</CardTitle><Button variant="ghost" size="sm" className="text-xs h-6 text-primary" onClick={() => { const order = DEFAULT_MODULE_ORDER[input.catLevel1] || DEFAULT_MODULE_ORDER['__default__']; const avail = input.catLevel3 ? getAvailableModules(input.catLevel1, input.catLevel2, input.catLevel3) : MODULE_CONFIG.map(m => m.key); const ordered = order.filter(k => avail.includes(k)); const extra = avail.filter(k => !ordered.includes(k)); const fullOrder = [...ordered, ...extra]; const sel = input.selectedModules.filter(k => fullOrder.includes(k)); sel.sort((a, b) => fullOrder.indexOf(a) - fullOrder.indexOf(b)); onChange({ ...input, moduleOrder: fullOrder, selectedModules: sel }) }}>默认排序</Button></div></CardHeader><CardContent><div className="flex flex-col gap-3 mb-3"><div className={fieldCls}><Label className="text-xs text-muted-foreground">一级类目</Label><Select value={input.catLevel1} onValueChange={v => { userManuallyChangedCategoryRef.current = true; onChange({ ...input, catLevel1: v, catLevel2: '', catLevel3: '', catCode: '', selectedModules: [], moduleOrder: [] }) }}><SelectTrigger className="h-8 text-sm"><span>{input.catLevel1 || '请选择'}</span></SelectTrigger><SelectContent><SelectGroup>{CATEGORIES.level1s.map(l1 => <SelectItem key={l1} value={l1}>{l1}</SelectItem>)}</SelectGroup></SelectContent></Select></div>{input.catLevel1 && <div className={fieldCls}><Label className="text-xs text-muted-foreground">二级类目</Label><Select value={input.catLevel2} onValueChange={v => { userManuallyChangedCategoryRef.current = true; onChange({ ...input, catLevel2: v, catLevel3: '', catCode: '' }) }}><SelectTrigger className="h-8 text-sm"><span>{input.catLevel2 || '请选择'}</span></SelectTrigger><SelectContent><SelectGroup>{(CATEGORIES.byLevel1[input.catLevel1]?.level2s || []).map(l2 => <SelectItem key={l2} value={l2}>{l2}</SelectItem>)}</SelectGroup></SelectContent></Select></div>}{input.catLevel1 && input.catLevel2 && <div className={fieldCls}><Label className="text-xs text-muted-foreground">三级类目</Label><Select value={input.catLevel3} onValueChange={v => {userManuallyChangedCategoryRef.current = true;const defModules = getDefaultModules(input.catLevel1, input.catLevel2, v);const availModules = getAvailableModules(input.catLevel1, input.catLevel2, v);const code = makeCatCode(input.catLevel1, input.catLevel2, v);const order = DEFAULT_MODULE_ORDER[input.catLevel1] || DEFAULT_MODULE_ORDER['__default__'];const newOrder = order.filter(k => availModules.includes(k));onChange({ ...input, catLevel3: v, catCode: code, selectedModules: defModules, moduleOrder: newOrder })}}><SelectTrigger className="h-8 text-sm"><span>{input.catLevel3 || '请选择'}</span></SelectTrigger><SelectContent><SelectGroup>{(CATEGORIES.byLevel1[input.catLevel1]?.byLevel2[input.catLevel2] || []).map(l3 => <SelectItem key={l3} value={l3}>{l3}</SelectItem>)}</SelectGroup></SelectContent></Select></div>}{categoryHint && (<p className={'text-[10px] mt-1 ' + (categoryHint.type === 'success' ? 'text-emerald-500' : categoryHint.type === 'warning' ? 'text-amber-500' : 'text-muted-foreground')}>{categoryHint.text}</p>)}{extractDebouncing && (<div className="h-0.5 mt-1 rounded-full bg-gradient-to-r from-transparent via-primary/40 to-transparent animate-pulse" />)}</div><div className="flex flex-col gap-1.5">
        {moduleOrder.map((key, index) => { const m = MODULE_CONFIG.find(mod => mod.key === key); if (!m) return null
          // 判断模块状态：mandatory = 不可取消，recommended = 默认勾选可取消，optional = 默认不勾选
          const config = input.catLevel3 ? getModuleConfig(input.catLevel1, input.catLevel2, input.catLevel3) : null
          const isMandatory = config ? config.mandatory.includes(key) : (m.scope === 'common' && ['hook','price','cta'].includes(key))
          const isSelected = input.selectedModules.includes(key)
          return (<div key={m.key} draggable onDragStart={e => handleDragStart(e, index)} onDragOver={e => handleDragOver(e, index)} onDragEnd={handleDragEnd}
            onClick={() => {
              if (dragIndex !== null || isMandatory) return
              userTouchedModulesRef.current.add(key)
              const isSel = input.selectedModules.includes(key)
              const sel = isSel ? input.selectedModules.filter(k => k !== key) : [...input.selectedModules, key]
              updateField('selectedModules', sel)
            }}
            className={'flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 transition-all duration-150 cursor-pointer select-none ' + (dragIndex === index ? 'opacity-30 bg-muted/10' : isMandatory ? 'bg-muted/40' : 'bg-muted/20')}>
            <span className="text-muted-foreground/40 cursor-grab active:cursor-grabbing text-xs leading-none select-none shrink-0">⋮⋮</span>
            <span onClick={e => e.stopPropagation()}><Checkbox checked={isSelected} disabled={isMandatory} onCheckedChange={() => { if (isMandatory) return; userTouchedModulesRef.current.add(key); const isSel = input.selectedModules.includes(key); const sel = isSel ? input.selectedModules.filter(k => k !== key) : [...input.selectedModules, key]; updateField('selectedModules', sel) }} className="shrink-0" /></span>
            <div className="flex flex-col min-w-0 flex-1"><div className="flex items-center justify-between"><span className="text-sm font-medium text-foreground">{m.label}{isMandatory && <span className="ml-1 text-[10px] text-muted-foreground/60">· 必选</span>}</span></div><span className="text-xs text-muted-foreground">{m.description}</span></div>
          </div>)})}
      </div></CardContent></Card>
    </div>
  </div>

  {/* 底部按钮 */}
  <div className="flex-shrink-0 flex flex-col gap-2 px-4 py-3 border-t border-border bg-sidebar">
    <button ref={genBtnRef} className="generate-btn w-full rounded-full flex items-center justify-center gap-2" onClick={handleGenerate} disabled={isGenerating}>
      {isGenerating ? (<><span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />生成中...</>) : (<><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="gen-icon shrink-0"><path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z" /><path d="M18 16l.8 2.5L21 19l-2.2.5L18 22l-.8-2.5L15 19l2.2-.5z" /><path d="M6 5l.5 1.5L8 7l-1.5.5L6 9l-.5-1.5L4 7l1.5-.5z" /></svg>立即生成</>)}
    </button>
    <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={() => { onChange({ ...input, productName: '', netWeight: '', origin: '', productionDate: '', shelfLifeValue: '', shelfLifeUnit: 'day', suggestedPrice: '', groupBuyPrice: '', sellingPoints: '', coreIngredients: '', shippingOrigin: '', shippingTimeliness: '48h', customShippingDays: '', courier: '', extraShippingFeeEnabled: false, extraShippingFeeAreas: '', noShippingAreasEnabled: false, noShippingAreas: '', afterSalesRules: '', brandBackground: '', targetAudience: '', usageScene: '', additionalNotes: '', textLength: 'long' as const, moduleOrder: MODULE_CONFIG.map(m => m.key) }); setErrors({}) }} disabled={isGenerating}>清空配置项</Button>
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

