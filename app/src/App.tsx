import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { LeftPanel } from '@/components/panels/LeftPanel'
import { CenterPanel } from '@/components/panels/CenterPanel'
import { ImageConfirmDialog, type ModuleSuggestion } from '@/components/ui/image-confirm-dialog'
import { RightPanel } from '@/components/panels/RightPanel'
import { MODULE_CONFIG, STYLE_CONFIG, SHORT_TEMPLATE, STYLE_LABEL_MAP } from '@/config/modules'
import type { ProductInput, ModuleResult, GenerateStatus, ModuleKey, ContentStyle, ShippingTimeliness, GenerateCount, ClassifiedImage } from '@/types'
import { IMAGE_MODULE_MAP } from '@/types'

const DEFAULT_INPUT: ProductInput = {
  productName: '', subCategory: '' as const, catCode: '美食酒水::酒水饮料::乳制品', catLevel1: '美食酒水', catLevel2: '酒水饮料', catLevel3: '乳制品', netWeight: '',
  origin: '', suggestedPrice: '', groupBuyPrice: '',
  sellingPoints: '',
  coreIngredients: '',
  shippingOrigin: '', shippingTimeliness: '48h' as ShippingTimeliness, courier: '',
  afterSalesRules: '',
  brandBackground: '',
  targetAudience: '', usageScene: '', textLength: 'long' as const,
  productionDate: '', shelfLifeValue: '', shelfLifeUnit: 'day', customShippingDays: '',
  extraShippingFeeEnabled: false, extraShippingFeeAreas: '', noShippingAreasEnabled: false, noShippingAreas: '',
  additionalNotes: '', rawProductText: '', style: 'xiaohongshu' as ContentStyle,
  selectedModules: SHORT_TEMPLATE,
  moduleOrder: MODULE_CONFIG.map(m => m.key), // 14模块完整排序 generateCount: 2 as GenerateCount,
  textLength: 'long' as const,
  enableRAG: true, enableCompliance: true,
  versionStyles: ['xiaohongshu', 'xiaohongshu', 'fun'] as ContentStyle[],
}

export default function App() {
  const [input, setInput] = useState<ProductInput>(DEFAULT_INPUT)
  const [status, setStatus] = useState<GenerateStatus>('idle')
  const [rightModulesV1, setRightModulesV1] = useState<ModuleResult[]>([])
  const [rightModulesV2, setRightModulesV2] = useState<ModuleResult[]>([])
  const [rightModulesV3, setRightModulesV3] = useState<ModuleResult[]>([])
  const [centerModules, setCenterModules] = useState<ModuleResult[]>([])
  const [versionLabelV1, setVersionLabelV1] = useState('')
  const [versionLabelV2, setVersionLabelV2] = useState('')
  const [versionLabelV3, setVersionLabelV3] = useState('')
  const [displayOrder, setDisplayOrder] = useState<string[]>([]); const [expandHintCount, setExpandHintCount] = useState(0)
  const customBlockCounter = useRef(0)
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true')
  useEffect(() => { document.documentElement.classList.toggle('dark', darkMode); localStorage.setItem('darkMode', String(darkMode)) }, [darkMode])
  const [toast, setToast] = useState<{ msg: string; type: 'info' | 'success' | 'error' } | null>(null)
  const showToast = useCallback((msg: string, type: 'info' | 'success' | 'error' = 'info') => { setToast({ msg, type }); setTimeout(() => setToast(null), type === 'success' ? 3000 : 6000) }, [])
  const [priceDialogOpen, setPriceDialogOpen] = useState(false)
  const [platforms, setPlatforms] = useState<{ name: string; price: string; spec: string; enabled: boolean }[]>([
    { name: '天猫旗舰店', price: '', spec: '', enabled: false }, { name: '京东自营', price: '', spec: '', enabled: false },
    { name: '抖音商城', price: '', spec: '', enabled: false }, { name: '拼多多', price: '', spec: '', enabled: false },
    { name: '线下商超', price: '', spec: '', enabled: false },
  ])
  const [priceNotes, setPriceNotes] = useState('')
  const [classifiedImages, setClassifiedImages] = useState<ClassifiedImage[]>([])
  const [imageConfirmOpen, setImageConfirmOpen] = useState(false)
  const [pendingConfirmImages, setPendingConfirmImages] = useState<(ClassifiedImage & { status?: 'success' | 'failed' })[]>([])
  const [moduleSuggestions, setModuleSuggestions] = useState<ModuleSuggestion[]>([])
  const [confirmKey, setConfirmKey] = useState(0)
  const fileMapRef = useRef<Map<string, File>>(new Map())
  const updateClassifiedImages = useCallback((imgs: ClassifiedImage[]) => {
    setClassifiedImages(prev => {
      const map = new Map(prev.map(c => [c.id, c]))
      imgs.forEach(c => map.set(c.id, c))
      return [...map.values()]
    })
  }, [])
  const handleFileRegistered = useCallback((id: string, file: File) => { fileMapRef.current.set(id, file) }, [])

  const hasRequiredFields = useMemo(() => input.rawProductText.trim().length > 0 || (input.productName.trim().length > 0 && input.netWeight.trim().length > 0 && input.suggestedPrice.trim().length > 0 && input.groupBuyPrice.trim().length > 0 && input.afterSalesRules.trim().length > 0), [input.rawProductText, input.productName, input.subCategory, input.netWeight, input.suggestedPrice, input.groupBuyPrice, input.afterSalesRules])
  const isGenerating = status === 'generating' || status === 'checking'

  // 图片分析完成后，触发确认弹窗
  const handleConfirmImages = useCallback((images: ClassifiedImage[]) => {
    const final = images.map(img => ({
      ...img,
      status: (!img.type || (img.type === '其他' && (!img.desc || img.desc === '分析失败'))) ? 'failed' as const : 'success' as const
    }))
    setPendingConfirmImages(final)
    updateClassifiedImages(final as ClassifiedImage[])
    const suggestedModules = new Set<ModuleKey>()
    for (const img of final) {
      if (img.suggestedModule && MODULE_CONFIG.some(m => m.key === img.suggestedModule)) {
        suggestedModules.add(img.suggestedModule as ModuleKey)
      } else {
        const keys = IMAGE_MODULE_MAP[img.type] || []
        keys.forEach(k => suggestedModules.add(k))
      }
    }
    const unselected = [...suggestedModules].filter(k => !input.selectedModules.includes(k))
    const suggestions: ModuleSuggestion[] = unselected.map(k => {
      const config = MODULE_CONFIG.find(m => m.key === k)
      return {
        moduleKey: k,
        moduleLabel: config?.label || k,
        description: config?.description || '',
        isSelected: input.selectedModules.includes(k)
      }
    })
    setModuleSuggestions(suggestions)
    // 自动勾选建议的模块（不弹窗询问）
    if (unselected.length > 0) {
      const newSelected = [...new Set([...input.selectedModules, ...unselected])]
      setInput(prev => ({ ...prev, selectedModules: newSelected }))
    }
    // 不自动弹窗，等用户点击"点我查看解析结果"再弹
  }, [input.selectedModules])

  const handleConfirmImageDialog = useCallback((confirmedImages: (ClassifiedImage & { status?: string })[], checkModules: ModuleKey[]) => {
    updateClassifiedImages(confirmedImages as ClassifiedImage[])
    // 同步更新弹窗副本，否则下次打开弹窗会是旧数据
    setPendingConfirmImages(confirmedImages)
    if (checkModules.length > 0) {
      const newSelected = [...new Set([...input.selectedModules, ...checkModules])]
      setInput(prev => ({ ...prev, selectedModules: newSelected }))
    }
    setImageConfirmOpen(false)
    setModuleSuggestions([])
  }, [input.selectedModules, setInput, updateClassifiedImages])

  const handleRemoveClassifiedImage = useCallback((id: string) => {
    setClassifiedImages(prev => prev.filter(c => c.id !== id))
    setPendingConfirmImages(prev => prev.filter(c => c.id !== id))
  }, [])

  // 重新分析失败图片
  const handleReanalyze = useCallback(async (imageIds: string[]) => {
    for (const id of imageIds) {
      const file = fileMapRef.current.get(id)
      if (!file) continue
      try {
        // 压缩图片
        const base64: string = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => {
            const img = new Image()
            img.onload = () => {
              const maxW = 512; const scale = Math.min(1, maxW / img.width)
              const w = Math.round(img.width * scale); const h = Math.round(img.height * scale)
              const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
              const ctx = canvas.getContext('2d')!; ctx.drawImage(img, 0, 0, w, h)
              resolve(canvas.toDataURL(file.type || 'image/jpeg', 0.8).split(',')[1])
            }
            img.onerror = () => reject(new Error('图片加载失败'))
            img.src = reader.result as string
          }
          reader.onerror = () => reject(new Error('读取失败'))
          reader.readAsDataURL(file)
        })

        // 调用分类 API
        const res = await fetch('/api/images/classify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ images: [{ id, base64, mimeType: file.type || 'image/jpeg' }] })
        })
        const d = await res.json()
        if (d.success && d.data?.results?.length > 0) {
          const r = d.data.results[0]
          setPendingConfirmImages(prev => prev.map(p => p.id === id ? { ...p, type: r.type || '其他', desc: r.desc || '', layout_role: r.layout_role, imageContentSummary: r.imageContentSummary || '', imageOcrText: r.imageOcrText || '', suggestedModule: r.suggestedModule, status: 'success' as const } : p))
        }
      } catch (e: any) {
        console.error('Reanalysis failed for', id, e)
      }
    }
    setConfirmKey(prev => prev + 1)
  }, [])

  const handleClearClassifiedImages = useCallback(() => {
    setClassifiedImages([])
    setPendingConfirmImages([])
  }, [])

  const handleOpenImageConfirm = useCallback(() => {
    // 用 pendingConfirmImages（最新分析结果）或 classifiedImages（已确认的图片）兜底
    const imgs = pendingConfirmImages.length > 0 ? pendingConfirmImages : classifiedImages.map(img => ({ ...img, status: 'success' as const }))
    if (imgs.length > 0) {
      setPendingConfirmImages(imgs)
      // 递增 key 强制弹窗完全销毁重建，确保在 React 19 下不会保留上一次的 editingImages 旧状态
      setConfirmKey(k => k + 1)
      setImageConfirmOpen(true)
    }
  }, [pendingConfirmImages, classifiedImages])

  const handleCancelImageDialog = useCallback(() => {
    setImageConfirmOpen(false)
    setModuleSuggestions([])
  }, [])

  // 图片分析完成后，触发确认弹窗
  const handleGenerate = useCallback(async (forceModulesOrRawText?: ModuleKey[] | string) => {
    // 如果传入的是字符串，说明是从文本解析直接生成
    const rawText = typeof forceModulesOrRawText === 'string' ? forceModulesOrRawText : undefined
    const forceModules = Array.isArray(forceModulesOrRawText) ? forceModulesOrRawText : undefined
    // 用传入的 rawText 覆盖 input.rawProductText（避免 React 状态更新时序问题）
    const effectiveInput = rawText ? { ...input, rawProductText: rawText } : input
    if (!effectiveInput.rawProductText.trim() && !(input.productName.trim() && input.netWeight.trim() && input.suggestedPrice.trim() && input.afterSalesRules.trim())) return
    const orderedKeys = effectiveInput.moduleOrder.filter(k => (forceModules || effectiveInput.selectedModules).includes(k as ModuleKey))
    const makeModules = () => orderedKeys.map(key => { const config = MODULE_CONFIG.find(m => m.key === key); return { moduleKey: key, moduleLabel: config?.label || key, content: '', status: 'loading' as const, adopted: false } })
    const v1 = makeModules(); const v2 = makeModules(); const v3 = makeModules()
    setRightModulesV1(v1); setRightModulesV2(v2); setRightModulesV3(v3)
    const v1Style = input.versionStyles?.[0] || input.style || 'xiaohongshu'
    const v2Style = input.versionStyles?.[1] || 'girlfriend'
    const v3Style = input.versionStyles?.[2] || 'fun'
    setVersionLabelV1('默认风格')
    setVersionLabelV2(STYLE_LABEL_MAP[v2Style] || v2Style)
    setVersionLabelV3(STYLE_LABEL_MAP[v3Style] || v3Style)
    setStatus('generating')
    let doneCount = 0; const onStreamDone = () => { doneCount++; if (doneCount >= 3) setStatus('completed') }
    streamGenerate({ ...effectiveInput, style: v1Style }, orderedKeys, 'taste', v1, setRightModulesV1, onStreamDone, classifiedImages, true)
    streamGenerate({ ...effectiveInput, style: v2Style }, orderedKeys, 'taste', v2, setRightModulesV2, onStreamDone, classifiedImages)
    streamGenerate({ ...effectiveInput, style: v3Style }, orderedKeys, 'taste', v3, setRightModulesV3, onStreamDone, classifiedImages)
    setTimeout(() => { if (doneCount < 3) { doneCount = 3; setStatus('completed') } }, 90000)
  }, [hasRequiredFields, input])

  const handleAdoptAll = useCallback(async (versionModules: ModuleResult[], versionImages?: Map<string, ClassifiedImage[]>) => {
    const completed = versionModules.filter(m => m.status === 'completed'); if (completed.length === 0) return
    // 预读取所有图片为 data URL（保留 GIF 动图）
    const imageDataUrls = new Map<string, string>()
    if (versionImages) {
      const allIds = new Set<string>()
      versionImages.forEach(imgs => imgs.forEach(img => allIds.add(img.id)))
      await Promise.all(Array.from(allIds).map(async imgId => {
        const img = [...versionImages.values()].flat().find(i => i.id === imgId)
        if (!img) return
        const file = fileMapRef.current.get(imgId)
        if (file) {
          return new Promise<void>(resolve => {
            const reader = new FileReader()
            reader.onload = () => { imageDataUrls.set(imgId, reader.result as string); resolve() }
            reader.onerror = () => { if (img.preview) imageDataUrls.set(imgId, img.preview); resolve() }
            reader.readAsDataURL(file)
          })
        } else if (img.preview) {
          imageDataUrls.set(imgId, img.preview)
        }
      }))
    }
    const getSrc = (img: ClassifiedImage) => imageDataUrls.get(img.id) || img.preview || ''
    setCenterModules(prev => {
      const updated = prev.map(m => {
        const src = completed.find(s => s.moduleKey === m.moduleKey);
        if (!src) return m;
        const imgs = versionImages?.get(m.moduleKey) || [];
        const imgTags = imgs.map(img => {
          const srcUrl = getSrc(img)
          return srcUrl ? `<img src="${srcUrl}" style="display:block;max-width:100%;border-radius:8px;margin:8px 0" alt="${img.desc || ''}" /><br>` : ''
        }).filter(Boolean).join('')
        return { ...m, content: imgTags + src.content }
      });
      const newOnes = completed.filter(s => !prev.find(m => m.moduleKey === s.moduleKey)).map(s => {
        const imgs = versionImages?.get(s.moduleKey) || [];
        const imgTags = imgs.map(img => {
          const srcUrl = getSrc(img)
          return srcUrl ? `<img src="${srcUrl}" style="display:block;max-width:100%;border-radius:8px;margin:8px 0" alt="${img.desc || ''}" /><br>` : ''
        }).filter(Boolean).join('')
        return { ...s, content: imgTags + s.content, adopted: true }
      });
      return [...updated, ...newOnes]
    })
    setDisplayOrder(prev => { const newKeys = completed.map(m => m.moduleKey).filter(k => !prev.includes(k)); return newKeys.length > 0 ? [...prev, ...newKeys] : prev }); setExpandHintCount(c => c + 1)
  }, [showToast])
  const handleAdopt = useCallback(async (moduleKey: string, content: string, images?: ClassifiedImage[]) => {
    if (!content && (!images || images.length === 0)) return;
    // 原图嵌入 contentEditable — 用 FileReader.readAsDataURL 保持 GIF 动图和格式一致
    let imgTags = ''
    if (images && images.length > 0) {
      const results = await Promise.all(images.map(img => new Promise<string>(resolve => {
        const file = fileMapRef.current.get(img.id)
        if (file) {
          const reader = new FileReader()
          reader.onload = () => resolve(`<img src="${reader.result}" alt="${img.desc || ''}" style="display:block;max-width:100%;border-radius:8px;margin:8px 0"><br>`)
          reader.onerror = () => { const fb = img.preview || ''; resolve(fb ? `<img src="${fb}" alt="${img.desc || ''}" style="display:block;max-width:100%;border-radius:8px;margin:8px 0"><br>` : '') }
          reader.readAsDataURL(file)
        } else {
          const fb = img.preview || ''
          resolve(fb ? `<img src="${fb}" alt="${img.desc || ''}" style="display:block;max-width:100%;border-radius:8px;margin:8px 0"><br>` : '')
        }
      })))
      imgTags = results.filter(Boolean).join('')
    }
    const fullContent = content ? (imgTags + content) : (imgTags || '<br>')
    setCenterModules(prev => { const exists = prev.find(m => m.moduleKey === moduleKey); if (exists) return prev.map(m => m.moduleKey === moduleKey ? { ...m, content: fullContent } : m); const newMod: ModuleResult = { moduleKey: moduleKey as ModuleKey, moduleLabel: MODULE_CONFIG.find(c => c.key === moduleKey)?.label || '', content: fullContent, status: 'completed', adopted: true }; return [...prev, newMod] }); setDisplayOrder(prev => prev.includes(moduleKey) ? prev : [...prev, moduleKey]) }, [])
  const handleDislikeVersion = useCallback((version: number, label: string) => { showToast(`已记录：版本${version}（${label}）点踩反馈`, 'info') }, [showToast])
  const handleDislikeModule = useCallback((moduleKey: string, moduleLabel: string) => { showToast(`已记录：${moduleLabel}模块 点踩反馈`, 'info') }, [showToast])
  const handleCenterEdit = useCallback((moduleKey: string, content: string) => { setCenterModules(prev => prev.map(m => m.moduleKey === moduleKey ? { ...m, content } : m)) }, [])
  const handleAddBlock = useCallback(() => { customBlockCounter.current += 1; const newKey = `__custom_${customBlockCounter.current}`; setDisplayOrder(prev => [...prev, newKey]); setCenterModules(prev => [...prev, { moduleKey: newKey as ModuleKey, moduleLabel: '自定义文本', content: '<br>', status: 'completed' as const, adopted: true }]); setTimeout(() => { const el = document.querySelector(`[data-block-key="${newKey}"]`) as HTMLDivElement; if (el) { el.focus(); document.getSelection()?.collapse(el, 0) } }, 50) }, [])
  const handleDeleteBlock = useCallback((moduleKey: string) => { setDisplayOrder(prev => prev.filter(k => k !== moduleKey)); setCenterModules(prev => prev.filter(m => m.moduleKey !== moduleKey)) }, [])
  const handleClearAll = useCallback(() => { setCenterModules([]); setDisplayOrder([]) }, [])

  // 导出/发布时自动存预审语料库
  const handleExportCorpus = useCallback((callback?: () => void) => {
    try {
      const data = buildCorpusJSON(input, classifiedImages, centerModules, displayOrder, fileMapRef.current)
      fetch("/api/corpus/save-to-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      }).then(r => r.json()).then(d => {
        if (d.success) showToast("已存入预审语料库", "success")
      }).catch(() => {})
    } catch (e) {
      console.error("Export corpus failed:", e)
    }
    if (callback) callback()
  }, [input, classifiedImages, centerModules, displayOrder, showToast])


  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-gradient-to-br from-indigo-50/80 via-white to-purple-50/80 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      {/* 全局顶部导航 */}
      <header className="flex-shrink-0 flex items-center justify-between h-14 px-6 bg-transparent z-10">
        <div className="flex items-center gap-3">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
            <defs>
              <linearGradient id="logoBg" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                <stop stopColor="#2DD46B"/>
                <stop offset="1" stopColor="#07C160"/>
              </linearGradient>
            </defs>
            <rect width="36" height="36" rx="9" fill="url(#logoBg)"/>
            {/* 闪电 + 嫩芽结合的造型 */}
            <path d="M20 27V18l3-7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M20 18h-6l3-8" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M14 10l4 1.5" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="25.5" cy="10" r="1.5" fill="#fff" opacity="0.5"/>
          </svg>
          <div className="flex flex-col leading-tight">
            <span className="text-[15px] font-bold tracking-wide text-foreground" style={{ letterSpacing: '0.05em' }}>快稿种草</span>
            <span className="text-[10px] font-medium text-muted-foreground tracking-wider" style={{ letterSpacing: '0.15em' }}>AI 小助手</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setDarkMode(!darkMode)} className="inline-flex items-center justify-center size-8 rounded-md hover:bg-muted transition-colors text-muted-foreground" title={darkMode ? '切换白天模式' : '切换暗黑模式'}>{darkMode ? (<svg width="16" height="16" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="7.5" cy="7.5" r="2.5"/><path d="M7.5 1.5v2M7.5 11.5v2M1.5 7.5h2M11.5 7.5h2M3.3 3.3l1.4 1.4M10.3 10.3l1.4 1.4M3.3 11.7l1.4-1.4M10.3 4.7l1.4-1.4"/></svg>) : (<svg width="16" height="16" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7.5 1.5c-3.3 0-6 2.7-6 6s2.7 6 6 6c1.5 0 2.9-.6 3.9-1.5-2.5-1-4.4-3.4-4.4-4.5s1.9-3.5 4.4-4.5c-1-1-2.4-1.5-3.9-1.5z"/></svg>)}</button><Button variant="ghost" size="sm" className="text-xs text-muted-foreground">帮助文档</Button>
          <button className="inline-flex items-center justify-center size-7 rounded-full bg-muted hover:bg-muted/80 transition-colors">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground"><circle cx="7.5" cy="5" r="2.5"/><path d="M1.5 13c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>
          </button>
        </div>
      </header>

      {/* 三栏主体 */}
      <div className="flex flex-1 min-h-0 gap-4 px-4 pb-4">
        {toast && (<div className={`fixed top-16 left-1/2 -translate-x-1/2 z-[999] flex items-center gap-2.5 rounded-lg border px-4 py-2.5 text-sm shadow-lg ${toast.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : toast.type === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}><svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0"><circle cx="7.5" cy="7.5" r="6" /><path d={toast.type === 'success' ? "M4.5 7.5l2 2 4-4" : "M7.5 4.5v3M7.5 10v.5"} /></svg><span>{toast.msg}</span></div>)}
        <div className="w-[320px] flex-shrink-0 rounded-2xl bg-white/70 dark:bg-white/[0.06] backdrop-blur-2xl shadow-xl shadow-black/[0.03] dark:shadow-black/[0.3] border border-white/50 dark:border-white/[0.08] overflow-hidden"><LeftPanel input={input} onChange={setInput} disabled={isGenerating} isGenerating={isGenerating} onGenerate={handleGenerate} hasRequiredFields={hasRequiredFields} priceDialogOpen={priceDialogOpen} setPriceDialogOpen={setPriceDialogOpen} platforms={platforms} setPlatforms={setPlatforms} priceNotes={priceNotes} setPriceNotes={setPriceNotes} classifiedImages={classifiedImages} onImagesClassified={updateClassifiedImages} onFileRegistered={handleFileRegistered} onConfirmImages={handleConfirmImages} onOpenImageConfirm={handleOpenImageConfirm} onClearClassifiedImages={handleClearClassifiedImages} onRemoveClassifiedImage={handleRemoveClassifiedImage} /></div>
        <div className="w-[450px] flex-shrink-0 rounded-2xl bg-white/70 dark:bg-white/[0.06] backdrop-blur-2xl shadow-xl shadow-black/[0.03] dark:shadow-black/[0.3] border border-white/50 dark:border-white/[0.08] overflow-hidden"><CenterPanel status={status} modules={centerModules} mandatoryKeys={displayOrder} onEdit={handleCenterEdit} onReorder={setDisplayOrder} onAddBlock={handleAddBlock} onDeleteBlock={handleDeleteBlock} showToast={showToast} triggerExpandHint={expandHintCount} onClearAll={handleClearAll} input={input} classifiedImages={classifiedImages} fileMapRef={fileMapRef} onExportCorpus={handleExportCorpus} /></div>
        <div className="flex-1 min-w-0 rounded-2xl bg-white/70 dark:bg-white/[0.06] backdrop-blur-2xl shadow-xl shadow-black/[0.03] dark:shadow-black/[0.3] border border-white/50 dark:border-white/[0.08] overflow-hidden"><RightPanel status={status} modulesV1={rightModulesV1} modulesV2={rightModulesV2} modulesV3={rightModulesV3} versionLabelV1={versionLabelV1} versionLabelV2={versionLabelV2} versionLabelV3={versionLabelV3} onAdopt={handleAdopt} onAdoptAll={handleAdoptAll} onDislikeVersion={handleDislikeVersion} onDislikeModule={handleDislikeModule} classifiedImages={classifiedImages} /></div>
      </div>

      {/* 图片分析确认弹窗 */}
      <ImageConfirmDialog
        key={confirmKey}
        open={imageConfirmOpen}
        images={pendingConfirmImages}
        moduleSuggestions={moduleSuggestions}
        onConfirm={handleConfirmImageDialog}
        onCancel={handleCancelImageDialog}
        onReanalyze={handleReanalyze}
      />
      {/* 全局：配置比价清单弹窗 */}
      {priceDialogOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPriceDialogOpen(false)}>
          <div className="bg-card rounded-2xl shadow-2xl max-w-md w-full p-6 border border-border animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-1">配置比价清单</h3>
            <p className="text-sm text-muted-foreground mb-4">录入各平台价格，AI 将在生成时突出价格优势</p>

            <div className="mb-4 p-3 rounded-xl bg-muted/50">
              <span className="text-xs text-muted-foreground">团购价</span>
              <span className="text-lg font-semibold text-[#07C160] ml-2">
                {input.suggestedPrice ? `¥{input.suggestedPrice} / {input.netWeight}` : '未设置'}
              </span>
            </div>

            <div className="flex flex-col gap-2 mb-4">
              {platforms.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Checkbox checked={p.enabled} onCheckedChange={() => { const np = [...platforms]; np[i] = { ...p, enabled: !p.enabled }; setPlatforms(np) }} />
                  <Input placeholder="平台名" value={p.name} onChange={e => { const np = [...platforms]; np[i] = { ...p, name: e.target.value }; setPlatforms(np) }} className="w-24 h-8 text-sm" />
                  <Input placeholder="价格" value={p.price} onChange={e => { const v = e.target.value.replace(/[^\d.]/g, ''); const np = [...platforms]; np[i] = { ...p, price: v, enabled: true }; setPlatforms(np) }} onFocus={() => { if (!p.enabled) { const np = [...platforms]; np[i] = { ...p, enabled: true }; setPlatforms(np) } }} className="w-20 h-8 text-sm" />
                  <span className="text-xs text-muted-foreground">元</span>
                  <Input placeholder="规格" value={p.spec} onChange={e => { const np = [...platforms]; np[i] = { ...p, spec: e.target.value, enabled: true }; setPlatforms(np) }} onFocus={() => { if (!p.enabled) { const np = [...platforms]; np[i] = { ...p, enabled: true }; setPlatforms(np) } }} className="w-24 h-8 text-sm" />
                  <button onClick={() => setPlatforms(platforms.filter((_, j) => j !== i))} className="text-muted-foreground/30 hover:text-destructive transition-colors shrink-0"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3.5 3.5l8 8M11.5 3.5l-8 8" /></svg></button>
                </div>
              ))}
              {platforms.length < 12 && (
                <button onClick={() => setPlatforms([...platforms, { name: '', price: '', spec: '', enabled: true }])} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-[#07C160] transition-colors py-1"><svg width="12" height="12" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7.5 2v11M2 7.5h11" /></svg>添加平台</button>
              )}
            </div>

            <div className="mb-4">
              <Label className="text-sm mb-1 block">备注（选填）</Label>
              <Textarea rows={2} placeholder="如：天猫正在做618活动" value={priceNotes} onChange={e => setPriceNotes(e.target.value)} />
            </div>

            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" disabled className="text-xs"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" className="mr-1"><path d="M7.5 1.5L9.5 5l4 .5-3 3 1 4.5-3.5-2-3.5 2 1-4.5-3-3 4-.5 2-3.5z" /></svg>AI 帮我搜价</Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPriceDialogOpen(false)}>取消</Button>
                <Button size="sm" className="bg-[#07C160] hover:bg-[#06AD56]" onClick={() => setPriceDialogOpen(false)}>保存</Button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

// 图片→模块映射
const DEFAULT_TYPE_MAP: Record<string, string[]> = {
  '产品图': ['taste'], '封面图': ['hook'], '配料表': ['trust', 'ingredient'],
  '场景图': ['scene'], '品牌图': ['brand'], '包装图': ['hook'], '其他': [],
}

function assignImages(images: ClassifiedImage[], typeMap: Record<string, string[]>): Map<string, ClassifiedImage[]> {
  const map = new Map<string, ClassifiedImage[]>()
  for (const img of images) {
    const targets = typeMap[img.type] || []
    for (const mod of targets) {
      if (!map.has(mod)) map.set(mod, [])
      map.get(mod)!.push(img)
    }
  }
  return map
}

function buildCorpusJSON(
  input: ProductInput, classifiedImages: ClassifiedImage[],
  centerModules: ModuleResult[], displayOrder: string[],
  fileMap: Map<string, File>
): { corpus: any; images: { id: string; base64: string; fileName: string }[] } {
  const getExt = (f: File | undefined) => f ? (f.name.includes('.') ? f.name.split('.').pop() || 'jpg' : 'jpg') : 'jpg'

  const corpus: any = {
    version: "2.1", schema: "corpus-图文绑定-v2",
    productName: input.productName,
    sourceNote: `来源: ${input.productName}`,
    category: { level1: input.catLevel1, level2: input.catLevel2, level3: input.catLevel3 },
    styleTag: (input.versionStyles && input.versionStyles[0]) || input.style || 'xiaohongshu',
    imageCount: classifiedImages.length,
    source: "预审库自动收集",
    convertedAt: new Date().toISOString(),
    modules: [], images: []
  }

  // images[]
  const imageFiles: { id: string; base64: string; fileName: string }[] = []
  let imgIdx = 1
  corpus.images = classifiedImages.map((img) => {
    const f = fileMap.get(img.id)
    const ext = getExt(f)
    const fileName = `image${String(imgIdx).padStart(3, '0')}.${ext}`
    imgIdx++
    // Extract base64 from file
    let base64 = ''
    if (f) {
      try {
        const reader = new FileReader()
        // We can't use FileReader sync — skip base64 for now, extract later
      } catch {}
    }
    imageFiles.push({ id: img.id, base64: img.preview?.replace(/^data:image\/\w+;base64,/, '') || '', fileName })
    return {
      id: imgIdx - 1, file: `images/${fileName}`,
      type: [img.type], primaryType: img.type, module: '',
      desc: img.desc || '', layout_role: img.layout_role || 'detail',
      imageContentSummary: img.imageContentSummary || '',
      imageOcrText: (img as any).imageOcrText || '',
      suggestedModule: (img as any).suggestedModule || ''
    }
  })

  // Assign images to modules
  const moduleImages = assignImages(classifiedImages, DEFAULT_TYPE_MAP)

  // Build modules
  for (const key of displayOrder) {
    const cm = centerModules.find(m => m.moduleKey === key)
    const imgs = moduleImages.get(key) || []
    const text = cm ? cm.content.replace(/<[^>]+>/g, '').replace(/<br\s*\/?>/gi, '\n').trim() : ''
    const imgCount = imgs.length
    const density = imgCount === 0 ? 'none' : imgCount <= 2 ? 'low' : imgCount <= 8 ? 'medium' : 'high'
    const pattern = text && imgCount > 0 ? 'image_before_text' : text ? 'text_only' : imgCount > 0 ? 'images_only' : 'text_only'

    const segImages = imgs.map((img, i) => ({
      imgId: classifiedImages.findIndex(ci => ci.id === img.id) + 1,
      group: 'stack', role: img.desc || `图${i + 1}`,
      position: 'before_text' as const,
      relationship: img.imageContentSummary || ''
    }))

    const segment = {
      text, textType: `${key}_main`,
      images: segImages,
      binding: segImages.length > 0 ? 'image_before_text' as const : 'no_image' as const
    }

    const mod = {
      moduleKey: key, moduleName: cm?.moduleLabel || key, order: 0,
      layout: { overallPattern: pattern, imageCount: imgCount, textSegmentCount: 1, density },
      segments: [segment],
      imageGroups: {} as any
    }

    if (imgCount > 0 && pattern === 'image_before_text') {
      mod.imageGroups = {
        footer: { imgIds: segImages.map(s => s.imgId), group: 'stack', desc: '' }
      }
    }

    corpus.modules.push(mod)
  }

  // Re-number modules
  corpus.modules.forEach((m: any, i: number) => { m.order = i + 1 })

  return { corpus, images: imageFiles }
}

function plainToHTML(text: string): string { return text.replace(/<br\s*\/?>/gi, '\n').replace(/<\/tr>/gi, '\n').replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, ' / ').replace(/<[^>]+>/g, '').replace(/\n/g, '<br>') }
function stripEmoji(text: string): string { return text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}‍️]/gu, '').replace(/\s+/g, ' ').trim() }

async function streamGenerate(product: ProductInput, moduleKeys: string[], focus: 'taste' | 'value', _mods: ModuleResult[], setModules: (v: React.SetStateAction<ModuleResult[]>) => void, onDone: () => void, images?: ClassifiedImage[], isDefault?: boolean) {
  try { const response = await fetch('/api/generate/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product, modules: moduleKeys, focus, images: images || [], isDefault: isDefault || false }) }); if (!response.ok) throw new Error('Stream failed'); const reader = response.body!.getReader(); const decoder = new TextDecoder(); let buf = ''; const contents: Record<string, string> = {}; let curMod = ''; let lastUpdate = Date.now()
    const clean = (t: string) => plainToHTML(t.replace(/===\w+===/g, '').trim()); const flush = () => { const now = Date.now(); if (now - lastUpdate < 40) return; lastUpdate = now; setModules(prev => prev.map(m => ({ ...m, status: 'completed' as const, content: clean(contents[m.moduleKey] || '') }))) }
    while (true) { const { done, value } = await reader.read(); if (done) break; buf += decoder.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop() || ''; for (const line of lines) { if (!line.startsWith('data: ')) continue; const d = line.slice(6); let p; try { p = JSON.parse(d) } catch { continue }; if (p.type === 'done') continue; if (p.type === 'text' && p.content) { contents[curMod] = (contents[curMod] || '') + p.content; const m = /===(hook|price|taste|trust|aftercare|tips|cta|ingredient|origin|brand|scene|feedback|faq)===/.exec(contents[curMod] || ''); if (m) { const idx = (contents[curMod] || '').indexOf(m[0]); const before = (contents[curMod] || '').slice(0, idx); if (before.trim()) contents[curMod] = before; else delete contents[curMod]; curMod = m[1]; contents[curMod] = (contents[curMod] || '').slice(idx + m[0].length) } flush() } } }
    setModules(prev => prev.map(m => ({ ...m, status: 'completed' as const, content: clean(contents[m.moduleKey] || '') }))); onDone()
  } catch { await generateRight(_mods, product, focus, setModules, onDone); onDone() }
}

function fillModules(mods: ModuleResult[], apiModules: Array<{ moduleKey: string; content: string }>, setModules: (v: React.SetStateAction<ModuleResult[]>) => void) { setModules(mods.map(m => { const api = apiModules.find(a => a.moduleKey === m.moduleKey); return api ? { ...m, status: 'completed' as const, content: plainToHTML(api.content) } : m })) }

async function generateRight(mods: ModuleResult[], product: ProductInput, focus: 'taste' | 'value', setModules: (v: React.SetStateAction<ModuleResult[]>) => void, _setStatus: (v: React.SetStateAction<GenerateStatus>) => void) { for (let i = 0; i < mods.length; i++) { await new Promise(r => setTimeout(r, 600 + Math.random() * 500)); setModules(prev => prev.map((m, idx) => idx === i ? { ...m, status: 'completed' as const, content: plainToHTML(rightTemplate(m.moduleKey, product, focus)) } : m)) } }

function rightTemplate(key: ModuleKey, p: ProductInput, focus: 'taste' | 'value'): string {
  const name = p.productName || '该商品'; const price = p.suggestedPrice ? `¥${p.suggestedPrice}` : '团购价'; const specs = p.netWeight || ''; const origin = p.origin ? `，产自${p.origin}` : ''; const courier = p.courier || '冷链'; const shipping = p.shippingTimeliness === 'custom' ? (p.customShippingDays || '') + '天内' : p.shippingTimeliness === '48h' ? '48小时内' : p.shippingTimeliness === '24h' ? '24小时内' : p.shippingTimeliness === '72h' ? '72小时内' : p.shippingTimeliness === '7d' ? '7天内' : ''; const afterSales = p.afterSalesRules || '质量问题可申请售后'; const sellingPoints = p.sellingPoints || '品质好，口感佳'; const ingredients = p.coreIngredients || '优质原料'
  const tasteHook = focus === 'taste' ? `姐妹们！！${name}这个真的绝了！！！\n\n先别划走，给我30秒，我告诉你它的口感有多惊艳 👇` : `姐妹们！！${name}这次团购价真的离谱！！\n\n我对比了全网价格，直接便宜一大截，必须给大家安排上 👇`
  const tasteDesc = focus === 'taste' ? `打开就能闻到浓郁的奶香${origin}，入口丝滑得像丝绸划过舌尖。酸度恰到好处，不会酸到皱眉，回味有淡淡的奶甜，完全没有香精味。\n\n质地介于流动型和凝固型之间，用勺子舀起来能拉出小尖角。口感醇厚绵密，每一口都能尝到牛乳原本的鲜甜，喝完嘴巴里清清爽爽。` : `口感和超市买的一样好喝！丝滑细腻不酸涩，奶香浓郁。和那些贵一倍的品牌相比完全不输，性价比超高。`
  const trustDesc = `🏭 ${origin ? '产地直发 · ' : ''}品质保障\n📋 配料干净：${ingredients}\n✅ 严格品控\n💰 ${specs}，${price}/份`
  const trustValue = focus === 'value' ? `\n\n对比了一下，超市同品质的要贵30%以上。这款是产地直供，没有中间商加价，所以能做到这个价格。` : `\n\n品牌专注做好产品，不投广告不请代言，把成本都花在了品质上——这也是为什么它能做到这个品质和价格。`
  const t: Record<string, string[]> = {
    price: [`💰 团购价：${price}/${specs}
📊 算笔账：超市同款要贵30%以上，我们这次直接产地直供价
🎁 ${specs}一次到手，够喝大半个月！`, `🔥 划重点：${price}就能买到${specs}
单份不到5块钱，比超市便宜一截
还包邮到家，这次团购真的超值！`],
    tips: [`📌 储存：0-4℃冷藏保存，保质期${p.shelfLifeValue || '6'}个月
👶 适合：${p.targetAudience || '全家老少'}都可以喝
💡 小贴士：冷藏后口感更佳，开封后建议24小时内喝完`, `🔖 食用指南：
• 储存：收到马上放冰箱冷藏
• 保质期：${p.shelfLifeValue || '6'}${p.shelfLifeUnit === 'month' ? '个月' : '天'}
• 适合人群：${p.targetAudience || '大人小孩都适合'}
• 温馨提示：如有轻微沉淀属正常现象，摇匀即可`],
    origin: [`🌍 奶源来自${p.origin || '自有牧场'}，北纬40°黄金奶源带
🏔️ 高海拔、大温差、纯净水源，孕育出醇厚奶香
🐄 精选荷斯坦奶牛，自然放牧，产的奶自带清甜`, `📍 产地溯源：${p.origin || '自有牧场直供'}
这里日照充足、牧草丰美，奶源品质从源头就有保障
每一滴牛奶都带着草原的清甜~`],
    faq: [`Q: 收到后可以放多久？
A: ${p.shelfLifeValue || '6'}${p.shelfLifeUnit === 'month' ? '个月' : '天'}，冷藏保存，开封后建议24小时内喝完。

Q: 坏单了怎么赔？
A: ${p.afterSalesRules || '签收24小时内凭照片申请赔付'}

Q: 小孩可以喝吗？
A: ${p.targetAudience ? p.targetAudience + '都可以放心喝' : '3岁以上儿童均可饮用'}`, `Q: 发货后多久能到？
A: ${p.shippingTimeliness === '48h' ? '48小时内顺丰冷链发出，江浙沪次日达' : '根据地区不同1-3天'}

Q: 有没有添加剂？
A: ${p.coreIngredients || '配料干净，无人工香精色素防腐剂'}

Q: 可以退货吗？
A: ${p.afterSalesRules || '不支持无理由退货，质量问题包赔'}`],
    hook: [tasteHook, tasteHook], taste: [tasteDesc, tasteDesc], trust: [trustDesc + trustValue, trustDesc + trustValue],
    aftercare: [`📦 ${p.shippingOrigin ? '发货地：' + p.shippingOrigin + '，' : ''}${courier}发货，${shipping ? '下单后' + shipping + '发出' : ''}\n🧊 泡沫箱+冰袋包装，到手新鲜\n${p.extraShippingFeeEnabled && p.extraShippingFeeAreas ? '⚠️ 补邮费地区：' + p.extraShippingFeeAreas + '\n' : ''}${p.noShippingAreasEnabled && p.noShippingAreas ? '🚫 不发货地区：' + p.noShippingAreas + '\n' : ''}🛡️ ${afterSales}`, `售后放心：\n1️⃣ ${p.shippingOrigin ? '从' + p.shippingOrigin + '发出，' : ''}${courier}配送\n2️⃣ ${shipping}发货\n${p.extraShippingFeeEnabled && p.extraShippingFeeAreas ? '3️⃣ 补邮费地区：' + p.extraShippingFeeAreas + '\n' : ''}${p.noShippingAreasEnabled && p.noShippingAreas ? '4️⃣ 不发货地区：' + p.noShippingAreas + '\n' : ''}⚠️ ${afterSales}`],
    cta: focus === 'taste' ? [`⚠️ 团购仅限48小时，过后恢复原价\n\n链接放评论区了，直接点进去参团 👇`, `趁还有货赶紧入手！上次开团3小时就售罄了 🏃‍♂️`] : [`💰 ${price}/${specs}，这个价格真的不买就亏了\n\n比超市便宜一截，还包邮到家 👇`, `算笔账：超市买要贵30%，这次团购直接省下来！赶紧冲 ⚡`],
  }
    // Full templates for all 14 modules
  const fallback = {
    price: [`💰 团购价：${price}/${specs}\n📊 单份不到${p.suggestedPrice ? (parseFloat(p.suggestedPrice) / 12).toFixed(1) : '5'}元，比超市便宜一大截\n🎁 ${specs}一次到手，够喝大半个月！`],
    tips: [`📌 ${p.shelfLifeValue || '6'}${p.shelfLifeUnit === 'month' ? '个月' : '天'}保质期，2-6℃冷藏保存\n👶 建议3岁以上饮用\n⚠ 乳糖不耐、乳蛋白过敏者不适用\n💡 喝前摇一摇，乳清析出属正常现象\n开盖后4-6小时内喝完，不建议隔夜存放`],
    origin: [`🌍 奶源来自${p.origin || '北纬40°黄金奶源带自有牧场'}\n🏔️ 高海拔、大温差、纯净水源，孕育出醇厚奶香\n🐄 精选荷斯坦奶牛，自然放牧，产的奶自带清甜`],
    faq: [`Q: 收到后可以放多久？\nA: ${p.shelfLifeValue || '6'}${p.shelfLifeUnit === 'month' ? '个月' : '天'}，2-6℃冷藏保存，开封后建议24小时内喝完。\n\nQ: 坏单了怎么赔？\nA: ${p.afterSalesRules || '签收24小时内凭照片申请赔付'}\n\nQ: 小孩可以喝吗？\nA: ${p.targetAudience ? p.targetAudience + '都可以放心喝' : '建议3岁以上儿童饮用'}\n\nQ: 发货后多久能到？\nA: ${p.shippingTimeliness === '48h' ? '48小时内顺丰冷链发出' : '根据地区不同1-3天'}`],
  }
  const opts = t[key] || fallback[key] || ['']; return opts[Math.floor(Math.random() * opts.length)]
}
