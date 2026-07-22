import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
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

interface LeftPanelProps { input: ProductInput; onChange: (input: ProductInput) => void; disabled: boolean; isGenerating: boolean; onGenerate: (rawText?: string) => void; hasRequiredFields: boolean; priceDialogOpen: boolean; setPriceDialogOpen: (v: boolean) => void; platforms: { name: string; price: string; spec: string; enabled: boolean }[]; setPlatforms: (v: { name: string; price: string; spec: string; enabled: boolean }[]) => void; priceNotes: string; setPriceNotes: (v: string) => void; classifiedImages: ClassifiedImage[]; onImagesClassified: (images: ClassifiedImage[]) => void; onFileRegistered?: (id: string, file: File) => void; onConfirmImages?: (images: ClassifiedImage[]) => void; onOpenImageConfirm?: () => void; onClearClassifiedImages?: () => void; onRemoveClassifiedImage?: (id: string) => void; onImageClassified?: (image: ClassifiedImage) => void; onAllClassified?: () => void }
interface FormErrors { productName?: string; subCategory?: string; netWeight?: string; suggestedPrice?: string; groupBuyPrice?: string; afterSalesRules?: string }

const SHELF_LIFE_UNITS: { key: ShelfLifeUnit; label: string }[] = [{ key: 'day', label: '天' }, { key: 'month', label: '月' }, { key: 'year', label: '年' }]
const FIELD_LABELS: Record<string, string> = { productName: '商品名称', subCategory: '二级子品类', netWeight: '规格净含量', origin: '产地', suggestedPrice: '建议售价', sellingPoints: '核心卖点', coreIngredients: '核心配料/原料', shippingOrigin: '发货地', shippingTimeliness: '发货时效', courier: '快递公司', afterSalesRules: '售后规则', brandBackground: '品牌背景', targetAudience: '适用人群', usageScene: '使用场景', shelfLifeValue: '保质期' }



export function LeftPanel({ input, onChange, disabled, isGenerating, onGenerate, priceDialogOpen, setPriceDialogOpen, platforms, setPlatforms, priceNotes, setPriceNotes, classifiedImages, onImagesClassified, onFileRegistered, onConfirmImages, onOpenImageConfirm, onClearClassifiedImages, onRemoveClassifiedImage, onImageClassified, onAllClassified }: LeftPanelProps) {

  const [aiOpen, setAiOpen] = useState(true); const [productOpen, setProductOpen] = useState(true); const [fileTab, setFileTab] = useState('paste'); const [pasteText, setPasteText] = useState(''); const [extractLoading, setExtractLoading] = useState(false); const fileInputRef = useRef<HTMLInputElement>(null); const docInputRef = useRef<HTMLInputElement>(null)
  const hasPrice = useMemo(() => { const t = pasteText; if (!t.trim()) return true; return /[¥￥]\s*\d+(\.\d+)?/.test(t) || /\d+(\.\d+)?\s*[元块角分]/.test(t) || /(?:开团价|团购价|售价|价格|单价|原价|参考价|市场价|现价|到手价)\s*[：:]*\s*\d+(\.\d+)?/.test(t) }, [pasteText])
  // 图片分类
  type ImageFile = { id: string; file: File; status: 'pending' | 'compressing' | 'classifying' | 'done' | 'error'; error?: string; type?: string; desc?: string; preview?: string; imageContentSummary?: string; suggestedModule?: string }
  const [imageFiles, setImageFiles] = useState<ImageFile[]>([]); const [imageClassifyLoading, setImageClassifyLoading] = useState(false);  const [classifyProgress, setClassifyProgress] = useState<{ done: number; total: number } | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const compressionCacheRef = useRef<Map<string, { base64: string; mimeType: string }>>(new Map())
  // 当弹窗保存后 classifiedImages 更新时，同步 type/desc 到本地 imageFiles
  const classifiedMap = useMemo(() => {
    const map = new Map<string, { type: string; desc: string }>()
    classifiedImages.forEach(c => map.set(c.id, { type: c.type, desc: c.desc }))
    return map
  }, [classifiedImages])
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [errors, setErrors] = useState<FormErrors>({}); const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'info' | 'warning' } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = useCallback((msg: string, type: 'info' | 'warning' = 'warning') => { setToast({ msg, type }); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 3000) }, [])
  const checkCategoryChange = useCallback((newL1: string, newL2: string, newL3: string): boolean => { if (classifiedImages.length === 0) return true; const avail = newL3 ? getAvailableModules(newL1, newL2, newL3) : newL1 ? (DEFAULT_MODULE_ORDER[newL1] || DEFAULT_MODULE_ORDER['__default__']) : []; if (avail.length === 0) return true; const orphaned = classifiedImages.filter(img => { const sug = (img as any).suggestedModule; return sug && !avail.includes(sug) }); if (orphaned.length === 0) return true; return confirm(`切换到该类目后，${orphaned.length} 张图片将失去对应模块（${[...new Set(orphaned.map(i => (i as any).suggestedModule))].join('、')}），图片将被标红。确定切换吗？`) }, [classifiedImages])

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
  type UploadFile = { id: string; file: File; status: 'pending' | 'parsing' | 'analyzing' | 'done' | 'error'; text?: string; error?: string }
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]); const [parseLoading, setParseLoading] = useState(false)
  const [extractedFields, setExtractedFields] = useState<Record<string, string> | null>(null); const [confirmOpen, setConfirmOpen] = useState(false); const [dragOver, setDragOver] = useState(false)
  const addFiles = (files: FileList | File[]) => { const arr = Array.from(files); const valid = arr.filter(f => /\.(docx?|txt|xlsx?|csv|pdf)$/i.test(f.name) || f.type.includes('text') || f.type.includes('pdf') || f.type.includes('spreadsheet') || f.type.includes('document')); if (valid.length === 0) return; setUploadFiles(prev => [...prev, ...valid.map(f => ({ id: Date.now().toString(36)+Math.random().toString(36).slice(2), file: f, status: 'pending' as const }))]) }
  // 上传文档后自动解析
  useEffect(() => { const pending = uploadFiles.filter(f => f.status === 'pending'); if (pending.length > 0) { handleParseAll() } }, [uploadFiles])
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
    if (combined.trim()) {
      // 标记为分析中
      setUploadFiles(prev => prev.map(f => f.status === 'done' ? { ...f, status: 'analyzing' as const } : f))
      // 用 AI 从文件中提取结构化信息
      try {
        const res = await fetch('/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: combined }) })
        const d = await res.json()
        if (d.success && d.data) {
          const r = d.data
          const lines = [
            `【品名】: ${r.productName || ''}`,
            `【规格】: ${r.netWeight || ''}`,
            `【价格】: ${r.suggestedPrice || ''}`,
            `【产地】: ${r.origin || ''}`,
            `【发货地】: ${r.shippingOrigin || ''}`,
            `【生产日期】: ${r.productionDate || ''}`,
            `【保质期】: ${r.shelfLifeValue || ''}${r.shelfLifeUnit === 'month' ? '个月' : r.shelfLifeUnit === 'day' ? '天' : ''}`,
            `【发货时效】: ${r.shippingTimeliness || ''}`,
            `【快递公司】: ${r.courier || ''}`,
            `【补邮费地区及补邮费用】: ${r.extraShippingFeeAreas || ''}`,
            `【不发地区】: ${r.noShippingAreas || ''}`,
            `【售后说明】: ${r.afterSalesRules || ''}`,
            `【适用人群】: ${r.targetAudience || ''}`,
            `【使用场景】: ${r.usageScene || ''}`,
            `【补充说明】: ${r.additionalNotes || ''}`,
          ]
          setPasteText(prev => { const existing = prev.trim(); return existing ? existing + '\n\n' + lines.join('\n') : lines.join('\n') })
        }
      } catch {}
      setUploadFiles(prev => prev.map(f => f.status === 'analyzing' ? { ...f, status: 'done' as const } : f))
    }
    setParseLoading(false) }
  const [extractSPLoading, setExtractSPLoading] = useState(false)
  const [extractHeadlineLoading, setExtractHeadlineLoading] = useState(false)
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

    // debounce 1.2s — 锁定两个卡片
    setExtractDebouncing(true)
    setExtractHeadlineLoading(true)
    setExtractSPLoading(true)
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
        if (!d.success || !d.data) { setCategoryHint({ type: 'info', text: '未识别到匹配类目，请手动选择' }); setExtractHeadlineLoading(false); setExtractSPLoading(false); return }

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
            // 类目匹配成功 → 自动触发笔记标题和推荐理由
            const latestInput = { ...fieldUpdates }
            const sourceText = text
            setTimeout(async () => {
              try {
                const [hlRes, spRes] = await Promise.all([
                  fetch("/api/generate-headline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product: latestInput }) }),
                  fetch("/api/extract/selling-points", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: sourceText }) })
                ])
                const [hlD, spD] = await Promise.all([hlRes.json(), spRes.json()])
                const patch: any = {}
                if (hlD.success && hlD.data?.headline) patch.headline = String(hlD.data.headline)
                if (spD.success && spD.data?.points?.length > 0) patch.sellingPoints = spD.data.points.join("\n")
                if (Object.keys(patch).length > 0) onChange({ ...fieldUpdates, ...patch })
              } catch {}
              setExtractHeadlineLoading(false)
              setExtractSPLoading(false)
            }, 600)

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
          setExtractHeadlineLoading(false)
          setExtractSPLoading(false)
          if (!r.catLevel1 && !r.catLevel2 && !r.catLevel3) {
            setCategoryHint({ type: 'info', text: '未识别到匹配类目，请手动选择' })
          }
        }
      } catch {
        setCategoryHint({ type: 'info', text: '未识别到匹配类目，请手动选择' })
        setExtractHeadlineLoading(false)
        setExtractSPLoading(false)
      }
    }, 1200)

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
      setExtractHeadlineLoading(false)
      setExtractSPLoading(false)
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

  // ============================================================
  // 图片压缩（v2：迭代降级链，长边 1024px，统一 JPEG，带缓存）
  // ============================================================
  const MAX_LONGEST_EDGE = 1024
  const MAX_ORIGINAL_SIZE_MB = 10
  const MAX_BASE64_BYTES = 500000

  const loadImageFromFile = (file: File): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('图片加载失败'))
      img.src = reader.result as string
    }
    reader.onerror = () => reject(new Error('读取失败'))
    reader.readAsDataURL(file)
  })

  const compressCanvas = (img: HTMLImageElement, longestEdge: number, quality: number): { base64: string; mimeType: string } => {
    const maxDim = Math.max(img.width, img.height)
    const scale = Math.min(1, longestEdge / maxDim)
    const w = Math.round(img.width * scale)
    const h = Math.round(img.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, w, h)
    return { base64: canvas.toDataURL('image/jpeg', quality).split(',')[1], mimeType: 'image/jpeg' }
  }

  const compressImageIterative = async (file: File): Promise<{ base64: string; mimeType: string }> => {
    const sizeMB = file.size / (1024 * 1024)
    if (sizeMB > MAX_ORIGINAL_SIZE_MB) {
      showToast(`图片较大（${sizeMB.toFixed(1)} MB），处理可能稍慢`, 'info')
    }
    const img = await loadImageFromFile(file)
    const chain = [
      { longestEdge: 1024, quality: 0.7 },
      { longestEdge: 1024, quality: 0.6 },
      { longestEdge: 1024, quality: 0.5 },
      { longestEdge: 768, quality: 0.7 },
      { longestEdge: 768, quality: 0.5 },
    ]
    for (const step of chain) {
      const result = compressCanvas(img, step.longestEdge, step.quality)
      if (result.base64.length <= MAX_BASE64_BYTES) return result
    }
    return compressCanvas(img, 768, 0.5)
  }

  // ============================================================
  // 重试工具
  // ============================================================
  const MAX_RETRIES = 5

  const calcBackoff = (attempt: number): number => {
    const base = Math.pow(2, attempt - 1) * 1000
    const jitter = base * (0.75 + Math.random() * 0.5)
    return Math.floor(jitter)
  }

  const shouldRetry = (status: number): boolean => {
    if (status === 408 || status === 429) return true
    if (status >= 400 && status < 500) return false
    if (status >= 500) return true
    return true
  }

  // ============================================================
  // 单张图片分类（压缩 → 语料匹配 → doubao，含重试）
  // ============================================================
  const classifySingleImage = async (
    f: ImageFile,
    signal: AbortSignal
  ): Promise<void> => {
    if (signal.aborted) return

    setImageFiles(prev => prev.map(p => p.id === f.id ? { ...p, status: 'compressing' as const } : p))
    let compressed = compressionCacheRef.current.get(f.id)
    try {
      if (!compressed) {
        compressed = await compressImageIterative(f.file)
        compressionCacheRef.current.set(f.id, compressed)
      }
    } catch {
      setImageFiles(prev => prev.map(p => p.id === f.id ? { ...p, status: 'error' as const, error: '压缩失败' } : p))
      return
    }

    if (signal.aborted) return

    const preview = `data:${compressed.mimeType};base64,${compressed.base64}`
    setImageFiles(prev => prev.map(p => p.id === f.id ? { ...p, preview, status: 'classifying' as const } : p))

    // 语料库匹配
    let corpusResult: any = null
    try {
      const hash = await computeImageHash(f.file)
      const matchRes = await fetch('/api/images/match-corpus', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hashes: [{ id: f.id, hash }] }),
        signal
      })
      if (matchRes.ok) {
        const matchData = await matchRes.json()
        if (matchData.success && matchData.data?.matches?.[f.id]) {
          corpusResult = matchData.data.matches[f.id]
        }
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return
    }

    if (corpusResult) {
      const classified: ClassifiedImage = {
        id: f.id, type: corpusResult.type, desc: corpusResult.desc || '',
        preview,
        imageContentSummary: corpusResult.imageContentSummary || '',
        imageOcrText: corpusResult.imageOcrText || '',
        suggestedModule: corpusResult.suggestedModule || '',
        layout_role: corpusResult.layout_role || 'detail'
      }
      setImageFiles(prev => prev.map(p => p.id === f.id ? { ...p, status: 'done' as const, type: classified.type, desc: classified.desc, preview, imageContentSummary: classified.imageContentSummary, suggestedModule: classified.suggestedModule } : p))
      onImageClassified?.(classified)
      return
    }

    if (signal.aborted) return

    // 豆包分析（含重试）
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      if (signal.aborted) return

      const retryLabel = attempt > 1 ? `第${attempt}次重试` : undefined
      setImageFiles(prev => prev.map(p => p.id === f.id ? { ...p, error: retryLabel } : p))

      try {
        const res = await fetch('/api/images/classify/single', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64: compressed!.base64, mimeType: compressed!.mimeType }),
          signal
        })

        if (!res.ok) {
          if (shouldRetry(res.status) && attempt < MAX_RETRIES) {
            const delay = res.status === 429
              ? parseInt(res.headers.get('Retry-After') || '0') * 1000 || calcBackoff(attempt)
              : calcBackoff(attempt)
            await new Promise(r => setTimeout(r, delay))
            continue
          }
          throw new Error(`HTTP ${res.status}`)
        }

        const d = await res.json()
        if (d.success && d.data) {
          const result = d.data
          const classified: ClassifiedImage = {
            id: f.id, type: result.type || '', desc: result.desc || '',
            preview,
            imageContentSummary: result.imageContentSummary || '',
            imageOcrText: result.imageOcrText || '',
            suggestedModule: result.suggestedModule || '',
            layout_role: result.layout_role || 'detail'
          }
          setImageFiles(prev => prev.map(p => p.id === f.id ? { ...p, status: 'done' as const, type: classified.type, desc: classified.desc, preview, imageContentSummary: classified.imageContentSummary, suggestedModule: classified.suggestedModule, error: undefined } : p))
          onImageClassified?.(classified)
          return
        }

        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, calcBackoff(attempt)))
          continue
        }
        throw new Error('Vision API 返回异常')
      } catch (e: any) {
        if (e.name === 'AbortError') return
        if (attempt < MAX_RETRIES && shouldRetry(0)) {
          await new Promise(r => setTimeout(r, calcBackoff(attempt)))
          continue
        }
        setImageFiles(prev => prev.map(p => p.id === f.id ? { ...p, status: 'error' as const, error: attempt >= MAX_RETRIES ? `重试${MAX_RETRIES}次后失败` : (e.message || '分析失败') } : p))
        return
      }
    }

    setImageFiles(prev => prev.map(p => p.id === f.id ? { ...p, status: 'error' as const, error: `重试${MAX_RETRIES}次后失败` } : p))
  }

  // ============================================================
  // 图片分析主入口（并发槽位 + AbortController）
  // ============================================================
  const CONCURRENCY = 5

  const handleImageClassify = async () => {
    if (imageClassifyLoading && abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setImageClassifyLoading(false)
      setClassifyProgress(null)
      setImageFiles(prev => prev.map(f =>
        f.status === 'compressing' || f.status === 'classifying'
          ? { ...f, status: 'pending' as const, error: undefined }
          : f
      ))
      return
    }

    const pending = imageFiles.filter(f => f.status === 'pending')
    if (pending.length === 0) return

    setImageClassifyLoading(true)
    setClassifyProgress({ done: 0, total: pending.length })

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    let completed = 0
    let nextIndex = 0

    const worker = async (): Promise<void> => {
      while (nextIndex < pending.length && !abortController.signal.aborted) {
        const idx = nextIndex++
        const f = pending[idx]
        await classifySingleImage(f, abortController.signal)
        completed++
        setClassifyProgress({ done: completed, total: pending.length })
      }
    }

    const workerCount = Math.min(CONCURRENCY, pending.length)
    const workers = Array.from({ length: workerCount }, () => worker())
    await Promise.all(workers)

    abortControllerRef.current = null
    setImageClassifyLoading(false)
    setClassifyProgress({ done: completed, total: pending.length })
    setTimeout(() => setClassifyProgress(null), 1500)
    onAllClassified?.()
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

  const handleGenerateHeadline = async () => {
    if (extractHeadlineLoading) return
    setExtractHeadlineLoading(true)
    try {
      const res = await fetch('/api/generate-headline', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: input })
      })
      const d = await res.json()
      if (d.success && d.data.headline) updateField('headline', d.data.headline)
    } catch {}
    setExtractHeadlineLoading(false)
  }

  return (<div className="flex flex-col h-full">{toast && (<div className={`absolute top-2 left-1/2 -translate-x-1/2 z-[999] flex items-center gap-2 rounded-lg border px-3 py-2 text-xs shadow-lg whitespace-nowrap ${toast.type === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`}><svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0"><circle cx="7.5" cy="7.5" r="6"/><path d="M7.5 4.5v3M7.5 10v.5"/></svg><span>{toast.msg}</span></div>)}
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto px-4 pt-3 gap-2">
    {/* AI自动分析商品信息 */}
    <Collapsible open={aiOpen} onOpenChange={setAiOpen}><CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors">AI自动分析商品信息<svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" className={'shrink-0 text-muted-foreground transition-transform duration-200 ' + (aiOpen ? 'rotate-90' : '')}><path d="M5.5 2.5l5 5-5 5" /></svg></CollapsibleTrigger><CollapsibleContent className="pt-2">
      <div className="flex flex-col gap-2">
        <div className="flex items-center rounded-lg bg-muted p-0.5"><button onClick={() => setFileTab('paste')} className={"flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200 " + (fileTab === 'paste' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground')}>商品信息</button><button onClick={() => setFileTab('upload')} className={"flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200 " + (fileTab === 'upload' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground')}>我的商品图</button></div>
        

{fileTab === 'upload' ? (<div className="flex flex-col gap-2" onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }} onDragLeave={e => { e.preventDefault(); const rect = e.currentTarget.getBoundingClientRect(); const { clientX, clientY } = e; if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) setDragOver(false) }} onDrop={e => { e.preventDefault(); e.stopPropagation(); setDragOver(false); if (e.dataTransfer.files) { const imgs = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')); if (imgs.length > 0) addImages(imgs) } }}><div className="flex items-center justify-between"><div className="flex flex-col gap-0.5"><span className="text-xs text-muted-foreground">我可以帮您解析商品图片并排版（支持拖拽图片到编辑区自行更改）</span></div><input ref={fileInputRef} type="file" className="hidden" accept="image/*" multiple onChange={e => { if (!e.target.files) return; const imgs = Array.from(e.target.files).filter(f => f.type.startsWith('image/')); if (imgs.length > 0) addImages(imgs); e.target.value = '' }} /></div>
{(imageFiles.length > 0) ? (<div style={{maxHeight: Math.min(192 + Math.max(0, imageFiles.length - 2) * 12, 384) + 'px', minHeight: '192px'}} className={`flex flex-col gap-1.5 overflow-y-auto rounded-lg border p-2 transition-colors ${dragOver ? 'border-[#07C160] bg-emerald-50/30' : 'border-border/50 bg-muted/20'}`}>
{imageFiles.length > 0 && (<div className="grid grid-cols-3 gap-2 mt-2">
{imageFiles.map((f, i) => (<div key={f.id} className={`relative rounded-md border overflow-hidden ${f.status === 'error' ? 'border-red-200 bg-red-50' : f.status === 'done' ? 'border-emerald-200 bg-emerald-50/40' : 'border-border bg-card'}`}>
<div className="relative aspect-square cursor-pointer overflow-hidden group" draggable onDragStart={e => { const url = f.preview || (f.file && URL.createObjectURL(f.file)); if (url) { (window as any).__dragImageData__ = { src: url, alt: f.desc || f.file?.name || '' }; e.dataTransfer.setData('text/plain', 'x') } }} onClick={() => { const url = f.preview || (f.file && URL.createObjectURL(f.file)); if (url) setPreviewUrl(url) }}>
{f.preview ? <img src={f.preview} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full bg-muted flex items-center justify-center text-[10px] text-muted-foreground">图{i+1}</div>}
<button onClick={e => { e.stopPropagation(); removeImage(f.id) }} className="absolute top-1 right-1 size-5 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"><svg width="12" height="12" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3.5 3.5l8 8M11.5 3.5l-8 8"/></svg></button>
{f.status === 'pending' && <div className="absolute inset-0 bg-black/20 flex items-center justify-center"><span className="text-[10px] text-white bg-black/50 px-1.5 py-0.5 rounded">{imageClassifyLoading ? '排队中' : '等待分析'}</span></div>}
{f.status === 'compressing' && <div className="absolute inset-0 bg-black/20 flex items-center justify-center"><span className="text-[10px] text-white bg-black/50 px-1.5 py-0.5 rounded">压缩中</span></div>}
{f.status === 'classifying' && <div className="absolute inset-0 bg-black/20 flex items-center justify-center flex-col gap-0.5"><span className="inline-block size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />{f.error && <span className="text-[9px] text-white bg-black/40 px-1 rounded">{f.error}</span>}</div>}
{f.status === 'error' && <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center"><span className="text-[10px] text-red-600 bg-white/90 px-1.5 py-0.5 rounded">{f.error || '失败'}</span></div>}
{(f.status === 'done' || f.status === 'error') && (() => {
  const sugMod = f.suggestedModule || (classifiedMap.get(f.id) as any)?.suggestedModule
  const label = sugMod ? (MODULE_CONFIG.find(m => m.key === sugMod)?.label || f.type || '未分类') : (f.type || '未分类')
  return <span className={`absolute bottom-1.5 left-1.5 text-[9px] px-1.5 py-0.5 rounded leading-tight ${f.status === 'error' ? 'bg-red-100/90 border border-red-200 text-red-700' : 'bg-emerald-50/90 border border-emerald-200 text-emerald-700'}`}>{label}</span>
})()}
</div>
<div className="px-1.5 py-1"><p className="text-[10px] text-muted-foreground truncate leading-tight">{f.file?.name || '(未知)'}</p></div>
</div>))}
</div>)}
</div>) : (<div className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card py-8 px-4 cursor-pointer transition-colors hover:border-muted-foreground/30" onClick={() => fileInputRef.current?.click()} style={dragOver ? { borderColor: '#07C160', backgroundColor: 'hsl(160 60% 35% / 0.08)' } : undefined}><div className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/80 transition-colors"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7.5 1.5v8m0 0l-2-2m2 2l2-2M2.5 7.5v4a1 1 0 001 1h8a1 1 0 001-1v-4"/></svg>{dragOver ? '松手即可上传' : '上传文件或拖拽至此'}</div><p className="text-[11px] text-muted-foreground/60">支持图片（jpg/png/gif/WebP），支持拖拽上传</p></div>)}
{imageFiles.length > 0 && (<div className="flex flex-col gap-2"><div className="flex items-center gap-2">{(() => { const failedCount = classifiedImages.filter(img => !img.desc || img.desc === '分析失败').length; return <span className="text-[10px] text-muted-foreground/60">共 {imageFiles.length} 张图{failedCount > 0 && <>, <span className="text-red-400">{failedCount} 张失败</span></>}，{classifiedImages.length > 0 ? <span className="text-blue-500 cursor-pointer hover:text-blue-600 underline" onClick={(e) => { e.stopPropagation(); onOpenImageConfirm?.() }}>查看解析</span> : <span className="text-muted-foreground/40">查看解析</span>}</span>})()}<div className="flex-1" /><button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"><svg width="11" height="11" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7.5 2v11M2 7.5h11"/></svg>添加</button><button onClick={() => { if (confirm('确定要删除所有已上传的图片吗？')) { setImageFiles([]); onClearClassifiedImages?.() } }} className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] text-red-400 hover:text-red-600 hover:bg-red-50/50 transition-colors"><svg width="11" height="11" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2.5 4.5h10M5.5 4.5V3a1 1 0 011-1h2a1 1 0 011 1v1.5M4.5 4.5l.5 8.5a1 1 0 001 1h3a1 1 0 001-1l.5-8.5"/></svg>清空</button></div><button onClick={() => { handleImageClassify() }} className="ai-glow-btn ai-glow-btn--active w-full rounded-full flex items-center justify-center gap-2 text-xs px-4 py-2.5">
  {imageClassifyLoading ? (
    <span className="text-red-500">{classifyProgress ? `⏹ 停止分析 ${classifyProgress.done}/${classifyProgress.total}` : '⏹ 停止分析'}</span>
  ) : '立即分析'}
</button></div>)}</div>) : fileTab === 'paste' ? (<div className="flex flex-col gap-2">
        {/* 文档上传区 */}
        <div onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }} onDragLeave={e => { e.preventDefault(); const rect = e.currentTarget.getBoundingClientRect(); const { clientX, clientY } = e; if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) setDragOver(false) }} onDrop={e => { e.preventDefault(); e.stopPropagation(); setDragOver(false); if (e.dataTransfer.files) { const files = e.dataTransfer.files; const docs = []; Array.from(files).forEach(f => { if (!f.type.startsWith('image/')) docs.push(f) }); if (docs.length > 0) addFiles(docs) } }}>
        <input ref={docInputRef} type="file" className="hidden" accept=".doc,.docx,.txt,.xlsx,.xls,.csv,.pdf" multiple onChange={e => { if (!e.target.files) return; const docs = []; Array.from(e.target.files).forEach(f => { if (!f.type.startsWith('image/')) docs.push(f) }); if (docs.length > 0) addFiles(docs); e.target.value = '' }} />
        {uploadFiles.length > 0 ? (<div className="flex flex-col gap-1"><div className="flex items-center justify-between"><span className="text-[10px] text-muted-foreground/60">已上传 {uploadFiles.length} 个文档</span><div className="flex items-center gap-1"><button onClick={() => docInputRef.current?.click()} disabled={parseLoading} className="text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-30">添加</button><span className="w-3" /><button onClick={() => { if (confirm('确定要删除所有文档吗？')) setUploadFiles([]) }} className="text-[10px] text-red-400 hover:text-red-600">清空</button></div></div>{uploadFiles.map(uf => (<div key={uf.id} className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs shrink-0 ${uf.status === 'error' ? 'border-red-200 bg-red-50' : uf.status === 'done' ? 'border-emerald-200 bg-emerald-50' : 'border-border bg-card'}`}><span className="shrink-0 text-sm">📄</span><span className="flex-1 truncate font-medium">{uf.file?.name || '(未知)'}</span><span className="text-[10px] text-muted-foreground shrink-0">{((uf.file?.size || 0) / 1024).toFixed(1)}KB</span>{uf.status === 'parsing' && <span className="inline-block size-3 animate-spin rounded-full border-2 border-amber-400 border-t-transparent shrink-0" />}{uf.status === 'analyzing' && <span className="inline-block size-3 animate-spin rounded-full border-2 border-blue-400 border-t-transparent shrink-0" />}{uf.status === 'done' && <svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke="#07C160" strokeWidth="1.5" className="shrink-0"><path d="M4.5 7.5l2 2 4-4"/></svg>}{uf.status === 'error' && <span className="text-[10px] text-red-500 shrink-0">{uf.error || '解析失败'}</span>}<button onClick={() => removeFile(uf.id)} className="text-muted-foreground/30 hover:text-destructive shrink-0"><svg width="12" height="12" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3.5 3.5l8 8M11.5 3.5l-8 8"/></svg></button></div>))}</div>) : (<div className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-card py-1.5 px-2 cursor-pointer transition-colors hover:border-muted-foreground/30 text-[10px] text-muted-foreground" onClick={() => docInputRef.current?.click()} style={dragOver ? { borderColor: '#07C160', backgroundColor: 'hsl(160 60% 35% / 0.08)' } : undefined}><svg width="11" height="11" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7.5 2v11M2 7.5h11"/></svg>{dragOver ? '松手即可上传' : '可拖拽上传文件帮你分析（word/excel/pdf）'}</div>)}
        </div>
        <Textarea rows={10} placeholder="在此粘贴商品资料文本，AI将自动识别并提取关键字段（如：价格、规格、卖点等）" value={pasteText} onChange={e => setPasteText(e.target.value)} className="text-xs" />{pasteText.trim() && !hasPrice && (<p className="text-[11px] text-amber-600">⚠️ 未检测到价格信息，生成时请自行在文案中填写价格</p>)}
        </div>) : null}
      </div>
    </CollapsibleContent></Collapsible>

    <div className="flex flex-col gap-4">



      {/* 生成内容设置 */}
      <div className="rounded-lg px-3 py-2 text-sm font-medium">生成内容设置</div>
      <div className="flex flex-col gap-4">

      <Card><CardHeader className="pb-3"><div className="flex items-center justify-between"><CardTitle className="text-sm">笔记标题（首屏钩子）</CardTitle><Button variant="secondary" size="sm" className="ai-glow-btn gap-1 rounded-full" onClick={handleGenerateHeadline} disabled={extractHeadlineLoading || !pasteText.trim()}>{extractHeadlineLoading ? <><span className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />AI 生成中...</> : "帮我写"}</Button></div></CardHeader><CardContent><div className="flex flex-col gap-1.5"><Textarea id="headline" rows={input.headline?.trim() ? 15 : 5} placeholder="AI将基于商品信息生成结构化的首屏吸睛文案（信息卡风格，含emoji锚点）。也可手动输入编辑..." value={input.headline} onChange={e => updateField("headline", e.target.value)} disabled={disabled || extractHeadlineLoading || !pasteText.trim() || parseLoading} /></div></CardContent></Card>

      <Card><CardHeader className="pb-3"><div className="flex items-center justify-between"><CardTitle className="text-sm">推荐理由（核心卖点）</CardTitle><Button variant="secondary" size="sm" className="ai-glow-btn gap-1 rounded-full" onClick={handleExtractSellingPoints} disabled={extractSPLoading || !pasteText.trim()}>{extractSPLoading ? <><span className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />AI 提炼中...</> : "帮我写"}</Button></div></CardHeader><CardContent><div className="flex flex-col gap-1.5"><Textarea id="sellingPoints" rows={input.sellingPoints?.trim() ? 12 : 4} placeholder="每行一条推荐理由，手动输入 3-6 条，约 200 字" value={input.sellingPoints} onChange={e => updateField("sellingPoints", e.target.value)} disabled={disabled || extractSPLoading || !pasteText.trim()} /></div></CardContent></Card>

      </div>

            {/* 笔记结构 */}
      <Card><CardHeader className="pb-3"><div className="flex items-center justify-between"><CardTitle className="text-sm">笔记结构</CardTitle><Button variant="ghost" size="sm" className="text-xs h-6 text-primary" onClick={() => { const order = DEFAULT_MODULE_ORDER[input.catLevel1] || DEFAULT_MODULE_ORDER['__default__']; const avail = input.catLevel3 ? getAvailableModules(input.catLevel1, input.catLevel2, input.catLevel3) : MODULE_CONFIG.map(m => m.key); const ordered = order.filter(k => avail.includes(k)); const extra = avail.filter(k => !ordered.includes(k)); const fullOrder = [...ordered, ...extra]; const sel = input.selectedModules.filter(k => fullOrder.includes(k)); sel.sort((a, b) => fullOrder.indexOf(a) - fullOrder.indexOf(b)); onChange({ ...input, moduleOrder: fullOrder, selectedModules: sel }) }}>默认排序</Button></div></CardHeader><CardContent><div className="flex flex-col gap-3 mb-3"><div className={fieldCls}><Label className="text-xs text-muted-foreground">一级类目</Label><Select value={input.catLevel1} onValueChange={v => { if (!checkCategoryChange(v, '', '')) return; userManuallyChangedCategoryRef.current = true; onChange({ ...input, catLevel1: v, catLevel2: '', catLevel3: '', catCode: '', selectedModules: [], moduleOrder: [] }) }}><SelectTrigger className="h-8 text-sm"><span>{input.catLevel1 || '请选择'}</span></SelectTrigger><SelectContent><SelectGroup>{CATEGORIES.level1s.map(l1 => <SelectItem key={l1} value={l1}>{l1}</SelectItem>)}</SelectGroup></SelectContent></Select></div>{input.catLevel1 && <div className={fieldCls}><Label className="text-xs text-muted-foreground">二级类目</Label><Select value={input.catLevel2} onValueChange={v => { userManuallyChangedCategoryRef.current = true; onChange({ ...input, catLevel2: v, catLevel3: '', catCode: '' }) }}><SelectTrigger className="h-8 text-sm"><span>{input.catLevel2 || '请选择'}</span></SelectTrigger><SelectContent><SelectGroup>{(CATEGORIES.byLevel1[input.catLevel1]?.level2s || []).map(l2 => <SelectItem key={l2} value={l2}>{l2}</SelectItem>)}</SelectGroup></SelectContent></Select></div>}{input.catLevel1 && input.catLevel2 && <div className={fieldCls}><Label className="text-xs text-muted-foreground">三级类目</Label><Select value={input.catLevel3} onValueChange={v => { if (!checkCategoryChange(input.catLevel1, input.catLevel2, v)) return; userManuallyChangedCategoryRef.current = true;const defModules = getDefaultModules(input.catLevel1, input.catLevel2, v);const availModules = getAvailableModules(input.catLevel1, input.catLevel2, v);const code = makeCatCode(input.catLevel1, input.catLevel2, v);const order = DEFAULT_MODULE_ORDER[input.catLevel1] || DEFAULT_MODULE_ORDER['__default__'];const newOrder = order.filter(k => availModules.includes(k));onChange({ ...input, catLevel3: v, catCode: code, selectedModules: defModules, moduleOrder: newOrder })}}><SelectTrigger className="h-8 text-sm"><span>{input.catLevel3 || '请选择'}</span></SelectTrigger><SelectContent><SelectGroup>{(CATEGORIES.byLevel1[input.catLevel1]?.byLevel2[input.catLevel2] || []).map(l3 => <SelectItem key={l3} value={l3}>{l3}</SelectItem>)}</SelectGroup></SelectContent></Select></div>}{categoryHint && (<p className={'text-[10px] mt-1 ' + (categoryHint.type === 'success' ? 'text-emerald-500' : categoryHint.type === 'warning' ? 'text-amber-500' : 'text-muted-foreground')}>{categoryHint.text}</p>)}{extractDebouncing && (<div className="h-0.5 mt-1 rounded-full bg-gradient-to-r from-transparent via-primary/40 to-transparent animate-pulse" />)}</div><div className="flex flex-col gap-1.5">
        {moduleOrder.map((key, index) => { const m = MODULE_CONFIG.find(mod => mod.key === key); if (!m) return null
          // 判断模块状态：mandatory = 不可取消，recommended = 默认勾选可取消，optional = 默认不勾选
          const config = input.catLevel3 ? getModuleConfig(input.catLevel1, input.catLevel2, input.catLevel3) : null
          const isMandatory = config ? config.mandatory.includes(key) : (m.scope === 'common' && ['hook','price','cta'].includes(key))
          const isSelected = input.selectedModules.includes(key)
          const handleToggle = () => { if (dragIndex !== null || isMandatory) return; userTouchedModulesRef.current.add(key); const isSel = input.selectedModules.includes(key); const sel = isSel ? input.selectedModules.filter(k => k !== key) : [...input.selectedModules, key]; if (isSel && classifiedImages.length > 0) { const orphaned = classifiedImages.filter(img => (img as any).suggestedModule === key); if (orphaned.length > 0) showToast(`「${m.label}」下有 ${orphaned.length} 张图片将不被排版`, 'warning') } updateField('selectedModules', sel) }
          return (<div key={m.key} draggable onDragStart={e => handleDragStart(e, index)} onDragOver={e => handleDragOver(e, index)} onDragEnd={handleDragEnd}
            onClick={handleToggle}
            className={'flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 transition-all duration-150 cursor-pointer select-none ' + (dragIndex === index ? 'opacity-30 bg-muted/10' : isMandatory ? 'bg-muted/40' : 'bg-muted/20')}>
            <span className="text-muted-foreground/40 cursor-grab active:cursor-grabbing text-xs leading-none select-none shrink-0">⋮⋮</span>
            <span onClick={e => e.stopPropagation()}><Checkbox checked={isSelected} disabled={isMandatory} onCheckedChange={handleToggle} className="shrink-0" /></span>
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

    {/* 图片预览遮罩 — Portal 到 body，绕过 backdrop-blur 包含块限制 */}
    {previewUrl && createPortal(
      <div className="fixed inset-0 z-[999] bg-black/70 flex items-center justify-center p-8" onClick={() => setPreviewUrl(null)} onKeyDown={e => { if (e.key === 'Escape') setPreviewUrl(null) }} tabIndex={0} ref={el => el?.focus()}>
        <img src={previewUrl} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" alt="预览" onClick={e => e.stopPropagation()} />
        <button onClick={() => setPreviewUrl(null)} className="absolute top-4 right-4 size-10 rounded-full bg-white/20 hover:bg-white/40 text-white flex items-center justify-center text-xl transition-colors">✕</button>
      </div>,
      document.body
    )}
  </div>)
}

