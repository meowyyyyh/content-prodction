// ============================================================
// 生成引擎服务
// 负责组装 Prompt、调用 LLM、解析返回结果
// ============================================================

import { readFileSync, readdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { CONFIG } from '../config/index.js'
import { GLOBAL_SYSTEM_PROMPT } from '../prompts/global.js'
import { STYLE_PROMPTS } from '../prompts/styles.js'
import { MODULE_CONTENT_REQS } from '../prompts/modules.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ============================================================
// RULES RAG — 禁止项 & 商品规则检索
// ============================================================
let rulesData = null
function loadRules() {
  if (rulesData) return rulesData
  const rulesPath = resolve(__dirname, '../../../data/rules/category_rules.json')
  if (!existsSync(rulesPath)) return null
  try {
    rulesData = JSON.parse(readFileSync(rulesPath, 'utf-8'))
  } catch (e) {
    console.error('[RULES RAG] JSON 解析失败，回退到空规则集:', e.message)
    rulesData = { __universal__: {} }
  }
  return rulesData
}

function retrieveRules(catLevel1, moduleKey) {
  const rules = loadRules()
  if (!rules) return { forbidden: [], required: [] }
  const forbidden = [], required = []

  // ① catLevel1 + moduleKey 精确规则
  const exact = rules[catLevel1]?.[moduleKey]
  if (exact) { forbidden.push(...(exact.forbidden || [])); required.push(...(exact.required || [])) }
  // ② __universal__ + moduleKey 兜底
  const fallback = rules.__universal__?.[moduleKey]
  if (fallback) { forbidden.push(...(fallback.forbidden || [])); required.push(...(fallback.required || [])) }
  return { forbidden, required }
}

function retrieveGlobalRules(catLevel1) {
  const rules = loadRules()
  if (!rules) return { forbidden: [], required: [] }
  const global = rules[catLevel1]?.['*']
  if (!global) return { forbidden: [], required: [] }
  return { forbidden: [...(global.forbidden || [])], required: [...(global.required || [])] }
}

// ---- 语料库 v3 索引加载与检索 ----

let corpusV3Index = null
function loadV3Index() {
  if (corpusV3Index) return corpusV3Index
  const indexPath = resolve(__dirname, '../../../data/rag/corpus_index.json')
  if (!existsSync(indexPath)) return null
  const raw = JSON.parse(readFileSync(indexPath, 'utf-8'))
  // Detect v3 vs v1 format
  if (raw.version === '3.0' && raw.entries) {
    corpusV3Index = raw
    return raw
  }
  // Legacy v1 index — wrap into minimal v3 structure
  if (raw.corpus_list) {
    corpusV3Index = { version: '1.0', isLegacy: true, corpus_list: raw.corpus_list }
    return corpusV3Index
  }
  return null
}

/**
 * v3 语料检索：按品类 + 模块 + 受众匹配
 * @returns {{ styleProfile: object|null, layoutProfile: object|null, samples: object[], audienceMatch: string }}
 */
function retrieveV3Corpus(categoryLevel3, moduleKey, audienceTag = '') {
  const index = loadV3Index()
  if (!index) return { styleProfile: null, layoutProfile: null, samples: [], audienceMatch: 'no_corpus' }

  // Legacy v1 fallback
  if (index.isLegacy && index.corpus_list) {
    const refs = (index.corpus_list || [])
      .filter(e => e.category === categoryLevel3 && e.module_id === moduleKey)
      .slice(0, 3)
    return { styleProfile: null, layoutProfile: null, samples: refs.map(r => ({ textPreview: (r.content || '').slice(0, 300), productName: r.note || '', isLegacy: true })), audienceMatch: 'no_corpus', isLegacy: true }
  }

  const catEntry = index.entries?.[categoryLevel3]
  if (!catEntry) {
    // Cross-category cold start: use globalProfile
    const global = index.globalProfile?.moduleDefaults?.[moduleKey]
    return {
      styleProfile: global?.styleDefaults || null,
      layoutProfile: global?.layoutDefaults || null,
      samples: [],
      audienceMatch: 'cross_category_cold_start',
      isCrossCategory: true,
    }
  }

  const modEntry = catEntry.modules?.[moduleKey]
  if (!modEntry || !modEntry.samples || modEntry.samples.length === 0) {
    // Module not in this category — use global defaults
    const global = index.globalProfile?.moduleDefaults?.[moduleKey]
    return {
      styleProfile: global?.styleDefaults || null,
      layoutProfile: global?.layoutDefaults || null,
      samples: [],
      audienceMatch: 'module_cold_start',
    }
  }

  // Match audience
  const normalizedAudience = (audienceTag || '').trim()
  let matchedSamples = modEntry.samples
  let audienceMatch = 'none_specified'
  if (normalizedAudience) {
    const audienceMatched = modEntry.samples.filter(s => {
      const tags = s.audience?.tags || []
      return tags.some(t => normalizedAudience.includes(t) || t.includes(normalizedAudience))
    })
    if (audienceMatched.length > 0) {
      matchedSamples = audienceMatched
      audienceMatch = `matched_${audienceMatched.length}_of_${modEntry.samples.length}`
    } else {
      audienceMatch = `partial_0_of_${modEntry.samples.length}`
    }
  }

  // Get aggregated style + layout from category entry
  const aggStyle = catEntry.aggregatedStyleProfile?.perModule?.[moduleKey]?.aggregatedStyle || null
  const aggLayout = catEntry.aggregatedLayoutBlueprint?.moduleLayouts?.[moduleKey] || null

  return {
    styleProfile: aggStyle,
    layoutProfile: aggLayout,
    samples: matchedSamples.slice(0, 3),
    audienceMatch,
    totalSamples: modEntry.samples.length,
    isCrossCategory: false,
  }
}

// Legacy: kept for backward compat
function loadCorpus() {
  const idx = loadV3Index()
  if (!idx || !idx.isLegacy) return idx
  return idx
}
function retrieveCorpus(subCategory, moduleKey) {
  const idx = loadCorpus()
  if (!idx || !idx.corpus_list) return []
  return idx.corpus_list.filter(e => e.category === subCategory && e.module_id === moduleKey).slice(0, 3)
}


// ============================================================
// V2 语料库图文排版索引
// 扫描 data/corpus/ 下的 v2 格式语料 JSON，提取模块排版模式
// ============================================================

let v2CorpusIndex = null

const MODULE_LABELS = {
  hook: '首屏钩子', price: '价格福利', taste: '口感体验',
  trust: '基础信任', aftercare: '物流售后', tips: '储存贴士',
  cta: '行动召唤', ingredient: '成分科普', origin: '原料溯源',
  brand: '品牌背书', scene: '场景共情', feedback: '用户反馈',
  faq: '常见问题'
}

// 纯文字模块（不应分配图片）
const TEXT_ONLY_MODULES = new Set([
  'aftercare', 'tips', 'cta', 'faq', 'feedback', 'price',
  'rights_list', 'plan_compare', 'validity_rules', 'support_policy'
])

/**
 * 双层兜底路由：suggestedModule → layout_role → 第一个非纯文字模块
 * 跨类目通用，不依赖硬编码的 type 映射
 * @param {object} img — vision 返回的图片对象（含 suggestedModule, layout_role）
 * @param {string[]} selectedModules — 当前已选模块列表
 * @returns {string} 目标模块 key
 */
export function resolveImageModule(img, selectedModules) {
  // 第1层：suggestedModule 有效且在已选模块列表中
  const sug = img.suggestedModule
  if (sug && selectedModules.includes(sug)) return sug

  // 第2层：layout_role → module 映射（跨类目通用）
  const role = img.layout_role || 'detail'
  const ROLE_MODULE_MAP = {
    hero:   ['hook'],
    detail: ['taste', 'texture', 'usage_experience', 'wear_experience', 'design_detail', 'tutorial'],
    scene:  ['scene', 'home_styling', 'kitchen_styling'],
    info:   ['trust', 'ingredient', 'ingredient_analysis', 'specs', 'tech_specs', 'qualification'],
    step:   ['tutorial', 'usage_demo', 'install_guide', 'assembly_guide'],
  }
  const candidates = ROLE_MODULE_MAP[role] || []
  for (const c of candidates) {
    if (selectedModules.includes(c)) return c
  }

  // 终极兜底：第一个非纯文字模块
  for (const m of selectedModules) {
    if (!TEXT_ONLY_MODULES.has(m)) return m
  }

  return selectedModules[0] || 'tips'
}

function loadV2CorpusIndex() {
  if (v2CorpusIndex) return v2CorpusIndex
  const corpusDir = resolve(__dirname, '../../../data/corpus')
  if (!existsSync(corpusDir)) return null
  v2CorpusIndex = { layouts: [], imageSummaries: [], segmentPatterns: [] }
  function scan(dir) {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'images') {
        scan(resolve(dir, e.name))
      } else if (e.name.endsWith('.json')) {
        try {
          const data = JSON.parse(readFileSync(resolve(dir, e.name), 'utf-8'))
          if (data.modules && Array.isArray(data.modules) && data.category) {
            const level3 = data.category.level3 || ''
            for (const mod of data.modules) {
              v2CorpusIndex.layouts.push({
                categoryLevel3: level3, moduleKey: mod.moduleKey,
                layout: mod.layout || null, styleTag: data.styleTag || ''
              })
              // 段落级模式索引（仅多 segment 的模块）
              if (mod.segments && mod.segments.length > 1) {
                v2CorpusIndex.segmentPatterns.push({
                  categoryLevel3: level3,
                  moduleKey: mod.moduleKey,
                  segmentCount: mod.segments.length,
                  imageCount: mod.layout?.imageCount || 0,
                  segments: mod.segments.map(seg => ({
                    hasText: (seg.text || '').trim().length > 0,
                    imageCount: (seg.images || []).length,
                    groupMode: seg.images?.length > 0
                      ? [...new Set(seg.images.map(i => i.group).filter(Boolean))]
                      : [],
                    binding: seg.binding || 'no_image',
                    textType: seg.textType || ''
                  }))
                })
              }
            }
            if (data.images) {
              for (const img of data.images) {
                v2CorpusIndex.imageSummaries.push({
                  categoryLevel3: level3, type: img.primaryType || '',
                  desc: img.desc || '', summary: img.imageContentSummary || null
                })
              }
            }
          }
        } catch { /* skip */ }
      }
    }
  }
  scan(corpusDir)
  return v2CorpusIndex
}

function retrieveCorpusLayout(categoryLevel3, moduleKey) {
  const index = loadV2CorpusIndex()
  if (!index) return null
  const matches = index.layouts.filter(
    l => l.categoryLevel3 === categoryLevel3 && l.moduleKey === moduleKey
  )
  return matches.length > 0 ? matches[0].layout : null
}

/**
 * 检索段落级排版模式（按频率聚类，取 topK）
 */
function retrieveCorpusSegmentPatterns(categoryLevel3, moduleKey, topK = 5) {
  const index = loadV2CorpusIndex()
  if (!index || !index.segmentPatterns) return null

  const matches = index.segmentPatterns
    .filter(p => p.categoryLevel3 === categoryLevel3 && p.moduleKey === moduleKey)

  if (matches.length === 0) return null

  // 聚类：按段落数+图片数分组，统计频率
  const clusters = new Map()
  for (const m of matches) {
    const key = `${m.segmentCount}segs_${m.imageCount}imgs`
    if (!clusters.has(key)) clusters.set(key, { count: 0, pattern: m })
    clusters.get(key).count++
  }

  return [...clusters.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, topK)
    .map(c => c.pattern)
}

// 分析语料写作因子（语料驱动 + 未来个人风格复用同一结构）
function analyzeCorpusFactors(corpusEntries) {
  if (!corpusEntries || corpusEntries.length === 0) return null
  const contents = corpusEntries.map(e => e.content)
  const joined = contents.join('\n')

  // emoji 统计
  const emojiRe = /[\p{Emoji_Presentation}\p{Extended_Pictographic}✂️➗✖️➕➖✳️❇️⭕🅿️🈁🈂️🈚🈷️🈶🈯🉐🈹🈲🈸🈴🈵🈺🉑©®™〰️➰➿⁉️‼️⭕❌⭕❎ℹ️Ⓜ️🅰️🅱️🆎🆑🆒🆓🆔🆕🆖🆗🆘🆙🆚🈁🈂️🈷️🈶🈯🉐🈹🈲🈸🈴🈵🈺🉑]+/gu
  const allEmojis = joined.match(emojiRe) || []
  const emojiCount = allEmojis.length
  const emojiDensity = (emojiCount / joined.replace(/\s/g, '').length * 100).toFixed(1)

  // 段落统计
  const paragraphs = contents.flatMap(c => c.split(/\n+/).filter(p => p.trim()))
  const avgParaLen = Math.round(paragraphs.reduce((s, p) => s + p.replace(/\s/g, '').length, 0) / Math.max(1, paragraphs.length))
  const paraCountPerModule = Math.round(paragraphs.length / contents.length)

  // 句子统计
  const sentences = joined.split(/[。！？!?\n]+/).filter(s => s.trim())
  const avgSentenceLen = Math.round(sentences.reduce((s, sen) => s + sen.replace(/\s/g, '').length, 0) / Math.max(1, sentences.length))

  // 字数统计
  const charCounts = contents.map(c => c.replace(/\s/g, '').length)
  const avgChars = Math.round(charCounts.reduce((a, b) => a + b, 0) / charCounts.length)
  const minChars = Math.min(...charCounts)
  const maxChars = Math.max(...charCounts)

  // 开头方式
  const openings = contents.map(c => c.replace(/[\s\n]+/g, '').slice(0, 15))
  const openingPatterns = [...new Set(openings)]

  // 标点密度
  const exclamationRe = /[！!]/g
  const exclamationCount = (joined.match(exclamationRe) || []).length
  const exclamationDensity = (exclamationCount / Math.max(1, paragraphs.length)).toFixed(1)

  // emoji 位置偏好
  const lines = joined.split('\n').filter(l => l.trim())
  const emojiAtStart = lines.filter(l => emojiRe.test(l.trimStart().slice(0, 2))).length
  const emojiStartRatio = Math.round(emojiAtStart / Math.max(1, lines.length) * 100)

  // 数字使用密度
  const numberRe = /[\d.]+/g
  const numberCount = (joined.match(numberRe) || []).length
  const numberDensity = (numberCount / Math.max(1, paragraphs.length)).toFixed(1)

  return {
    avgChars, minChars, maxChars,
    emojiCount, emojiDensity,
    paraCountPerModule, avgParaLen,
    avgSentenceLen,
    exclamationDensity,
    emojiStartRatio,
    numberDensity,
    openingSample: openingPatterns.slice(0, 3),
    sampleSize: contents.length,
  }
}

/**
 * 构建完整 Prompt
 * @param {object} params
 * @param {string} params.productName - 商品名称
 * @param {string} params.category - 商品类目
 * @param {string} params.sellingPoints - 核心卖点
 * @param {string} params.specs - 规格信息
 * @param {string} params.style - 文案风格 key
 * @param {string[]} params.modules - 需要生成的模块列表
 * @returns {object} { systemPrompt, userPrompt }
 */
export function buildPrompt({ product, modules, focus, images, isDefault }) {
  // 全局系统指令
  const systemParts = [GLOBAL_SYSTEM_PROMPT]

  // 默认风格：语料库驱动（不用固定风格模板）
  if (isDefault) {
    systemParts.push(`## 默认风格指令
这是为你定制的默认风格。你不需要套用任何预设风格模板（不是小红书、不是闺蜜风、不是任何固定风格）。
下方的"语料写作因子分析"是你必须严格遵循的精确写作参数——每个模块的字数、emoji密度、段落结构、开头方式、感叹号频率都已量化。
"语料完整参考"是这些因子的具体示例，帮助你理解这些数字对应什么样的文案质感。
如果没有语料参考的模块，使用朴实口语化中文，像在微信群里给朋友推荐商品。\n`)
  } else {
    // 纯风格：使用预设风格模板
    const stylePrompt = STYLE_PROMPTS[product.style]
    if (stylePrompt) {
      systemParts.push(stylePrompt)
    }
  }

  // 轻量版本侧重提示（不改人设，只提示侧重方向）
  if (focus === 'taste') {
    systemParts.push(`## 版本侧重
本版本重点突出感官体验，放大口感与风味描述模块，做足味觉、嗅觉、质地的细节描写。`)
  }

  // 图片信息注入（双层兜底路由：suggestedModule → layout_role → 非纯文字模块）
  if (images && images.length > 0) {
    // 按模块聚合图片描述
    const moduleImages = {}
    for (const img of images) {
      const target = resolveImageModule(img, modules)
      if (!moduleImages[target]) moduleImages[target] = []
      moduleImages[target].push(img)
    }
    // 注入到 system prompt
    if (Object.keys(moduleImages).length > 0) {
      const imageParts = ['## 图片排版指令']
      imageParts.push('运营已上传商品图片。每张图片已标注布局角色（layout_role）。请根据角色自然地安排图片在文案中的位置：')
      imageParts.push('- hero（主视觉）：放在模块开篇，全宽大图，后跟开篇文案')
      imageParts.push('- detail（细节特写）：适合 2-4 张分组排列，配在对应的细节描述旁边')
      imageParts.push('- scene（生活场景）：独立段落，配在场景描述文字附近')
      imageParts.push('- info（信息图/配料表）：嵌入相关段落，小图展示')
      imageParts.push('- step（步骤图/流程）：横向连排，按步骤顺序放置')
      imageParts.push('\n不要固定"图→文→图→文"节奏。让每张图出现在文案中描述它的那段文字旁边。')
      for (const [mod, imgs] of Object.entries(moduleImages)) {
        // 按 layout_role 分组展示
        const byRole = {}
        imgs.forEach(img => { const role = img.layout_role || 'detail'; if (!byRole[role]) byRole[role] = []; byRole[role].push(img) })
        imageParts.push(`\n### ${mod} 模块（${imgs.length} 张图）`)
        for (const [role, roleImgs] of Object.entries(byRole)) {
          const labels = { hero: '主视觉', detail: '细节特写', scene: '生活场景', info: '信息图', step: '步骤图' }
          imageParts.push(`${labels[role] || role}（${roleImgs.length}张）：`)
          roleImgs.forEach((img, i) => {
            imageParts.push(`  图${imgs.indexOf(img) + 1}：${img.desc || '商品图片'}`)
          })
        }
      }
      imageParts.push('\n每段文案自然衔接它描述的图片，文案中引用图片的视觉细节。')
      systemParts.push(imageParts.join('\n'))
    }
  }


  // ============================================================
  // V2: 注入同类目图文排版模式（段落级优先 → 模块级兜底）
  // ============================================================
  const catLevel3 = product.catLevel3 || ''
  const layoutPrompt = ['## 图文排版参考（语料驱动 — 段落级）']
  layoutPrompt.push('以下是从"' + catLevel3 + '"类目优秀笔记中提取的图文排版模式。请严格参考每段的图片数量和排列方式：')
  layoutPrompt.push('')

  let hasLayout = false
  const densityLabel = { high: '高', medium: '中', low: '低', none: '无' }

  for (const modKey of modules) {
    // 优先尝试段落级模式
    const segPatterns = retrieveCorpusSegmentPatterns(catLevel3, modKey)
    if (segPatterns && segPatterns.length > 0) {
      hasLayout = true
      const modLabel = MODULE_LABELS[modKey] || modKey
      layoutPrompt.push(`### ${modLabel}（${segPatterns.length}种模式）`)

      for (let pi = 0; pi < Math.min(segPatterns.length, 3); pi++) {
        const p = segPatterns[pi]
        layoutPrompt.push(`模式${pi + 1} — ${p.segmentCount}段文字，${p.imageCount}张图：`)
        for (let si = 0; si < p.segments.length; si++) {
          const seg = p.segments[si]
          const typeLabel = seg.textType ? `（${seg.textType}）` : ''
          if (seg.imageCount === 0) {
            layoutPrompt.push(`  - 段${si + 1}${typeLabel}：纯文字，无图`)
          } else {
            const groups = seg.groupMode.length > 0 ? seg.groupMode.join('/') : 'stack'
            const bindingLabel = seg.binding === 'image_before_text' ? '放在文字前' : seg.binding === 'image_after_text' ? '放在文字后' : ''
            layoutPrompt.push(`  - 段${si + 1}${typeLabel}：${seg.imageCount}张图，${groups}排列${bindingLabel ? '，' + bindingLabel : ''}`)
          }
        }
        layoutPrompt.push('')
      }
      if (segPatterns.length > 1) {
        layoutPrompt.push(`请优先采用模式1（出现频率最高）。如图片数量不匹配，选择最接近的模式调整。`)
        layoutPrompt.push('')
      }
    } else {
      // 兜底：模块级模式
      const layout = retrieveCorpusLayout(catLevel3, modKey)
      if (layout && layout.overallPattern && layout.overallPattern !== 'text_only') {
        hasLayout = true
        const patternLabels = {
          image_footer_only: '图片全部放在文案之后',
          image_header_only: '图片全部放在文案之前',
          images_interspersed: '图片穿插在文案之间',
          images_only: '纯图片模块'
        }
        layoutPrompt.push('### ' + (MODULE_LABELS[modKey] || modKey))
        layoutPrompt.push('- 排版方式：' + (patternLabels[layout.overallPattern] || layout.overallPattern))
        layoutPrompt.push('- 图片密度：' + (densityLabel[layout.density] || layout.density) + '（' + layout.imageCount + '张图配' + layout.textSegmentCount + '段文字）')
        layoutPrompt.push('')
      }
    }
  }

  if (hasLayout && !isDefault) {
    systemParts.push('## 图文排版提示\n参考同类目优秀笔记的排版：每个模块的图片统一放在文案之后（image_footer_only），不穿插在文案中。\n')
  } else if (hasLayout) {
    systemParts.push(layoutPrompt.join('\n') + '\n')
  } else {
    // 冷启动：无任何语料，使用 layout_role 默认规则
    systemParts.push('## 图文排版指南（默认规则）\n- hero（主视觉）：放在模块开篇，后跟文字\n- detail（细节特写）：2-4张分组排列，配在对应的细节描述旁边\n- scene（生活场景）：独立段落，配在场景描述文字附近\n- info（信息图）：嵌入相关段落，小图展示\n- step（步骤图）：横向连排，按步骤顺序放置\n')
  }

  // ============================================================
  // V2: 注入当前图片的内容摘要（避免图文冗余）
  // ============================================================
  if (images && images.length > 0) {
    const summaryLines = ['## 图片信息摘要（避免图文信息冗余）']
    summaryLines.push('已上传的图片中已包含以下文字信息。这些内容图片已经替你展示了，文案中请勿重复，转而用文案补充图片未展示的信息：')
    summaryLines.push('')
    
    for (const img of images) {
      if (img.imageContentSummary) {
        const desc = img.desc || '图片'
        const summary = img.imageContentSummary.slice(0, 150)
        summaryLines.push('- ' + desc + '：图中包含 "' + summary + '"')
      }
    }
    
    if (summaryLines.length > 3) {
      systemParts.push(summaryLines.join('\n') + '\n')
    }
  }


  // ---- v3 语料库结构化注入 ----
  const corpusCategory = product.catLevel3 || product.subCategory || '乳制品'
  const audienceTag = product.targetAudience || ''
  const v3Parts = []
  let hasV3Corpus = false

  // Track which modules have style data from corpus
  const moduleStyleData = {}
  const moduleLayoutData = {}
  const moduleSamples = {}

  for (const modKey of modules) {
    const result = retrieveV3Corpus(corpusCategory, modKey, audienceTag)
    if (result.styleProfile || result.layoutProfile || result.samples?.length > 0) {
      hasV3Corpus = true
      moduleStyleData[modKey] = result.styleProfile
      moduleLayoutData[modKey] = result.layoutProfile
      moduleSamples[modKey] = result.samples || []
    }
  }

  if (hasV3Corpus) {
    if (isDefault) {
      // ---- v3 Default Style: structured style profile + layout blueprint + top samples ----

      // Layer 1: Aggregated style profile
      const styleLines = ['## 语料风格画像（同类目语料聚合）']
      const sampleCounts = Object.values(moduleSamples).map(s => s.length)
      const totalSamples = sampleCounts.reduce((a, b) => a + b, 0)
      const matchedModules = Object.keys(moduleStyleData).filter(k => moduleStyleData[k])
      styleLines.push(`覆盖 ${matchedModules.length}/${modules.length} 个模块，共 ${totalSamples} 条语料参考\n`)

      for (const modKey of modules) {
        const sp = moduleStyleData[modKey]
        if (!sp) {
          styleLines.push(`### ${modKey}（无同品类语料，使用通用风格）`)
          continue
        }

        const ep = sp.emojiProfile || {}
        const sen = sp.sentenceProfile || {}
        const pp = sp.punctuationProfile || {}
        const openings = sp.openingPatterns || []
        const closings = sp.closingPatterns || []

        styleLines.push(`### ${modKey}`)
        if (sp.charRange) styleLines.push(`- 字数：${sp.charRange.avg || sp.charCount || '—'}字`)
        if (ep.density !== undefined) styleLines.push(`- Emoji密度：每100字${ep.density}个，偏好${(ep.positionPreference?.lineStart || 0) > 0.5 ? '行首' : '行内'}`)
        if (sen.avgLength) styleLines.push(`- 句长：平均${sen.avgLength}字，短句率${Math.round((sen.shortRatio || 0) * 100)}%`)
        if (pp.exclamationPerParagraph !== undefined) styleLines.push(`- 感叹号：${pp.exclamationPerParagraph}个/段`)
        if (openings.length > 0) styleLines.push(`- 开头方式：${openings.map(o => `${o.type}(${Math.round(o.frequency * 100)}%)`).join(' / ')}`)
        if (closings.length > 0) styleLines.push(`- 收尾方式：${closings.map(c => c.type).join(' / ')}`)
        if (sp.structureType) styleLines.push(`- 结构：${sp.structureType}`)
        styleLines.push('')
      }
      v3Parts.push(styleLines.join('\n'))

      // Layer 2: Layout blueprint
      const layoutLines = ['## 排版蓝图（同类目参考）']
      for (const modKey of modules) {
        const lp = moduleLayoutData[modKey]
        if (!lp) continue
        const seq = lp.patternSequence || []
        const imgs = lp.typicalImageCount?.avg || 0
        if (imgs > 0) {
          const seqDesc = seq.map(s => s === 'text' ? '文' : s === 'images' ? '图' : s).join('→')
          layoutLines.push(`- ${modKey}：${seqDesc}，约${imgs}张图`)
        }
      }
      if (layoutLines.length > 1) {
        v3Parts.push(layoutLines.join('\n'))
      }

      // Layer 3: Best samples (top 2 per module, truncated)
      const sampleLines = ['## 最佳范例（同品类·同模块）']
      let sampleCount = 0
      for (const modKey of modules) {
        const samples = moduleSamples[modKey] || []
        if (samples.length === 0 || sampleCount >= 4) continue // max 4 sample modules
        const best = samples[0]
        if (!best?.textPreview) continue
        sampleLines.push(`### ${modKey}（来源：${best.productName || '语料库'}）`)
        sampleLines.push(best.textPreview)
        if (best.patternSequence?.length > 0) {
          sampleLines.push(`排版序列：${best.patternSequence.map(s => s === 'text' ? '文' : '图').join('→')}`)
        }
        sampleLines.push('')
        sampleCount++
      }
      if (sampleCount > 0) {
        v3Parts.push(sampleLines.join('\n'))
      }

      // Audience instruction (Layer 7)
      const audienceResult = retrieveV3Corpus(corpusCategory, modules[0], audienceTag)
      const audienceNote = audienceResult.audienceMatch || ''
      if (audienceTag) {
        const matchNote = audienceNote.includes('matched') ? '受众匹配' : audienceNote.includes('partial') ? '部分匹配（受众不完全一致）' : '受众未标注'
        v3Parts.push(`\n## 受众匹配\n目标受众：${audienceTag}（${matchNote}）\n请在写作时考虑目标受众的偏好和语言习惯。`)
      }

      systemParts.push(v3Parts.join('\n\n'))
      systemParts.push('\n请严格遵循以上风格参数写作。各模块的字数、emoji密度、句式节奏、开头方式需与画像一致。')

    } else {
      // ---- v3 Named Style: lightweight corpus reference ----
      const refLines = ['## 参考语料（同类目高分笔记，仅参考写作风格和表达方式，具体产品信息以输入为准）']
      for (const modKey of modules) {
        const samples = moduleSamples[modKey] || []
        if (samples.length === 0) continue
        const previews = samples.slice(0, 1).map(s => s.textPreview || '').filter(Boolean)
        if (previews.length > 0) {
          refLines.push(`### ${modKey}\n${previews.map(p => `> ${p.slice(0, 200)}`).join('\n\n')}`)
        }
      }
      if (refLines.length > 1) {
        systemParts.push(refLines.join('\n'))
      }
    }
  } else {
    // ---- No v3 corpus — fallback to legacy ----
    const subCategory = product.subCategory || '调制乳/风味牛奶'
    const subCategoryShort = { dairy: '乳制品', snack: '休闲零食', fresh_fruit: '生鲜水果', grain_oil: '粮油调味', other: '其他' }
    const fallbackCategory = product.catLevel3 || subCategoryShort[subCategory] || subCategory || '乳制品'
    const corpusRefs = []
    const maxLen = isDefault ? 800 : 200
    for (const modKey of modules) {
      const refs = retrieveCorpus(fallbackCategory, modKey)
      if (refs.length > 0) {
        corpusRefs.push(`### ${modKey}\n${refs.map(r => `> ${r.content.slice(0, maxLen)}`).join('\n\n')}`)
      }
    }
    if (corpusRefs.length > 0) {
      if (isDefault) {
        const factorLines = ['## 语料写作因子分析（精确风格参数，严格遵循）']
        for (const modKey of modules) {
          const refs = retrieveCorpus(fallbackCategory, modKey)
          if (refs.length === 0) continue
          const f = analyzeCorpusFactors(refs)
          if (!f) continue
          factorLines.push(`### ${modKey} 模块 · 语料因子（${f.sampleSize}篇参考）`)
          factorLines.push(`| 参数 | 值 |`)
          factorLines.push(`|------|-----|`)
          factorLines.push(`| 字数 | ${f.avgChars}字（${f.minChars}~${f.maxChars}） |`)
          factorLines.push(`| emoji密度 | ${f.emojiDensity}% |`)
          factorLines.push(`| 段落 | ${f.paraCountPerModule}段，均长${f.avgParaLen}字 |`)
          factorLines.push(`| 句长 | ${f.avgSentenceLen}字/句 |`)
          factorLines.push(`| 感叹密度 | ${f.exclamationDensity}个/段 |`)
          factorLines.push(`| 开头示例 | ${f.openingSample.join(' / ')} |`)
          factorLines.push('')
        }
        systemParts.push(factorLines.join('\n'))
        systemParts.push(`## 语料完整参考\n${corpusRefs.join('\n\n')}\n\n请严格遵循上述因子参数写作。`)
      } else {
        systemParts.push(`## 参考语料（同类目高分笔记，仅参考写作风格和表达方式，具体产品信息以输入为准）\n\n${corpusRefs.join('\n\n')}`)
      }
    }
  }

  // 类目分层变量
  const catLevel1 = product.catLevel1 || ''
  const catPrompts = MODULE_CONTENT_REQS[catLevel1]

  // RULES RAG：类目全局规则注入 system prompt 顶部（所有模块共享，最高优先级）
  const globalRules = retrieveGlobalRules(catLevel1)
  if (globalRules.forbidden.length > 0 || globalRules.required.length > 0) {
    const globalBlock = ['## ⚠️ 类目全局规则（所有模块共同遵守，违反将导致输出作废）']
    if (globalRules.required.length > 0) {
      globalBlock.push('\n✅ 本类目所有模块必须：\n' + globalRules.required.map(r => '- ' + r).join('\n'))
    }
    if (globalRules.forbidden.length > 0) {
      globalBlock.push('\n❌ 本类目所有模块禁止：\n' + globalRules.forbidden.map(r => '- ' + r).join('\n'))
    }
    systemParts.unshift(globalBlock.join('\n'))
  }

  let systemPrompt = systemParts.join('\n\n---\n\n')

  // 类目标签映射
  const categoryLabels = {
    dairy: '乳制品', snack: '休闲零食', fresh_fruit: '生鲜水果', grain_oil: '粮油调味', other: '其他',
  }
  const subCategoryLabel = categoryLabels[product.subCategory] || product.subCategory || '食品'

  // 发货时效人性化显示
  const shippingLabels = {
    '24h': '24小时内发货', '48h': '48小时内发货', '72h': '72小时内发货', '7d': '7天内发货',
    'custom': product.customShippingDays ? `${product.customShippingDays}天内发货` : '按约定时间发货',
  }
  const shippingDisplay = shippingLabels[product.shippingTimeliness] || product.shippingTimeliness || '（未提供）'

  // 模块指令 — 按类目分层查找（catLevel1 → __universal__ 兜底），注入 RULES RAG
  const modulePrompts = modules.map(key => {
    const prompt = catPrompts?.[key] || MODULE_CONTENT_REQS.__universal__?.[key] || ''
    if (!prompt) return ''
    // RULES RAG：注入模块级禁止项 & 必须项
    const modRules = retrieveRules(catLevel1 || '', key)
    let extra = ''
    if (modRules.required.length > 0) {
      extra += '\n✅ 本模块必须：\n' + modRules.required.map(r => '- ' + r).join('\n')
    }
    if (modRules.forbidden.length > 0) {
      extra += '\n❌ 本模块禁止：\n' + modRules.forbidden.map(r => '- ' + r).join('\n')
    }
    return prompt + extra
  }).filter(Boolean)

  // 当用户通过粘贴文本提供全部信息时，原始文本为主要来源
  const hasRawText = product.rawProductText && product.rawProductText.trim().length > 0
  const hasFormFields = product.productName && product.productName.trim().length > 0

  let userPrompt

  if (hasRawText && !hasFormFields) {
    // 纯文本模式：原始文本为主要来源，扩展信息有则附加
    const extFields = []
    if (product.groupBuyPrice?.trim()) {
      const qty = product.groupBuyQuantity?.trim() || ''
      const unit = product.groupBuyUnit?.trim() || ''
      const unitStr = unit ? (qty && qty !== '1' ? `/${qty}${unit}` : `/${unit}`) : ''
      extFields.push(`- **开团价：** ¥${product.groupBuyPrice}元${unitStr}（在价格福利模块中必须优先突出开团价${qty && qty !== '1' ? `。注：到手共${qty}${unit}，平均每${unit}约¥${(parseFloat(product.groupBuyPrice) / parseInt(qty)).toFixed(2)}元` : ''}）`)
    }
    if (product.sellingPoints?.trim()) extFields.push(`- **核心卖点：** ${product.sellingPoints}`)
    if (product.targetAudience?.trim()) extFields.push(`- **适用人群：** ${product.targetAudience}`)
    if (product.usageScene?.trim()) extFields.push(`- **使用场景：** ${product.usageScene}`)
    if (product.brandBackground?.trim()) extFields.push(`- **品牌背景：** ${product.brandBackground}`)
    if (product.additionalNotes?.trim()) extFields.push(`- **补充备注：** ${product.additionalNotes}`)
    const extBlock = extFields.length > 0 ? '\n## 运营补充信息\n\n以下信息由运营手动填写，优先级高于原始文本中的同类信息：\n\n' + extFields.join('\n') + '\n' : ''

    userPrompt = `## 商品原始信息

以下是用户粘贴的完整商品资料，包含所有你需要的信息。请仔细阅读，提取商品名称、规格、价格、产地、物流、售后等所有可用信息用于写作。

${product.rawProductText}
${extBlock}
---
${product.catLevel3 ? `注意：该商品属于「${product.catLevel3}」类目。\n\n---\n\n` : ''}## 文案生成任务

请严格基于以上商品信息，依次生成以下模块的文案。禁止编造任何输入中未提供的价格、配料、功效、认证等客观数据。

**写作方式由系统指令中的风格规则决定（严格遵循风格的人设、emoji规则、段落规则、各模块写作规则），下面的模块要求只定义"必须包含哪些信息"。**

${modulePrompts.join('\n\n---\n\n')}

## 输出格式

请严格按照以下格式输出，每个模块用 \`===模块key===\` 标记，模块之间用空行分隔：

${modules.map(k => `===${k}===\n（写${k}模块的文案）`).join('\n\n')}

只输出纯文本文案内容，不要输出额外解释，不要使用任何HTML或标记语言。`
  } else {
    // 表单模式（原有逻辑）
    userPrompt = `## 商品信息

- **商品名称：** ${product.productName || ''}
${product.rawProductText ? `- **商品原始信息（优先参考）：** ${product.rawProductText}` : ""}
- **二级子品类：** ${subCategoryLabel}
- **规格净含量：** ${product.netWeight || '（未提供）'}
- **产地：** ${product.origin || '（未提供）'}
- **生产日期：** ${product.productionDate || '（未提供）'}
- **保质期：** ${product.shelfLifeValue || ''}${product.shelfLifeUnit === 'month' ? '个月' : product.shelfLifeUnit === 'day' ? '天' : product.shelfLifeUnit === 'year' ? '年' : ''}
- **建议售价：** ${product.suggestedPrice ? '¥' + product.suggestedPrice : '（未提供）'}
- **开团价：** ${product.groupBuyPrice ? (() => { const qty = product.groupBuyQuantity?.trim() || ''; const unit = product.groupBuyUnit?.trim() || ''; const unitStr = unit ? (qty && qty !== '1' ? '/' + qty + unit : '/' + unit) : ''; return '¥' + product.groupBuyPrice + '元' + unitStr })() : '（未提供）'}
- **核心卖点：** ${product.sellingPoints || '（未提供）'}
- **核心配料/原料：** ${product.coreIngredients || '（未提供）'}

## 物流售后信息

- **发货地：** ${product.shippingOrigin || '（未提供）'}
- **发货时效：** ${shippingDisplay}
- **快递公司：** ${product.courier || '（未提供）'}
- **补邮费地区：** ${product.extraShippingFeeEnabled ? product.extraShippingFeeAreas : '无'}
- **不发货地区：** ${product.noShippingAreasEnabled ? product.noShippingAreas : '无'}
- **售后规则：** ${product.afterSalesRules || '（未提供）'}

## 扩展信息

- **品牌背景：** ${product.brandBackground || '（未提供）'}
- **适用人群：** ${product.targetAudience || '（未提供）'}
- **使用场景：** ${product.usageScene || '（未提供）'}
- **补充备注：** ${product.additionalNotes || '（未提供）'}

---

## 文案生成任务

请严格基于以上商品信息，依次生成以下模块的文案。禁止编造任何输入中未提供的价格、配料、功效、认证等客观数据。

**写作方式由系统指令中的风格规则决定（严格遵循风格的人设、emoji规则、段落规则、各模块写作规则），下面的模块要求只定义"必须包含哪些信息"。**

${modulePrompts.join('\n\n---\n\n')}

## 输出格式

请严格按照以下格式输出，每个模块用 \`===模块key===\` 标记，模块之间用空行分隔：

${modules.map(k => `===${k}===\n（写${k}模块的文案）`).join('\n\n')}

只输出纯文本文案内容，不要输出额外解释，不要使用任何HTML或标记语言。`
  }

  return { systemPrompt, userPrompt }
}

/**
 * 调用 DeepSeek API（OpenAI 兼容格式）
 * @param {object} params
 * @param {string} params.systemPrompt
 * @param {string} params.userPrompt
 * @returns {Promise<string>} 生成的完整文本
 */
export async function callLLM({ systemPrompt, userPrompt }) {
  const { endpoint, apiKey, model, maxTokens, temperature, timeout } = CONFIG.llm

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`LLM API 返回错误 (${response.status}): ${errorBody}`)
    }

    const data = await response.json()
    return data.choices?.[0]?.message?.content || ''
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * 解析 LLM 返回的多模块文本
 * @param {string} rawText - LLM 原始返回
 * @param {string[]} moduleKeys - 模块 key 列表（按顺序）
 * @returns {object} { moduleKey: content }
 */
export function parseModuleResults(rawText, moduleKeys) {
  const results = {}

  // 按 ===moduleKey=== 分割（修复：正确的正则转义）
  const regex = /===(\w+)===\s*([\s\S]*?)(?=\n===|$)/g
  let match

  while ((match = regex.exec(rawText)) !== null) {
    const key = match[1]
    const content = match[2].trim()
    if (moduleKeys.includes(key)) {
      // 清洗：移除内容中可能嵌套的其他模块标记
      results[key] = cleanContent(content)
    }
  }

  // Fallback：按模块顺序分配
  if (Object.keys(results).length === 0) {
    const blocks = rawText.split('---').map(s => s.trim()).filter(Boolean)
    moduleKeys.forEach((key, i) => {
      if (blocks[i]) {
        results[key] = cleanContent(blocks[i])
      }
    })
  }

  return results
}

/** 清洗内容：移除模块标记、脏字符和HTML标签，还原结构化纯文本 */
function cleanContent(text) {
  return text
    .replace(/---+\s*/g, '')              // 删除 --- 分隔线
    .replace(/\[BR\]/gi, '\n')            // [BR] → 换行
    .replace(/\[BR/gi, '\n')              // 不完整的 [BR → 换行
    .replace(/\[文案\]/g, '')             // 删除 [文案] 占位符
    .replace(/（写\w+模块的文案）/g, '')   // 删除占位提示
    .replace(/链接.{0,6}评论区[^。！？\n，,!?\n]*(?:[。！？\n]|$)/g, '下方可直接参团。')  // 替换"链接在评论区"等话术
    .replace(/评论区见[^。！？\n]*/g, '下方直接参团')     // 替换"评论区见"
    .replace(/进群.{0,10}购买/g, '下方直接购买')          // 替换"进群购买"
    .replace(/扫码.{0,10}购买/g, '点击下方直接购买')       // 替换"扫码购买"
    .replace(/加微信[^。！？\n]*/g, '')                   // 删除"加微信"相关
    .replace(/<br\s*\/?>/gi, '\n')       // <br> → 换行
    .replace(/<\/tr>/gi, '\n')            // 表格行尾 → 换行
    .replace(/<\/td>\s*<td[^>]*>/gi, ' / ') // 表格单元格 → 斜杠分隔
    .replace(/<\/th>\s*<th[^>]*>/gi, ' / ') // 表头单元格 → 斜杠分隔
    .replace(/<[^>]+>/g, '')             // 移除HTML标签
    .replace(/===\w+===/g, '')           // 移除 ===xxx=== 标记
    .replace(/\n{3,}/g, '\n\n')          // 最多连续2个换行
    .trim()
}
