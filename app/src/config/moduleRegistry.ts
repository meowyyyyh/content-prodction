// 模块注册表 + 类目→模块映射（三层查找链）
// Phase 1: 美食酒水可用，其他类目用纯通用模块

import type { ModuleKey, ModuleConfig } from '@/types'

// ============================================================
// 模块定义注册表
// ============================================================

export const ALL_MODULES: ModuleConfig[] = [
  // === 准通用模块（10个，绝大多数类目共享）===
  { key: 'hook', label: '首屏钩子', scope: 'common', description: '开场抓注意力，利益点前置' },
  { key: 'price', label: '价格福利', scope: 'common', description: '售价、规格数量、赠品权益、优惠力度' },
  { key: 'trust', label: '基础信任', scope: 'common', description: '品质保证、认证、口碑、数据支撑' },
  { key: 'brand', label: '品牌背书', scope: 'common', description: '品牌故事、实力展示' },
  { key: 'scene', label: '场景共情', scope: 'common', description: '使用场景、生活方式' },
  { key: 'aftercare', label: '物流售后', scope: 'common', description: '发货时效、快递方式、售后规则' },
  { key: 'tips', label: '使用贴士', scope: 'common', description: '储存/使用/注意事项' },
  { key: 'feedback', label: '用户反馈', scope: 'common', description: '好评/用户晒单' },
  { key: 'faq', label: '常见问题', scope: 'common', description: 'Q&A解答' },

  // === 可选通用模块（暂无）===

  // === 美食酒水专属模块 ===
  { key: 'taste', label: '口感体验', scope: 'food', description: '味觉/嗅觉/质地描述' },
  { key: 'ingredient', label: '成分科普', scope: 'food', description: '配料/营养成分解读' },
  { key: 'origin', label: '原料溯源', scope: 'food', description: '产地/奶源/种植环境' },

  // === 行动召唤（始终最后） ===
  { key: 'cta', label: '行动召唤', scope: 'common', description: '引导下单、团购入口' },
]

// ============================================================
// 模块配置类型
// ============================================================

export interface CategoryModuleConfig {
  mandatory: ModuleKey[]     // 必选（灰色不可取消）
  recommended: ModuleKey[]   // 推荐（默认勾选，可取消）
  optional: ModuleKey[]      // 可选（默认不勾选，doubao可触发自动勾选）
}

// ============================================================
// 一级默认（15个一级类目 → 默认模块组）
// 命名规则：__level1Name__
// ============================================================

export const LEVEL1_DEFAULTS: Record<string, CategoryModuleConfig> = {
  '__美食酒水__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['taste', 'trust', 'ingredient', 'origin', 'brand', 'scene', 'aftercare', 'tips', 'faq'],
    optional: ['feedback'],
  },
  '__美妆洗护__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['trust', 'brand', 'scene', 'aftercare', 'tips', 'faq'],
    optional: ['feedback'],
    // TODO Phase 3: recommended 加入 beauty_effect/beauty_ingredient/usage
  },
  '__default__': {  // 其他一级类目 → 纯通用
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['trust', 'brand', 'scene', 'aftercare', 'tips', 'faq'],
    optional: ['feedback'],
  },
}

// ============================================================
// 二级覆盖（整个二级类目需要不同配置时使用）
// 命名规则：__level1Name__level2Name__
// ============================================================

export const LEVEL2_OVERRIDES: Record<string, CategoryModuleConfig> = {
  // 美食酒水 > 水果蔬菜 → B组（生鲜，ingredient默认不勾选）
  '__美食酒水__水果蔬菜__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['taste', 'trust', 'origin', 'brand', 'scene', 'aftercare', 'tips', 'faq'],
    optional: ['ingredient', 'feedback'],
  },
  // 美食酒水 > 肉蛋海鲜 → B组
  '__美食酒水__肉蛋海鲜__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['taste', 'trust', 'origin', 'brand', 'scene', 'aftercare', 'tips', 'faq'],
    optional: ['ingredient', 'feedback'],
  },
  // 美食酒水 > 滋补保健 → C组
  '__美食酒水__滋补保健__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['taste', 'trust', 'origin', 'brand', 'scene', 'aftercare', 'tips', 'faq'],
    optional: ['ingredient', 'feedback'],
  },
  // 美食酒水 > 粮油调味 → A'组（ingredient默认不勾选）
  '__美食酒水__粮油调味__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['taste', 'trust', 'origin', 'brand', 'scene', 'aftercare', 'tips', 'faq'],
    optional: ['ingredient', 'feedback'],
  },
  // 美妆洗护 > 保养保健 → 例外（美妆模块降为optional）
  '__美妆洗护__保养保健__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['trust', 'brand', 'scene', 'aftercare', 'tips', 'faq'],
    optional: ['feedback'],
    // beauty_effect/beauty_ingredient/usage 在 Phase 3 加入 optional
  },
}

// ============================================================
// 三级精确覆盖（极少使用，通常为空）
// ============================================================

export const CATEGORY_MODULE_MAP: Record<string, CategoryModuleConfig> = {
  // 仅为特定三级类目需要不同配置时添加
}

// ============================================================
// 三层查找
// ============================================================
// lookup: catCode ("level1::level2::level3")
//   ① CATEGORY_MODULE_MAP[catCode]（三级精确）
//   ② LEVEL2_OVERRIDES["__level1__level2__"]（二级覆盖）
//   ③ LEVEL1_DEFAULTS["__level1__"]（一级默认）
//   ④ LEVEL1_DEFAULTS["__default__"]（兜底）

export function getModuleConfig(catLevel1: string, catLevel2: string, catLevel3: string): CategoryModuleConfig {
  // ① 三级精确
  const code = `${catLevel1}::${catLevel2}::${catLevel3}`
  if (CATEGORY_MODULE_MAP[code]) return CATEGORY_MODULE_MAP[code]

  // ② 二级覆盖
  const l2Key = `__${catLevel1}__${catLevel2}__`
  if (LEVEL2_OVERRIDES[l2Key]) return LEVEL2_OVERRIDES[l2Key]

  // ③ 一级默认
  const l1Key = `__${catLevel1}__`
  if (LEVEL1_DEFAULTS[l1Key]) return LEVEL1_DEFAULTS[l1Key]

  // ④ 兜底
  return LEVEL1_DEFAULTS['__default__']!
}

// ============================================================
// 模块展示顺序
// ============================================================

export const DEFAULT_MODULE_ORDER: Record<string, ModuleKey[]> = {
  // price 靠前第二顺位（2026-07-20 运营会议确认）；aftercare 默认不勾选，系统自动贴笔记末尾
  '美食酒水': ['hook', 'price', 'taste', 'origin', 'ingredient', 'trust', 'brand', 'scene', 'aftercare', 'tips', 'feedback', 'faq', 'cta'],
  '美妆洗护': ['hook', 'beauty_effect', 'beauty_ingredient', 'usage', 'price', 'trust', 'brand', 'scene', 'aftercare', 'tips', 'feedback', 'faq', 'cta'],
  '__default__': ['hook', 'price', 'trust', 'brand', 'scene', 'aftercare', 'tips', 'feedback', 'faq', 'cta'],
}

// 生成 catCode
export function makeCatCode(level1: string, level2: string, level3: string): string {
  return `${level1}::${level2}::${level3}`
}

// 获取可用模块列表（该类目下可选的模块）
export function getAvailableModules(catLevel1: string, catLevel2: string, catLevel3: string): ModuleKey[] {
  const config = getModuleConfig(catLevel1, catLevel2, catLevel3)
  return [...new Set([...config.mandatory, ...config.recommended, ...config.optional])]
}

// 获取默认勾选的模块（仅 mandatory，非必选由 AI 深推决定）
export function getDefaultModules(catLevel1: string, catLevel2: string, catLevel3: string): ModuleKey[] {
  const config = getModuleConfig(catLevel1, catLevel2, catLevel3)
  return [...config.mandatory]
}

// ============================================================
// 类目模糊匹配（Levenshtein 距离兜底）
// ============================================================

function levenshteinDistance(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]) + 1
    }
  }
  return dp[m][n]
}

export type CategoryMatchResult = { matched: string; type: 'exact' | 'fuzzy' } | null

/** 在候选类目列表中做精确+模糊匹配 */
export function fuzzyMatchCategory(llmValue: string, candidates: string[], maxDistance = 2): CategoryMatchResult {
  if (!llmValue || !candidates.length) return null
  const trimmed = llmValue.trim()
  // 1) 精确匹配
  if (candidates.includes(trimmed)) return { matched: trimmed, type: 'exact' }
  // 2) 模糊匹配（Levenshtein ≤ maxDistance）
  let bestMatch: string | null = null
  let bestDist = Infinity
  for (const c of candidates) {
    const dist = levenshteinDistance(trimmed, c)
    if (dist < bestDist) { bestDist = dist; bestMatch = c }
  }
  if (bestMatch && bestDist <= maxDistance) return { matched: bestMatch, type: 'fuzzy' }
  return null
}

/** 三级类目模糊匹配：分别在一级、二级、三级候选列表中匹配 */
export function fuzzyMatchAllLevels(
  llmCat1: string, llmCat2: string, llmCat3: string,
  level1s: string[], getLevel2s: (l1: string) => string[], getLevel3s: (l1: string, l2: string) => string[],
): { catLevel1: string; catLevel2: string; catLevel3: string; matchType: 'exact' | 'fuzzy' | 'none' } {
  const l1Match = fuzzyMatchCategory(llmCat1, level1s)
  if (!l1Match) return { catLevel1: '', catLevel2: '', catLevel3: '', matchType: 'none' }

  const l2Candidates = getLevel2s(l1Match.matched)
  const l2Match = fuzzyMatchCategory(llmCat2, l2Candidates)
  if (!l2Match) return { catLevel1: l1Match.matched, catLevel2: '', catLevel3: '', matchType: l1Match.type }

  const l3Candidates = getLevel3s(l1Match.matched, l2Match.matched)
  const l3Match = fuzzyMatchCategory(llmCat3, l3Candidates)
  if (!l3Match) return { catLevel1: l1Match.matched, catLevel2: l2Match.matched, catLevel3: '', matchType: l1Match.type === 'fuzzy' || l2Match.type === 'fuzzy' ? 'fuzzy' : 'exact' }

  const worstType = l1Match.type === 'fuzzy' || l2Match.type === 'fuzzy' || l3Match.type === 'fuzzy' ? 'fuzzy' as const : 'exact' as const
  return { catLevel1: l1Match.matched, catLevel2: l2Match.matched, catLevel3: l3Match.matched, matchType: worstType }
}
