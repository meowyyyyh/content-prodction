import { useState, useMemo, useRef, useEffect } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import type { ClassifiedImage, ModuleKey } from '@/types'
import { MODULE_CONFIG } from '@/config/modules'

export interface ImageConfirmItem extends ClassifiedImage {
  status?: 'success' | 'failed'
}

export interface ModuleSuggestion {
  moduleKey: ModuleKey
  moduleLabel: string
  description: string
  isSelected: boolean
}

interface ImageConfirmDialogProps {
  open: boolean
  images: ImageConfirmItem[]
  moduleSuggestions: ModuleSuggestion[]
  onConfirm: (images: ImageConfirmItem[], checkModules: ModuleKey[]) => void
  onReanalyze?: (imageIds: string[]) => void
  onCancel: () => void
}

const IMAGE_TYPE_OPTIONS = ['产品图', '封面图', '配料表', '场景图', '品牌图', '包装图', '其他']

export function ImageConfirmDialog({ open, images, moduleSuggestions, onConfirm, onCancel, onReanalyze }: ImageConfirmDialogProps) {
  const [editingImages, setEditingImages] = useState<ImageConfirmItem[]>(images)
  const [checkedModules, setCheckedModules] = useState<Set<string>>(new Set())

  // Reset state when modal opens with new images
  const [initialized, setInitialized] = useState(false)
  const [fullPreviewUrl, setFullPreviewUrl] = useState<string | null>(null)
  const editingImagesRef = useRef(editingImages)
  editingImagesRef.current = editingImages
  const [reanalyzingIds, setReanalyzingIds] = useState<Set<string>>(new Set())
  if (open && !initialized) {
    setEditingImages(images)
    setCheckedModules(new Set())
    setInitialized(true)
  }
  if (!open && initialized) {
    setInitialized(false)
  }

  const successCount = useMemo(() => editingImages.filter(i => i.status !== 'failed').length, [editingImages])
  const failedCount = useMemo(() => editingImages.filter(i => i.status === 'failed').length, [editingImages])
  const totalCount = editingImages.length

  const handleDescChange = (id: string, value: string) => {
    setEditingImages(prev => prev.map(i => i.id === id ? { ...i, desc: value } : i))
  }

  const handleTypeChange = (id: string, newType: string) => {
    setEditingImages(prev => prev.map(i => i.id === id ? { ...i, type: newType } : i))
  }

  const toggleModule = (key: string) => {
    setCheckedModules(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleConfirm = () => {
    onConfirm(editingImagesRef.current, [...checkedModules] as ModuleKey[])
    onCancel()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      {/* Full-size image overlay */}
      {fullPreviewUrl && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-8" onClick={() => setFullPreviewUrl(null)}>
          <img src={fullPreviewUrl} className="max-w-full max-h-full object-contain rounded-lg" alt="预览" onClick={e => e.stopPropagation()} />
          <button onClick={() => setFullPreviewUrl(null)} className="absolute top-4 right-4 size-10 rounded-full bg-white/20 hover:bg-white/40 text-white flex items-center justify-center transition-colors">
            <svg width="20" height="20" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3.5 3.5l8 8M11.5 3.5l-8 8"/></svg>
          </button>
        </div>
      )}
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-border animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold">图片分析结果确认 <span className="text-xs font-normal text-muted-foreground">（确认图片信息，帮助 AI 更精准地排版）</span></h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {successCount}/{totalCount} 张分析成功
              {failedCount > 0 && <span className="text-red-500 ml-2">，{failedCount} 张失败 <button className="ml-2 text-xs text-blue-500 hover:text-blue-600 underline cursor-pointer" onClick={e => { e.stopPropagation(); const failedIds = editingImages.filter(i => i.status === 'failed').map(i => i.id); if (failedIds.length > 0) { setReanalyzingIds(prev => { const s = new Set(prev); failedIds.forEach(id => s.add(id)); return s }); console.warn("Reanalyzing all failed:", failedIds); onReanalyze?.(failedIds) } }}>重新分析全部失败图片</button></span>}
            </p>
          </div>
          <button onClick={onCancel} className="size-8 rounded-md hover:bg-muted transition-colors flex items-center justify-center text-muted-foreground">
            <svg width="16" height="16" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3.5 3.5l8 8M11.5 3.5l-8 8" /></svg>
          </button>
        </div>

        {/* Image list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {editingImages.map(img => (
            <div key={img.id} className="flex gap-4 p-3 rounded-xl border border-border bg-muted/30">
              {/* Left: image preview + re-analyze button */}
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                <div className="relative w-[140px] h-[140px] rounded-lg overflow-hidden bg-muted cursor-pointer" onClick={() => setFullPreviewUrl(img.preview || null)}>
                {img.preview ? (
                  <img src={img.preview} className="w-full h-full object-cover" alt={img.desc || ''} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">无预览</div>
                )}
                <span className={`absolute bottom-1.5 left-1.5 text-[9px] px-1.5 py-0.5 rounded leading-tight ${img.status === 'failed' ? 'bg-red-100/90 border border-red-200 text-red-700' : 'bg-white/90 border border-emerald-200 text-emerald-700'}`}>
                  {img.type || '未分类'}
                </span>
              </div>
                <button
                  className="text-[11px] text-blue-500 hover:text-blue-600 cursor-pointer flex items-center gap-1"
                  onClick={e => { e.stopPropagation(); if (reanalyzingIds.has(img.id)) return; setReanalyzingIds(prev => { const s = new Set(prev); s.add(img.id); return s }); onReanalyze?.([img.id]) }}
                >
                  {reanalyzingIds.has(img.id) ? (
                    <><span className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />分析中</>
                  ) : (
                    <><svg width="11" height="11" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1.5 7.5c0-3.3 2.7-6 6-6s6 2.7 6 6-2.7 6-6 6c-1.8 0-3.4-.8-4.5-2"/><path d="M2.5 5.5l-1 2 2-1"/></svg>重新分析图片</>
                  )}
                </button>
              </div>
              {/* Right: tag selector + desc textarea + summary — unified column */}
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                {/* Tag row */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-medium shrink-0">标签</span>
                  <div className="relative">
                    <select
                      className="rounded-md border border-border bg-card pl-2.5 pr-7 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 appearance-none cursor-pointer"
                      value={img.type || '其他'}
                      onChange={e => handleTypeChange(img.id, e.target.value)}
                    >
                      {IMAGE_TYPE_OPTIONS.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <svg className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" width="10" height="10" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4.5 6.5l3 3 3-3"/></svg>
                  </div>
                  {img.layout_role && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                      {img.layout_role === 'hero' ? '主视觉' : img.layout_role === 'detail' ? '细节' : img.layout_role === 'scene' ? '场景' : img.layout_role === 'info' ? '信息图' : img.layout_role === 'step' ? '步骤' : img.layout_role}
                    </Badge>
                  )}
                </div>
                {/* Desc textarea */}
                <span className="text-xs text-muted-foreground">图片内容
                  {img.status === 'failed' && <span className="text-red-500">（分析失败，请手动填写图片内容）{reanalyzingIds.has(img.id) ? <span className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent ml-1 align-middle" /> : <button className="ml-1 text-xs text-blue-500 hover:text-blue-600 underline cursor-pointer" onClick={e => { e.stopPropagation(); setReanalyzingIds(prev => { const s = new Set(prev); s.add(img.id); return s }); onReanalyze?.([img.id]) }}>重新分析</button>}</span>}
                </span>
                <Textarea className="flex-1 min-h-[100px] text-sm resize-none" value={img.desc || ''} onChange={e => handleDescChange(img.id, e.target.value)} placeholder={img.status === 'failed' ? '分析失败，请手动填写图片内容…' : '编辑图片内容…'} />
                {/* Content summary */}
                <p className="text-xs text-muted-foreground break-all">内容摘要：{img.imageContentSummary || '（暂无，可点击下方重新分析生成）'}</p>
              </div>
            </div>
          ))}
        </div>




        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-t border-border">
          <span className="text-xs text-muted-foreground">共 {totalCount} 张图片，可修改标签和图片内容</span>
          <div className="flex gap-3">
            <button onClick={onCancel} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">取消</button>
            <button onClick={handleConfirm} className="rounded-md bg-[#07C160] hover:bg-[#06AD56] px-6 py-2 text-sm font-medium text-white transition-colors">保存</button>
          </div>
        </div>
      </div>
    </div>
  )
}
