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
import type { ProductInput, ContentStyle, SubCategory, ShippingTimeliness, ShelfLifeUnit } from '@/types'
import { MODULE_CONFIG, STYLE_CONFIG, SUB_CATEGORY_CONFIG, SHIPPING_OPTIONS } from '@/config/modules'

interface LeftPanelProps { input: ProductInput; onChange: (input: ProductInput) => void; disabled: boolean; isGenerating: boolean; onGenerate: () => void; hasRequiredFields: boolean }
interface FormErrors { productName?: string; subCategory?: string; netWeight?: string; suggestedPrice?: string; afterSalesRules?: string }

const SHELF_LIFE_UNITS: { key: ShelfLifeUnit; label: string }[] = [{ key: 'day', label: '天' }, { key: 'month', label: '月' }, { key: 'year', label: '年' }]
const FIELD_LABELS: Record<string, string> = { productName: '商品名称', subCategory: '二级子品类', netWeight: '规格净含量', origin: '产地', suggestedPrice: '建议售价', sellingPoints: '核心卖点', coreIngredients: '核心配料/原料', shippingOrigin: '发货地', shippingTimeliness: '发货时效', courier: '快递公司', afterSalesRules: '售后规则', brandBackground: '品牌背景', targetAudience: '适用人群', usageScene: '使用场景', shelfLifeValue: '保质期' }

export function LeftPanel({ input, onChange, disabled, isGenerating, onGenerate }: LeftPanelProps) {
  const [aiOpen, setAiOpen] = useState(true); const [categoryOpen, setCategoryOpen] = useState(true); const [productOpen, setProductOpen] = useState(true); const [fileTab, setFileTab] = useState('paste'); const [linkInput, setLinkInput] = useState(''); const [pasteText, setPasteText] = useState(''); const [extractLoading, setExtractLoading] = useState(false); const fileInputRef = useRef<HTMLInputElement>(null)
  const [errors, setErrors] = useState<FormErrors>({}); const [dragIndex, setDragIndex] = useState<number | null>(null)
  // 文件上传解析
  type UploadFile = { id: string; file: File; status: 'pending' | 'parsing' | 'done' | 'error'; text?: string; error?: string }
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]); const [parseLoading, setParseLoading] = useState(false)
  const [extractedFields, setExtractedFields] = useState<Record<string, string> | null>(null); const [confirmOpen, setConfirmOpen] = useState(false); const [dragOver, setDragOver] = useState(false)
  const addFiles = (files: FileList | File[]) => { const arr = Array.from(files); const valid = arr.filter(f => /\.(docx?|txt|xlsx?|csv)$/i.test(f.name) || f.type.includes('text') || f.type.includes('pdf') || f.type.includes('spreadsheet') || f.type.includes('document')); if (valid.length === 0) return; setUploadFiles(prev => [...prev, ...valid.map(f => ({ id: Math.random().toString(36).slice(2), file: f, status: 'pending' as const }))]) }
  const removeFile = (id: string) => setUploadFiles(prev => prev.filter(f => f.id !== id))
  const parseFile = async (uf: UploadFile): Promise<string> => { const { file } = uf; const name = file.name.toLowerCase()
    try { if (name.endsWith('.docx')) { const mammoth = await import('mammoth'); const buf = await file.arrayBuffer(); const r = await mammoth.extractRawText({ arrayBuffer: buf }); return r.value }
      else if (name.endsWith('.xlsx') || name.endsWith('.xls')) { const XLSX = await import('xlsx'); const buf = await file.arrayBuffer(); const wb = XLSX.read(buf, { type: 'array' }); return wb.SheetNames.map(sn => XLSX.utils.sheet_to_csv(wb.Sheets[sn])).join('\n') }
      else if (name.endsWith('.csv')) { return await file.text() }
      else if (name.endsWith('.pdf')) { return await file.text() }
      else { return await file.text() }
    } catch (e: any) { throw new Error(e.message || '解析失败') } }
  const handleParseAll = async () => { if (uploadFiles.length === 0 || parseLoading) return; setParseLoading(true); const allText: string[] = []
    for (const uf of uploadFiles) { setUploadFiles(prev => prev.map(f => f.id === uf.id ? { ...f, status: 'parsing' as const } : f)); try { const t = await parseFile(uf); allText.push(`--- ${uf.file.name} ---\n${t}`); setUploadFiles(prev => prev.map(f => f.id === uf.id ? { ...f, status: 'done' as const, text: t } : f)) } catch (e: any) { setUploadFiles(prev => prev.map(f => f.id === uf.id ? { ...f, status: 'error' as const, error: e.message } : f)) } }
    const combined = allText.join('\n\n').slice(0, 8000)
    if (combined.trim()) { try { const res = await fetch('/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: combined }) }); const d = await res.json(); if (d.success && d.data) { setExtractedFields(d.data); setConfirmOpen(true) } } catch { } }
    setParseLoading(false) }
  const [polishLoading, setPolishLoading] = useState(false); const [polished, setPolished] = useState(false); const prePolishRef = useRef('')
  const [priceDialogOpen, setPriceDialogOpen] = useState(false)
  const [platforms, setPlatforms] = useState<{ name: string; price: string; spec: string; enabled: boolean }[]>([
    { name: '天猫旗舰店', price: '', spec: '', enabled: false }, { name: '京东自营', price: '', spec: '', enabled: false },
    { name: '抖音商城', price: '', spec: '', enabled: false }, { name: '拼多多', price: '', spec: '', enabled: false },
    { name: '线下商超', price: '', spec: '', enabled: false },
  ])
  const hasConfiguredPlatforms = platforms.some(p => p.enabled && p.price.trim())
  const [priceNotes, setPriceNotes] = useState(''); const [localOrigins, setLocalOrigins] = useState<string[]>(() => { return (input.origin || '').split('\n').filter(Boolean) })
  const moduleOrder = input.moduleOrder

  const updateField = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) => { if (['productName','subCategory','netWeight','suggestedPrice','afterSalesRules'].includes(key as string)) setErrors(prev => ({ ...prev, [key]: undefined })); onChange({ ...input, [key]: value }) }
  const fieldCls = 'flex flex-col gap-1.5'

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => { setDragIndex(index); e.dataTransfer.effectAllowed = 'move'; const img = new Image(); img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; e.dataTransfer.setDragImage(img, 0, 0) }, [])
  const handleDragOver = useCallback((e: React.DragEvent, index: number) => { e.preventDefault(); if (dragIndex === null || dragIndex === index) return; const newOrder = [...moduleOrder]; const [item] = newOrder.splice(dragIndex, 1); newOrder.splice(index, 0, item); setDragIndex(index); const sel = input.selectedModules.filter(k => newOrder.includes(k)); sel.sort((a, b) => newOrder.indexOf(a) - newOrder.indexOf(b)); onChange({ ...input, moduleOrder: newOrder, selectedModules: sel }) }, [dragIndex, moduleOrder, input, onChange])
  const handleDragEnd = useCallback(() => { setDragIndex(null) }, [])

  const handleGenerate = () => { const newErrors: FormErrors = {}; if (!input.productName.trim()) newErrors.productName = '请输入商品名称'; if (!input.subCategory) newErrors.subCategory = '请选择二级子品类'; if (!input.netWeight.trim()) newErrors.netWeight = '请输入规格净含量'; if (!input.suggestedPrice.trim()) newErrors.suggestedPrice = '请输入建议售价'; if (!input.afterSalesRules.trim()) newErrors.afterSalesRules = '请输入售后规则'; if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return }; onGenerate() }

  const handleExtractInfo = async () => { const text = pasteText.trim(); if (!text || extractLoading) return; setExtractLoading(true); try { const res = await fetch('/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }); const d = await res.json(); if (d.success && d.data) { const r = d.data; const updated = { ...input, ...(r.productName ? { productName: String(r.productName) } : {}), ...(r.subCategory ? { subCategory: ['dairy','snack','fresh_fruit','grain_oil','other'].includes(r.subCategory) ? r.subCategory : input.subCategory } : {}), ...(r.netWeight ? { netWeight: String(r.netWeight) } : {}), ...(r.origin ? { origin: String(r.origin) } : {}), ...(r.suggestedPrice ? { suggestedPrice: String(r.suggestedPrice) } : {}), ...(r.sellingPoints ? { sellingPoints: String(r.sellingPoints) } : {}), ...(r.coreIngredients ? { coreIngredients: String(r.coreIngredients) } : {}), ...(r.shippingTimeliness && ['24h','48h','72h','7d','custom'].includes(r.shippingTimeliness) ? { shippingTimeliness: r.shippingTimeliness } : {}), ...(r.courier ? { courier: String(r.courier) } : {}), ...(r.afterSalesRules ? { afterSalesRules: String(r.afterSalesRules) } : {}), ...(r.brandBackground ? { brandBackground: String(r.brandBackground) } : {}), ...(r.targetAudience ? { targetAudience: String(r.targetAudience) } : {}), ...(r.usageScene ? { usageScene: String(r.usageScene) } : {}), }; onChange(updated) } } catch(e) {} setExtractLoading(false) }
  
  const handlePolishSellingPoints = async () => { const text = input.sellingPoints.trim(); if (!text || polishLoading) return; prePolishRef.current = text; setPolishLoading(true); try { const res = await fetch('/api/chat/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instruction: '请优化以下商品的核心卖点，让每条卖点更吸引人、更有说服力、表述更清晰。保持每行一条的格式，不要合并成段落，不要添加任何标题或前缀。', modules: [{ key: 'hook', label: '核心卖点', content: '商品名：' + input.productName + '\n当前卖点：\n' + text }] }) }); const reader = res.body!.getReader(); const decoder = new TextDecoder(); let buf = ''; let result = ''; while (true) { const { done, value } = await reader.read(); if (done) break; buf += decoder.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop() || ''; for (const line of lines) { if (!line.startsWith('data: ')) continue; const d = line.slice(6); let p; try { p = JSON.parse(d) } catch { continue }; if (p.type === 'text' && p.content) result += p.content } }; const cleaned = result.replace(/===\w+===/g, '').replace(/^#{1,3}\s*核心卖点\s*$/gm, '').trim(); if (cleaned && cleaned !== text) { updateField('sellingPoints', cleaned); setPolished(true) } } catch { } setPolishLoading(false) }

  return (<div className="flex flex-col h-full"><div className="flex flex-col flex-1 min-h-0 overflow-y-auto px-4 pt-3 gap-2">
    {/* AI自动分析商品信息 */}
    <Collapsible open={aiOpen} onOpenChange={setAiOpen}><CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors">AI自动分析商品信息<svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" className={'shrink-0 text-muted-foreground transition-transform duration-200 ' + (aiOpen ? 'rotate-90' : '')}><path d="M5.5 2.5l5 5-5 5" /></svg></CollapsibleTrigger><CollapsibleContent className="pt-2">
      <div className="flex flex-col gap-2">
        <div className="flex items-center rounded-lg bg-muted p-0.5"><button onClick={() => setFileTab('paste')} className={"flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200 " + (fileTab === 'paste' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground')}>文本粘贴</button><button onClick={() => setFileTab('upload')} className={"flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200 " + (fileTab === 'upload' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground')}>上传文件</button><button onClick={() => setFileTab('link')} className={"flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200 " + (fileTab === 'link' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground')}>导入链接</button></div>
        {fileTab === 'paste' ? (<div className="flex flex-col gap-2"><Textarea rows={6} placeholder="在此粘贴商品资料文本，AI将自动识别并提取关键字段" value={pasteText} onChange={e => setPasteText(e.target.value)} className="text-xs" /><button onClick={handleExtractInfo} disabled={extractLoading || !pasteText.trim()} className="flex items-center justify-center gap-1.5 rounded-md bg-[#07C160] hover:bg-[#06AD56] disabled:opacity-50 text-white text-xs font-medium py-2 px-4 transition-colors">{extractLoading ? (<><span className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent"/>AI正在提取...</>) : (<><svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7.5 1.5L9.5 5l4 .5-3 3 1 4.5-3.5-2-3.5 2 1-4.5-3-3 4-.5 2-3.5z"/></svg>AI 智能提取</>)}</button></div>) : fileTab === 'upload' ? (<div className="flex flex-col gap-2" onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false) }} onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files) addFiles(e.dataTransfer.files) }}><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">支持 Word / Excel / CSV / TXT，可多选拖拽</span><input ref={fileInputRef} type="file" className="hidden" accept=".doc,.docx,.txt,.xlsx,.xls,.csv" multiple onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }} /></div>{uploadFiles.length > 0 ? (<div className={`flex flex-col gap-1.5 rounded-lg border-2 border-dashed p-2 transition-colors ${dragOver ? 'border-[#07C160] bg-emerald-50/50' : 'border-transparent'}`}>{uploadFiles.map(uf => (<div key={uf.id} className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs ${uf.status === 'error' ? 'border-red-200 bg-red-50' : uf.status === 'done' ? 'border-emerald-200 bg-emerald-50' : 'border-border bg-card'}`}><span className="flex-1 truncate font-medium">{uf.file.name}</span><span className="text-[10px] text-muted-foreground shrink-0">{(uf.file.size / 1024).toFixed(1)}KB</span>{uf.status === 'parsing' && <span className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent shrink-0" />}{uf.status === 'done' && <svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke="#07C160" strokeWidth="1.5" className="shrink-0"><path d="M4.5 7.5l2 2 4-4"/></svg>}{uf.status === 'error' && <span className="text-[10px] text-red-500 shrink-0">{uf.error || '解析失败'}</span>}<button onClick={() => removeFile(uf.id)} className="text-muted-foreground/30 hover:text-destructive shrink-0"><svg width="12" height="12" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3.5 3.5l8 8M11.5 3.5l-8 8"/></svg></button></div>))}<div className="flex items-center gap-2"><button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 rounded-md border border-dashed border-border px-2.5 py-1.5 text-[10px] text-muted-foreground hover:border-muted-foreground/30 transition-colors"><svg width="11" height="11" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7.5 2v11M2 7.5h11"/></svg>新增文件</button><div className="flex-1" /><button onClick={handleParseAll} disabled={parseLoading || uploadFiles.length === 0} className="flex items-center gap-1.5 rounded-md bg-[#07C160] hover:bg-[#06AD56] disabled:opacity-50 text-white text-xs font-medium px-4 py-1.5 transition-colors">{parseLoading ? <><span className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent"/>解析中...</> : <><svg width="12" height="12" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7.5 1.5L9.5 5l4 .5-3 3 1 4.5-3.5-2-3.5 2 1-4.5-3-3 4-.5 2-3.5z"/></svg>开始解析</>}</button></div></div>) : (<div className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card py-6 px-4 cursor-pointer transition-colors" onClick={() => fileInputRef.current?.click()} style={dragOver ? { borderColor: '#07C160', backgroundColor: 'hsl(160 60% 35% / 0.08)' } : undefined}><div className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/80 transition-colors"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7.5 1.5v8m0 0l-2-2m2 2l2-2M2.5 7.5v4a1 1 0 001 1h8a1 1 0 001-1v-4"/></svg>{dragOver ? '松手即可上传' : '上传文件或拖拽至此'}</div><p className="text-[11px] text-muted-foreground/60">支持 Word / Excel / CSV，可多选拖拽</p></div>)}</div>) : (<div className="flex items-center gap-2 rounded-lg border border-border bg-white p-3"><Input placeholder="请粘贴文件链接地址" value={linkInput} onChange={e => setLinkInput(e.target.value)} className="flex-1 h-8 text-xs" /><Button size="sm" className="h-8 text-xs bg-[#07C160] hover:bg-[#06AD56]" onClick={() => setLinkInput('')}>确认</Button></div>)}
      </div>
    </CollapsibleContent></Collapsible>

    {/* 类目选择 */}
    <Collapsible open={categoryOpen} onOpenChange={setCategoryOpen}><CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors">类目选择<svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" className={'shrink-0 text-muted-foreground transition-transform duration-200 ' + (categoryOpen ? 'rotate-90' : '')}><path d="M5.5 2.5l5 5-5 5" /></svg></CollapsibleTrigger><CollapsibleContent className="pt-2"><Card><CardContent className="p-4"><div className={fieldCls}><Select value="food" disabled><SelectTrigger><span>食品类目</span></SelectTrigger><SelectContent><SelectGroup><SelectItem value="food">食品类目</SelectItem></SelectGroup></SelectContent></Select></div></CardContent></Card></CollapsibleContent></Collapsible>

    {/* 商品信息 */}
    <Collapsible open={productOpen} onOpenChange={setProductOpen}><CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors">商品信息<svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" className={'shrink-0 text-muted-foreground transition-transform duration-200 ' + (productOpen ? 'rotate-90' : '')}><path d="M5.5 2.5l5 5-5 5" /></svg></CollapsibleTrigger><CollapsibleContent className="pt-2">
      <div className="flex flex-col gap-4">
        <Card><CardHeader className="pb-3"><CardTitle className="text-sm">基础商品信息</CardTitle></CardHeader><CardContent><div className="flex flex-col gap-4">
          <div className={fieldCls}><Label htmlFor="productName" className="text-sm">商品名称 <span className="text-destructive">*</span></Label><Input id="productName" placeholder="例：认养一头牛每日吨吨木姜子香茅酸奶" value={input.productName} onChange={e => updateField('productName', e.target.value)} disabled={disabled} aria-invalid={!!errors.productName} />{errors.productName && <p className="text-xs text-destructive">{errors.productName}</p>}</div>
          <div className={fieldCls}><Label htmlFor="subCategory" className="text-sm">二级子品类 <span className="text-destructive">*</span></Label><Select value={input.subCategory} onValueChange={v => updateField('subCategory', v as SubCategory)} disabled={disabled}><SelectTrigger id="subCategory" aria-invalid={!!errors.subCategory}>{input.subCategory ? SUB_CATEGORY_CONFIG.find(s => s.key === input.subCategory)?.label : <span className="text-muted-foreground">选择子品类</span>}</SelectTrigger><SelectContent><SelectGroup>{SUB_CATEGORY_CONFIG.map(s => (<SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>))}</SelectGroup></SelectContent></Select>{errors.subCategory && <p className="text-xs text-destructive">{errors.subCategory}</p>}</div>
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
      {isGenerating ? (<><span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />生成中...</>) : (<><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="gen-icon shrink-0"><path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z" /><path d="M18 16l.8 2.5L21 19l-2.2.5L18 22l-.8-2.5L15 19l2.2-.5z" /><path d="M6 5l.5 1.5L8 7l-1.5.5L6 9l-.5-1.5L4 7l1.5-.5z" /></svg>一次生成2版</>)}
    </button>
    <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={() => { onChange({ ...input, productName: '', subCategory: '', netWeight: '', origin: '', productionDate: '', shelfLifeValue: '', shelfLifeUnit: 'day', suggestedPrice: '', sellingPoints: '', coreIngredients: '', shippingOrigin: '', shippingTimeliness: '48h', customShippingDays: '', courier: '', extraShippingFeeEnabled: false, extraShippingFeeAreas: '', noShippingAreasEnabled: false, noShippingAreas: '', afterSalesRules: '', brandBackground: '', targetAudience: '', usageScene: '', additionalNotes: '', textLength: 'long' as const, moduleOrder: MODULE_CONFIG.map(m => m.key) }); setErrors({}) }} disabled={isGenerating}>清空配置项</Button>
  </div>

  {/* 配置比价清单 Dialog */}
  {priceDialogOpen && (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setPriceDialogOpen(false)}>
      <div className="bg-card rounded-xl shadow-xl max-w-md w-full p-6 border border-border" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-2">配置比价清单</h3>
        <p className="text-sm text-muted-foreground mb-4">
          录入各平台价格，AI 将在生成时突出价格优势
        </p>

        <div className="mb-4 p-3 rounded-lg bg-muted/50">
          <span className="text-xs text-muted-foreground">团购价</span>
          <span className="text-lg font-semibold text-[#07C160] ml-2">
            {input.suggestedPrice ? `¥${input.suggestedPrice} / ${input.netWeight}` : '未设置'}
          </span>
        </div>

        <div className="flex flex-col gap-2 mb-4">
          {platforms.map((p, i) => (
            <div key={p.name} className="flex items-center gap-2">
              <Checkbox checked={p.enabled} onCheckedChange={() => {
                const np = [...platforms]; np[i] = { ...p, enabled: !p.enabled }; setPlatforms(np)
              }} />
              <Input
                placeholder="平台名"
                value={p.name}
                onChange={e => { const np = [...platforms]; np[i] = { ...p, name: e.target.value }; setPlatforms(np) }}
                className="w-24 h-8 text-sm"
              />
              <Input
                placeholder="价格"
                value={p.price}
                onChange={e => {
                  const v = e.target.value.replace(/[^\d.]/g, '')
                  const np = [...platforms]; np[i] = { ...p, price: v, enabled: true }; setPlatforms(np)
                }}
                onFocus={() => {
                  if (!p.enabled) { const np = [...platforms]; np[i] = { ...p, enabled: true }; setPlatforms(np) }
                }}
                className="w-20 h-8 text-sm"
              />
              <span className="text-xs text-muted-foreground">元</span>
              <Input
                placeholder="规格"
                value={p.spec}
                onChange={e => { const np = [...platforms]; np[i] = { ...p, spec: e.target.value, enabled: true }; setPlatforms(np) }}
                onFocus={() => {
                  if (!p.enabled) { const np = [...platforms]; np[i] = { ...p, enabled: true }; setPlatforms(np) }
                }}
                className="w-24 h-8 text-sm"
              />
              <button onClick={() => setPlatforms(platforms.filter((_, j) => j !== i))}
                className="text-muted-foreground/30 hover:text-destructive transition-colors shrink-0">
                <svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3.5 3.5l8 8M11.5 3.5l-8 8" /></svg>
              </button>
            </div>
          ))}
          {platforms.length < 12 && (
            <button onClick={() => setPlatforms([...platforms, { name: '', price: '', spec: '', enabled: true }])}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-[#07C160] transition-colors py-1">
              <svg width="12" height="12" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7.5 2v11M2 7.5h11" /></svg>
              添加平台
            </button>
          )}
        </div>

        <div className="mb-4">
          <Label className="text-sm mb-1 block">备注（选填）</Label>
          <Textarea rows={2} placeholder="如：天猫正在做618活动" value={priceNotes} onChange={e => setPriceNotes(e.target.value)} />
        </div>

        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" disabled className="text-xs">
            <svg width="13" height="13" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" className="mr-1"><path d="M7.5 1.5L9.5 5l4 .5-3 3 1 4.5-3.5-2-3.5 2 1-4.5-3-3 4-.5 2-3.5z" /></svg>
            AI 帮我搜价
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPriceDialogOpen(false)}>取消</Button>
            <Button size="sm" className="bg-[#07C160] hover:bg-[#06AD56]" onClick={() => {
              const hasPrice = platforms.some(p => p.enabled && p.price.trim())
              if (hasPrice) {
                if (!input.selectedModules.includes('comparison')) {
                  updateField('selectedModules', [...input.selectedModules, 'comparison'])
                }
                setPriceDialogOpen(false)
              }
            }}>保存</Button>
          </div>
        </div>
      </div>
    </div>
  )}
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
}
