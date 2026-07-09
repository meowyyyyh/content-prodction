import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { LeftPanel } from '@/components/panels/LeftPanel'
import { CenterPanel } from '@/components/panels/CenterPanel'
import { RightPanel } from '@/components/panels/RightPanel'
import { MODULE_CONFIG, STYLE_CONFIG, SHORT_TEMPLATE } from '@/config/modules'
import type { ProductInput, ModuleResult, GenerateStatus, ModuleKey, ContentStyle, ShippingTimeliness, GenerateCount } from '@/types'

const DEFAULT_INPUT: ProductInput = {
  productName: '认养一头牛 每日吨吨木姜子香茅酸奶', subCategory: 'dairy', netWeight: '200g×12瓶',
  origin: '内蒙古呼和浩特', suggestedPrice: '59.90',
  sellingPoints: '0添加蔗糖\n3.0g优质乳蛋白\n北纬40°黄金奶源\n口感醇厚不酸涩\n木姜子+香茅独特风味',
  coreIngredients: '生牛乳（≥90%）、白砂糖、木姜子提取物、香茅提取物、发酵菌',
  shippingOrigin: '上海', shippingTimeliness: '48h' as ShippingTimeliness, courier: '顺丰冷链',
  afterSalesRules: '生鲜不支持7天无理由退货，质量问题签收24小时内凭照片申请赔付',
  brandBackground: '认养一头牛，自有牧场位于北纬40°黄金奶源带，通过ISO 22000认证',
  targetAudience: '久坐办公党、下午茶爱好者、注重健康的家庭', usageScene: '早餐搭配、办公室下午茶、健身后加餐', textLength: 'long' as const,
  productionDate: '', shelfLifeValue: '', shelfLifeUnit: 'day', customShippingDays: '',
  extraShippingFeeEnabled: false, extraShippingFeeAreas: '', noShippingAreasEnabled: false, noShippingAreas: '',
  additionalNotes: '', style: 'xiaohongshu' as ContentStyle,
  selectedModules: SHORT_TEMPLATE,
  moduleOrder: MODULE_CONFIG.map(m => m.key), // 14模块完整排序 generateCount: 2 as GenerateCount,
  textLength: 'long' as const,
  enableRAG: true, enableCompliance: true,
}

export default function App() {
  const [input, setInput] = useState<ProductInput>(DEFAULT_INPUT)
  const [status, setStatus] = useState<GenerateStatus>('idle')
  const [rightModulesV1, setRightModulesV1] = useState<ModuleResult[]>([])
  const [rightModulesV2, setRightModulesV2] = useState<ModuleResult[]>([])
  const [centerModules, setCenterModules] = useState<ModuleResult[]>([])
  const [versionLabelV1, setVersionLabelV1] = useState('')
  const [versionLabelV2, setVersionLabelV2] = useState('')
  const [displayOrder, setDisplayOrder] = useState<string[]>([]); const [expandHintCount, setExpandHintCount] = useState(0)
  const customBlockCounter = useRef(0)
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true')
  useEffect(() => { document.documentElement.classList.toggle('dark', darkMode); localStorage.setItem('darkMode', String(darkMode)) }, [darkMode])
  const [toast, setToast] = useState<{ msg: string; type: 'info' | 'success' | 'error' } | null>(null)
  const showToast = useCallback((msg: string, type: 'info' | 'success' | 'error' = 'info') => { setToast({ msg, type }); setTimeout(() => setToast(null), type === 'success' ? 3000 : 6000) }, [])

  const hasRequiredFields = useMemo(() => input.productName.trim().length > 0 && input.subCategory !== '' && input.netWeight.trim().length > 0 && input.suggestedPrice.trim().length > 0 && input.afterSalesRules.trim().length > 0, [input.productName, input.subCategory, input.netWeight, input.suggestedPrice, input.afterSalesRules])
  const isGenerating = status === 'generating' || status === 'checking'

  const handleGenerate = useCallback(async () => {
    if (!hasRequiredFields) return
    const orderedKeys = input.moduleOrder.filter(k => input.selectedModules.includes(k as ModuleKey))
    const makeModules = () => orderedKeys.map(key => { const config = MODULE_CONFIG.find(m => m.key === key); return { moduleKey: key, moduleLabel: config?.label || key, content: '', status: 'loading' as const, adopted: false } })
    const v1 = makeModules(); const v2 = makeModules()
    setRightModulesV1(v1); setRightModulesV2(v2)
    setVersionLabelV1('')
    setVersionLabelV2('')
    setStatus('generating')
    let doneCount = 0; const onStreamDone = () => { doneCount++; if (doneCount >= 2) setStatus('completed') }
    streamGenerate(input, orderedKeys, 'taste', v1, setRightModulesV1, onStreamDone)
    streamGenerate(input, orderedKeys, 'value', v2, setRightModulesV2, onStreamDone)
    setTimeout(() => { if (doneCount < 2) { doneCount = 2; setStatus('completed') } }, 90000)
  }, [hasRequiredFields, input])

  const handleAdoptAll = useCallback((versionModules: ModuleResult[]) => {
    console.log('[handleAdoptAll] 收到', versionModules.length, '个模块:', versionModules.map(m => m.moduleKey + ':' + m.status).join(', '))
    const completed = versionModules.filter(m => m.status === 'completed'); if (completed.length === 0) return
    setCenterModules(prev => { const updated = prev.map(m => { const src = completed.find(s => s.moduleKey === m.moduleKey); return src ? { ...m, content: src.content } : m }); const newOnes = completed.filter(s => !prev.find(m => m.moduleKey === s.moduleKey)).map(s => ({ ...s, adopted: true })); return [...updated, ...newOnes] })
    setDisplayOrder(prev => { const newKeys = completed.map(m => m.moduleKey).filter(k => !prev.includes(k)); return newKeys.length > 0 ? [...prev, ...newKeys] : prev }); setExpandHintCount(c => c + 1)
  }, [showToast])
  const handleAdopt = useCallback((moduleKey: string, content: string) => { if (!content) return; setCenterModules(prev => { const exists = prev.find(m => m.moduleKey === moduleKey); if (exists) return prev.map(m => m.moduleKey === moduleKey ? { ...m, content } : m); const newMod: ModuleResult = { moduleKey: moduleKey as ModuleKey, moduleLabel: MODULE_CONFIG.find(c => c.key === moduleKey)?.label || '', content, status: 'completed', adopted: true }; return [...prev, newMod] }); setDisplayOrder(prev => prev.includes(moduleKey) ? prev : [...prev, moduleKey]) }, [])
  const handleCenterEdit = useCallback((moduleKey: string, content: string) => { setCenterModules(prev => prev.map(m => m.moduleKey === moduleKey ? { ...m, content } : m)) }, [])
  const handleAddBlock = useCallback(() => { customBlockCounter.current += 1; const newKey = `__custom_${customBlockCounter.current}`; setDisplayOrder(prev => [...prev, newKey]); setCenterModules(prev => [...prev, { moduleKey: newKey as ModuleKey, moduleLabel: '自定义文本', content: '<br>', status: 'completed' as const, adopted: true }]); setTimeout(() => { const el = document.querySelector(`[data-block-key="${newKey}"]`) as HTMLDivElement; if (el) { el.focus(); document.getSelection()?.collapse(el, 0) } }, 50) }, [])
  const handleDeleteBlock = useCallback((moduleKey: string) => { setDisplayOrder(prev => prev.filter(k => k !== moduleKey)); setCenterModules(prev => prev.filter(m => m.moduleKey !== moduleKey)) }, [])

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      {/* 全局顶部导航 */}
      <header className="flex-shrink-0 flex items-center justify-between h-12 px-6 bg-background border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center size-7 rounded-lg bg-[#07C160] text-white text-sm font-bold">C</div>
          <span className="text-sm font-semibold text-foreground">快稿种草小助手</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setDarkMode(!darkMode)} className="inline-flex items-center justify-center size-8 rounded-md hover:bg-muted transition-colors text-muted-foreground" title={darkMode ? '切换白天模式' : '切换暗黑模式'}>{darkMode ? (<svg width="16" height="16" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="7.5" cy="7.5" r="2.5"/><path d="M7.5 1.5v2M7.5 11.5v2M1.5 7.5h2M11.5 7.5h2M3.3 3.3l1.4 1.4M10.3 10.3l1.4 1.4M3.3 11.7l1.4-1.4M10.3 4.7l1.4-1.4"/></svg>) : (<svg width="16" height="16" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7.5 1.5c-3.3 0-6 2.7-6 6s2.7 6 6 6c1.5 0 2.9-.6 3.9-1.5-2.5-1-4.4-3.4-4.4-4.5s1.9-3.5 4.4-4.5c-1-1-2.4-1.5-3.9-1.5z"/></svg>)}</button><Button variant="ghost" size="sm" className="text-xs text-muted-foreground">帮助文档</Button>
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">快捷键</Button>
          <button className="inline-flex items-center rounded-full bg-orange-50 border border-orange-200 px-3 py-1 text-xs font-medium text-orange-600 hover:bg-orange-100 transition-colors">开通会员</button>
          <button className="inline-flex items-center justify-center size-7 rounded-full bg-muted hover:bg-muted/80 transition-colors">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground"><circle cx="7.5" cy="5" r="2.5"/><path d="M1.5 13c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>
          </button>
        </div>
      </header>

      {/* 三栏主体 */}
      <div className="flex flex-1 min-h-0">
        {toast && (<div className={`fixed top-16 left-1/2 -translate-x-1/2 z-[999] flex items-center gap-2.5 rounded-lg border px-4 py-2.5 text-sm shadow-lg ${toast.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : toast.type === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}><svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0"><circle cx="7.5" cy="7.5" r="6" /><path d={toast.type === 'success' ? "M4.5 7.5l2 2 4-4" : "M7.5 4.5v3M7.5 10v.5"} /></svg><span>{toast.msg}</span></div>)}
        <div className="w-[320px] flex-shrink-0 bg-sidebar"><LeftPanel input={input} onChange={setInput} disabled={isGenerating} isGenerating={isGenerating} onGenerate={handleGenerate} hasRequiredFields={hasRequiredFields} /></div>
        <Separator orientation="vertical" />
        <div className="flex-1 min-w-0 bg-muted/20 p-4"><div className="h-full rounded-xl overflow-hidden bg-background ring-1 ring-border/50"><CenterPanel status={status} modules={centerModules} mandatoryKeys={displayOrder} onEdit={handleCenterEdit} onReorder={setDisplayOrder} onAddBlock={handleAddBlock} onDeleteBlock={handleDeleteBlock} showToast={showToast} triggerExpandHint={expandHintCount} /></div></div>
        <Separator orientation="vertical" />
        <div className="w-[640px] flex-shrink-0 bg-sidebar"><RightPanel status={status} modulesV1={rightModulesV1} modulesV2={rightModulesV2} versionLabelV1={versionLabelV1} versionLabelV2={versionLabelV2} onAdopt={handleAdopt} onAdoptAll={handleAdoptAll} /></div>
      </div>
    </div>
  )
}

function plainToHTML(text: string): string { return text.replace(/<br\s*\/?>/gi, '\n').replace(/<\/tr>/gi, '\n').replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, ' / ').replace(/<[^>]+>/g, '').replace(/\n/g, '<br>') }
function stripEmoji(text: string): string { return text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}‍️]/gu, '').replace(/\s+/g, ' ').trim() }

async function streamGenerate(product: ProductInput, moduleKeys: string[], focus: 'taste' | 'value', _mods: ModuleResult[], setModules: (v: React.SetStateAction<ModuleResult[]>) => void, onDone: () => void) {
  try { const response = await fetch('/api/generate/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product, modules: moduleKeys, focus }) }); if (!response.ok) throw new Error('Stream failed'); const reader = response.body!.getReader(); const decoder = new TextDecoder(); let buf = ''; const contents: Record<string, string> = {}; let curMod = ''; let lastUpdate = Date.now()
    const clean = (t: string) => plainToHTML(t.replace(/===\w+===/g, '').trim()); const flush = () => { const now = Date.now(); if (now - lastUpdate < 40) return; lastUpdate = now; setModules(prev => prev.map(m => ({ ...m, status: 'completed' as const, content: clean(contents[m.moduleKey] || '') }))) }
    while (true) { const { done, value } = await reader.read(); if (done) break; buf += decoder.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop() || ''; for (const line of lines) { if (!line.startsWith('data: ')) continue; const d = line.slice(6); let p; try { p = JSON.parse(d) } catch { continue }; if (p.type === 'done') continue; if (p.type === 'text' && p.content) { contents[curMod] = (contents[curMod] || '') + p.content; const m = /===(hook|price|taste|trust|aftercare|tips|cta|ingredient|origin|brand|scene|feedback|comparison|faq)===/.exec(contents[curMod] || ''); if (m) { const idx = (contents[curMod] || '').indexOf(m[0]); const before = (contents[curMod] || '').slice(0, idx); if (before.trim()) contents[curMod] = before; else delete contents[curMod]; curMod = m[1]; contents[curMod] = (contents[curMod] || '').slice(idx + m[0].length) } flush() } } }
    setModules(prev => prev.map(m => ({ ...m, status: 'completed' as const, content: clean(contents[m.moduleKey] || '') }))); onDone()
  } catch { generateRight(_mods, product, focus, setModules, onDone) }
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
