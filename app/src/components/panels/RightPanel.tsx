import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyMedia, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import type { ModuleResult, GenerateStatus, ClassifiedImage } from '@/types'

interface RightPanelProps {
  status: GenerateStatus; modulesV1: ModuleResult[]; modulesV2: ModuleResult[]; modulesV3: ModuleResult[]
  versionLabelV1: string; versionLabelV2: string; versionLabelV3: string
  onAdopt: (moduleKey: string, content: string, images?: ClassifiedImage[]) => void
  onAdoptAll: (modules: ModuleResult[]) => void
  onDislikeVersion: (version: number, label: string) => void
  onDislikeModule: (moduleKey: string, moduleLabel: string) => void
  classifiedImages?: ClassifiedImage[]
}

const IMG_MODULE_MAP: Record<string, string[]> = {
  '产品图': ['taste', 'hook'], '封面图': ['hook'], '配料表': ['trust', 'ingredient'],
  '场景图': ['scene'], '品牌图': ['brand'], '包装图': ['hook'],
}

function VersionHeader({ version, label, modules, onAdoptAll, onDislikeVersion, isRecommended, imageMap }: { version: number; label: string; modules: ModuleResult[]; onAdoptAll: (modules: ModuleResult[], versionImages?: Map<string, ClassifiedImage[]>) => void; onDislikeVersion: (version: number, label: string) => void; isRecommended?: boolean; imageMap?: Map<string, ClassifiedImage[]> }) {
  const allCompleted = modules.length > 0 && modules.every(m => m.status === 'completed')
  return (
    <div className="flex items-center justify-between mb-3 min-h-[32px]">
      <h3 className="text-sm font-semibold text-foreground flex items-center">
          {label || '版本' + version}
          {isRecommended && (
            <span className="ml-1.5 inline-flex items-center px-1 py-0.5 rounded text-[10px] font-medium leading-tight" style={{ backgroundColor: '#EBFBF5', color: '#00C87F' }}>
              最适合您
            </span>
          )}
        </h3>
      {allCompleted && (
        <div className="flex items-center gap-2">
          <button onClick={() => onDislikeVersion(version, label)} className="inline-flex items-center justify-center size-7 rounded-lg border border-transparent text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-all duration-150 active:scale-90" title="这个版本不合适，点踩反馈">
            <svg width="16" height="16" viewBox="0 0 1024 1024" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M521.6 827.52a83.136 83.136 0 0 0 166.016-8.512l-5.696-147.584 53.696 0.96a128 128 0 0 0 125.824-161.408L787.2 236.16a64 64 0 0 0-61.824-47.296H379.904v477.44l58.368 0.768 3.2 0.064c39.68 1.28 71.936 32.384 74.496 72.064l5.632 88.256zM246.656 188.928a64 64 0 0 0-64 64V599.04a64 64 0 0 0 61.888 64l102.464 3.392v-477.44H246.656z"/>
            </svg>
          </button>
          <button onClick={() => onAdoptAll(modules, imageMap)} className="inline-flex items-center rounded-md bg-[#07C160] px-3 py-1 text-xs font-medium text-white transition-all duration-150 hover:bg-[#06AD56] active:scale-95">采纳此版本</button>
        </div>
      )}
    </div>
  )
}

// 默认映射（语料库为空时的回退）
const DEFAULT_TYPE_MAP: Record<string, string[]> = {
  '封面图': ['hook'], '产品图': ['taste'],
  '配料表': ['ingredient', 'trust', 'origin'], '配料图': ['ingredient', 'trust', 'origin'],
  '场景图': ['scene'], '品牌图': ['brand'], '包装图': ['hook'],
}

// 从语料库加载映射（首次加载后缓存）
let corpusTypeMap: Record<string, string[]> | null = null
let corpusMapLoading = false
async function loadCorpusMap(): Promise<Record<string, string[]>> {
  if (corpusTypeMap) return corpusTypeMap
  if (corpusMapLoading) return DEFAULT_TYPE_MAP
  corpusMapLoading = true
  try {
    const res = await fetch('/api/corpus/image-map')
    const d = await res.json()
    if (d.success && Object.keys(d.data).length > 0) {
      corpusTypeMap = d.data
      return corpusTypeMap
    }
  } catch { /* 语料库不可用，用默认 */ }
  corpusTypeMap = DEFAULT_TYPE_MAP
  return corpusTypeMap
}

// 图片唯一分配：语料库驱动优先级，每张图只分配给最匹配的模块
function assignImages(images: ClassifiedImage[], typeMap: Record<string, string[]>): Map<string, ClassifiedImage[]> {
  const assigned = new Map<string, ClassifiedImage[]>()
  const used = new Set<string>()
  for (const [imgType, modules] of Object.entries(typeMap)) {
    for (const img of images) {
      if (used.has(img.id)) continue
      if (img.type === imgType || img.type.includes(imgType.replace(/[图表]/g,'')) || imgType.includes(img.type.replace(/[图表]/g,''))) {
        for (const mod of modules) {
          if (!assigned.has(mod)) assigned.set(mod, [])
          assigned.get(mod)!.push(img)
          used.add(img.id)
          break
        }
      }
    }
  }
  for (const img of images) {
    if (!used.has(img.id)) {
      if (!assigned.has('tips')) assigned.set('tips', [])
      assigned.get('tips')!.push(img)
    }
  }
  return assigned
}

// 模块排版规则
const MODULE_LAYOUT: Record<string, 'text_first' | 'interleave' | 'image_last'> = {
  hook: 'image_last', taste: 'interleave', price: 'text_first',
  trust: 'image_last', aftercare: 'text_first', tips: 'text_first',
  cta: 'text_first', ingredient: 'image_last', origin: 'text_first',
  brand: 'image_last', scene: 'interleave', feedback: 'text_first',
  comparison: 'text_first', faq: 'text_first',
}

function ModuleCard({ mod, isGenerating, onAdopt, onDislikeModule, moduleImages, onAdoptWithImages }: { mod: ModuleResult; isGenerating: boolean; onAdopt: (key: string, content: string) => void; onDislikeModule: (moduleKey: string, moduleLabel: string) => void; moduleImages: ClassifiedImage[]; onAdoptWithImages: (key: string, content: string, images: ClassifiedImage[]) => void }) {
  const isLoading = isGenerating && mod.status === 'loading'
  const isCompleted = mod.status === 'completed'
  const layout = MODULE_LAYOUT[mod.moduleKey] || 'text_first'
  const imgs = moduleImages || []

  const renderImages = () => imgs.map(img => (
    <div key={img.id} className="mb-3">
      {img.preview && <img src={img.preview} className="w-full rounded-lg object-cover border border-border/30" style={{ maxHeight: '240px' }} alt={img.desc || ''} />}
      <div className="text-[10px] text-muted-foreground/50 mt-0.5">{img.type}</div>
    </div>
  ))

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border/40">
        <span className="text-xs font-semibold text-foreground/70">{MODULE_LABELS[mod.moduleKey] || mod.moduleLabel}{imgs.length > 0 && <span className="text-muted-foreground/40 ml-1">· {imgs.length}图</span>}</span>
        {isLoading && <Badge variant="secondary" className="text-[10px]">生成中</Badge>}
        {isCompleted && (
          <div className="flex items-center gap-1.5">
            <button onClick={() => onDislikeModule(mod.moduleKey, MODULE_LABELS[mod.moduleKey] || mod.moduleLabel)} className="inline-flex items-center justify-center size-6 rounded-md border border-transparent text-muted-foreground/45 hover:text-foreground hover:bg-muted/50 transition-all duration-150 active:scale-90" title="这个模块内容不合适，点踩反馈">
              <svg width="15" height="15" viewBox="0 0 1024 1024" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M521.6 827.52a83.136 83.136 0 0 0 166.016-8.512l-5.696-147.584 53.696 0.96a128 128 0 0 0 125.824-161.408L787.2 236.16a64 64 0 0 0-61.824-47.296H379.904v477.44l58.368 0.768 3.2 0.064c39.68 1.28 71.936 32.384 74.496 72.064l5.632 88.256zM246.656 188.928a64 64 0 0 0-64 64V599.04a64 64 0 0 0 61.888 64l102.464 3.392v-477.44H246.656z"/>
              </svg>
            </button>
            <button onClick={() => onAdoptWithImages(mod.moduleKey, mod.content, imgs)} className="inline-flex items-center rounded-md border border-[#07C160] bg-transparent px-3 py-1 text-xs font-medium text-[#07C160] transition-all duration-150 hover:bg-[#07C160]/10 active:scale-95">采纳</button>
          </div>
        )}
      </div>
      <div className="p-3">
        {isLoading && (<div className="flex flex-col gap-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></div>)}
        {isCompleted && (<div className="text-base text-foreground whitespace-pre-wrap" style={{ lineHeight: '1.7' }}>
          {layout === 'text_first' && <>{mod.content}{imgs.length > 0 && <div className="mt-3">{renderImages()}</div>}</>}
          {layout === 'image_last' && <>{imgs.length > 0 && <div className="mb-3">{renderImages()}</div>}{mod.content}</>}
          {layout === 'interleave' && imgs.length > 0 && (() => {
            // 图文穿插：文→图→文→图
            const parts = mod.content.split(/\n\n/)
            const result = []
            parts.forEach((p, i) => { result.push(<p key={`t${i}`} className="mb-2">{p}</p>); if (i < imgs.length) result.push(<div key={`img${i}`}>{renderImages()[i]}</div>) })
            if (imgs.length > parts.length && result.length > 0) result.push(<div key="imgextra">{imgs.slice(parts.length).map(img => renderImages().find(r => r.key === img.id))}</div>)
            return result
          })()}
          {layout === 'interleave' && imgs.length === 0 && mod.content}
        </div>)}
      </div>
    </div>
  )
}

const MODULE_LABELS: Record<string, string> = { hook: '首屏钩子', price: '价格福利', taste: '口感体验', trust: '基础信任', aftercare: '物流售后', tips: '储存贴士', cta: '行动召唤', ingredient: '成分科普', origin: '原料溯源', brand: '品牌背书', scene: '场景共情', feedback: '用户反馈', comparison: '全网比价', faq: '常见问题' }

export function RightPanel({ status, modulesV1, modulesV2, modulesV3, versionLabelV1, versionLabelV2, versionLabelV3, onAdopt, onAdoptAll, onDislikeVersion, onDislikeModule, classifiedImages }: RightPanelProps) {
  const isIdle = status === 'idle'; const isGenerating = status === 'generating' || status === 'checking'; const isBlocked = status === 'blocked'
  const [typeMap, setTypeMap] = useState(DEFAULT_TYPE_MAP)
  useEffect(() => { loadCorpusMap().then(setTypeMap) }, [])
  const imageMap = (classifiedImages && classifiedImages.length > 0) ? assignImages(classifiedImages, typeMap) : new Map()
  const onAdoptWithImages = (key: string, content: string, imgs: ClassifiedImage[]) => {
    onAdopt(key, content, imgs)
  }
  // 调试：如果没有分配到模块的图片，兜底显示到第一个模块
  if (classifiedImages && classifiedImages.length > 0 && imageMap.size === 0) {
    imageMap.set('hook', classifiedImages)
  }
  return (<div className="flex flex-col h-full"><div className={`flex-1 overflow-x-auto overflow-y-auto ${isIdle || isBlocked ? 'flex items-center justify-center' : ''}`}>
    {isIdle && <div className="p-4"><Empty><EmptyHeader><EmptyMedia variant="icon"><svg width="20" height="20" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1.5" y="1.5" width="12" height="12" rx="2" /><path d="M4 5.5h7M4 8h5M4 10.5h3" /></svg></EmptyMedia><EmptyTitle>生成后将展示候选版本</EmptyTitle><EmptyDescription>点击左侧「一键生成」，AI 文案将按模块展示在此区域，可逐模块采纳到中栏编辑定稿</EmptyDescription></EmptyHeader></Empty></div>}
    {isBlocked && <div className="p-4"><Empty><EmptyHeader><EmptyMedia variant="icon"><svg width="20" height="20" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7.5 6.5v-4m0 0l-2 2m2-2l2 2M1.5 12.5l6-6 6 6" /></svg></EmptyMedia><EmptyTitle className="text-destructive">生成被阻断</EmptyTitle><EmptyDescription>检测到输入内容包含高危违规词</EmptyDescription></EmptyHeader></Empty></div>}
    {!isIdle && !isBlocked && (
   <div className="flex flex-col gap-3 min-w-fit">
   {/* 三版头部 — 吸顶 */}
    <div className="flex min-w-fit sticky top-0 z-10 bg-background/95 backdrop-blur-xl border-b border-border/40 px-4 pt-4 pb-3 shadow-sm">
      <div className="flex-1 min-w-[280px] pr-3"><VersionHeader version={1} label={versionLabelV1} modules={modulesV1} onAdoptAll={onAdoptAll} onDislikeVersion={onDislikeVersion} isRecommended={true} imageMap={imageMap} /></div>
      <div className="flex-1 min-w-[280px] border-l border-border/30 pl-3 pr-3"><VersionHeader version={2} label={versionLabelV2} modules={modulesV2} onAdoptAll={onAdoptAll} onDislikeVersion={onDislikeVersion} imageMap={imageMap} /></div>
      <div className="flex-1 min-w-[280px] border-l border-border/30 pl-3"><VersionHeader version={3} label={versionLabelV3} modules={modulesV3} onAdoptAll={onAdoptAll} onDislikeVersion={onDislikeVersion} imageMap={imageMap} /></div>
    </div>
    <div className="px-4 pb-4 flex flex-col gap-3">
    {/* 按模块行：三版并排 */}
    {modulesV1.map((mod, i) => {
      const mod2 = modulesV2[i]
      const mod3 = modulesV3[i]
      return (
        <div key={mod.moduleKey} className="flex min-w-fit">
          <div className="flex-1 min-w-[280px] pr-3"><ModuleCard mod={mod} isGenerating={isGenerating} onAdopt={onAdopt} onDislikeModule={onDislikeModule} moduleImages={imageMap.get(mod.moduleKey) || []} onAdoptWithImages={onAdoptWithImages} /></div>
          <div className="flex-1 min-w-[280px] border-l border-border/20 pl-3 pr-3">{mod2 ? <ModuleCard mod={mod2} isGenerating={isGenerating} onAdopt={onAdopt} onDislikeModule={onDislikeModule} moduleImages={imageMap.get(mod2.moduleKey) || []} onAdoptWithImages={onAdoptWithImages} /> : null}</div>
          <div className="flex-1 min-w-[280px] border-l border-border/20 pl-3">{mod3 ? <ModuleCard mod={mod3} isGenerating={isGenerating} onAdopt={onAdopt} onDislikeModule={onDislikeModule} moduleImages={imageMap.get(mod3.moduleKey) || []} onAdoptWithImages={onAdoptWithImages} /> : null}</div>
       </div>
      )})}
  </div>
  </div>
)}
  </div></div>)
}
