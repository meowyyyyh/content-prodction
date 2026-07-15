import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyMedia, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import type { ModuleResult, GenerateStatus } from '@/types'

interface RightPanelProps {
  status: GenerateStatus; modulesV1: ModuleResult[]; modulesV2: ModuleResult[]; modulesV3: ModuleResult[]
  versionLabelV1: string; versionLabelV2: string; versionLabelV3: string
  onAdopt: (moduleKey: string, content: string) => void
  onAdoptAll: (modules: ModuleResult[]) => void
}

function VersionHeader({ version, label, modules, onAdoptAll }: { version: number; label: string; modules: ModuleResult[]; onAdoptAll: (modules: ModuleResult[]) => void }) {
  const allCompleted = modules.length > 0 && modules.every(m => m.status === 'completed')
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold text-foreground">版本{version}{label ? '：' + label : ''}</h3>
      {allCompleted && (
        <button onClick={() => onAdoptAll(modules)} className="inline-flex items-center rounded-md bg-[#07C160] px-3 py-1 text-xs font-medium text-white transition-all duration-150 hover:bg-[#06AD56] active:scale-95">采纳此版本</button>
      )}
    </div>
  )
}

function ModuleCard({ mod, isGenerating, onAdopt }: { mod: ModuleResult; isGenerating: boolean; onAdopt: (key: string, content: string) => void }) {
  const isLoading = isGenerating && mod.status === 'loading'
  const isCompleted = mod.status === 'completed'
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border/40">
        <span className="text-xs font-semibold text-foreground/70">{MODULE_LABELS[mod.moduleKey] || mod.moduleLabel}</span>
        {isLoading && <Badge variant="secondary" className="text-[10px]">生成中</Badge>}
        {isCompleted && (
          <button onClick={() => onAdopt(mod.moduleKey, mod.content)} className="inline-flex items-center rounded-md border border-[#07C160] bg-transparent px-3 py-1 text-xs font-medium text-[#07C160] transition-all duration-150 hover:bg-[#07C160]/10 active:scale-95">采纳</button>
        )}
      </div>
      <div className="p-3">
        {isLoading && (<div className="flex flex-col gap-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></div>)}
        {isCompleted && (<div className="text-base text-foreground whitespace-pre-wrap" style={{ lineHeight: '1.7' }}>{mod.content}{mod.complianceHits && mod.complianceHits.length > 0 ? (<div className='mt-2 flex flex-wrap gap-1'>{mod.complianceHits.map((h,i) => (<span key={i} className='inline-flex items-center rounded-sm bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] text-amber-700' title={h.violationType + ': ' + h.flaggedText}>⚠ {h.flaggedText}</span>))}</div>) : null}</div>)}
      </div>
    </div>
  )
}

const MODULE_LABELS: Record<string, string> = { hook: '首屏钩子', price: '价格福利', taste: '口感体验', trust: '基础信任', aftercare: '物流售后', tips: '储存贴士', cta: '行动召唤', ingredient: '成分科普', origin: '原料溯源', brand: '品牌背书', scene: '场景共情', feedback: '用户反馈', comparison: '全网比价', faq: '常见问题' }

export function RightPanel({ status, modulesV1, modulesV2, modulesV3, versionLabelV1, versionLabelV2, versionLabelV3, onAdopt, onAdoptAll }: RightPanelProps) {
  const isIdle = status === 'idle'; const isGenerating = status === 'generating' || status === 'checking'; const isBlocked = status === 'blocked'
  return (<div className="flex flex-col h-full"><div className={`flex-1 overflow-x-auto overflow-y-auto p-4 ${isIdle || isBlocked ? 'flex items-center justify-center' : ''}`}>
    {isIdle && (<Empty><EmptyHeader><EmptyMedia variant="icon"><svg width="20" height="20" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1.5" y="1.5" width="12" height="12" rx="2" /><path d="M4 5.5h7M4 8h5M4 10.5h3" /></svg></EmptyMedia><EmptyTitle>生成后将展示候选版本</EmptyTitle><EmptyDescription>点击左侧「一键生成」，AI 文案将按模块展示在此区域，可逐模块采纳到中栏编辑定稿</EmptyDescription></EmptyHeader></Empty>)}
    {isBlocked && (<Empty><EmptyHeader><EmptyMedia variant="icon"><svg width="20" height="20" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7.5 6.5v-4m0 0l-2 2m2-2l2 2M1.5 12.5l6-6 6 6" /></svg></EmptyMedia><EmptyTitle className="text-destructive">生成被阻断</EmptyTitle><EmptyDescription>检测到输入内容包含高危违规词</EmptyDescription></EmptyHeader></Empty>)}
    {!isIdle && !isBlocked && (
  <div className="flex flex-col gap-3 min-w-fit">
    {/* 三版头部 */}
    <div className="flex gap-4 min-w-fit">
      <div className="flex-1 min-w-[280px]"><VersionHeader version={1} label={versionLabelV1} modules={modulesV1} onAdoptAll={onAdoptAll} /></div>
      <div className="flex-1 min-w-[280px]"><VersionHeader version={2} label={versionLabelV2} modules={modulesV2} onAdoptAll={onAdoptAll} /></div>
      <div className="flex-1 min-w-[280px]"><VersionHeader version={3} label={versionLabelV3} modules={modulesV3} onAdoptAll={onAdoptAll} /></div>
    </div>
    {/* 按模块行：三版并排 */}
    {modulesV1.map((mod, i) => {
      const mod2 = modulesV2[i]
      const mod3 = modulesV3[i]
      return (
        <div key={mod.moduleKey} className="flex gap-4 min-w-fit">
          <div className="flex-1 min-w-[280px]"><ModuleCard mod={mod} isGenerating={isGenerating} onAdopt={onAdopt} /></div>
          <div className="flex-1 min-w-[280px]">{mod2 ? <ModuleCard mod={mod2} isGenerating={isGenerating} onAdopt={onAdopt} /> : null}</div>
          <div className="flex-1 min-w-[280px]">{mod3 ? <ModuleCard mod={mod3} isGenerating={isGenerating} onAdopt={onAdopt} /> : null}</div>
        </div>
      )})}
  </div>
)}
  </div></div>)
}
