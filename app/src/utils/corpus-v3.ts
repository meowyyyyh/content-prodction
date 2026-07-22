// ============================================================
// 语料库 v3 构建工具
// 从 v2 的纯文本切片升级为结构化学习档案
// 用于 buildCorpusJSON() 导出时生成 v3 schema
// ============================================================

import type { ProductInput, ClassifiedImage, ModuleResult } from '../types'

// ---- 常量 ----

const EMOJI_RE = /[\p{Emoji_Presentation}\p{Extended_Pictographic}✂️➗✖️➕➖✳️❇️⭕🅿️🈁🈂️🈚🈷️🈶🈯🉐🈹🈲🈸🈴🈵🈺🉑©®™〰️➰➿⁉️‼️⭕❌⭕❎ℹ️Ⓜ️🅰️🅱️🆎🆑🆒🆓🆔🆕🆖🆗🆘🆙🆚🈁🈂️🈷️🈶🈯🉐🈹🈲🈸🈴🈵🈺🉑]+/gu

const AUDIENCE_TAG_POOL = [
  '宝妈', '学生', '上班族', '银发族', '健身人群', '母婴',
  '养生', '减脂', '高端消费', '性价比', '儿童', '孕妈',
  '熬夜党', '外卖党', '肠胃敏感', '乳糖不耐', '成分党'
]

const SENSORY_WORDS = ['丝滑', '浓郁', '清爽', 'Q弹', '绵密', '醇厚', '细腻', '酥脆', '软糯', '劲道', '鲜嫩', '多汁', '入口即化', '回味', '清甜', '酸甜', '香浓', '松软', '弹牙', '滑嫩']

const EVIDENCE_KEYWORDS = ['配料表', '营养成分', '检测报告', 'SGS', '认证', '证书', '央视', '溯源', '专家', '推荐', '用户评价', '好评', '回购']

const URGENCY_KEYWORDS = ['限时', '限量', '首发', '抢', '赠品', '加码', '仅', '马上', '赶紧', '手慢无', '错过', '最后']

const OPENING_PATTERNS = [
  { type: 'emoji_claim', re: /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u },
  { type: 'question_hook', re: /^.*?[？?]/ },
  { type: 'scene_paint', re: /^[^！!?？]*?(夏天|冬天|春天|秋天|早上|中午|晚上|下班|周末|假期|出门|在家)/ },
  { type: 'direct_claim', re: /^.{1,30}$/m },
]

const RELATION_TYPE_DEFINITIONS: Record<string, string> = {
  narrative_sequence: '叙事递进：图片按故事线排列',
  comparison: '对比：两张或多张图形成对比关系',
  detail_zoom: '细节放大：后图是前图某部分的放大',
  evidence_chain: '证据链：多图组成逻辑推理链',
  cross_module_bridge: '跨模块桥接：不同模块的图片之间形成呼应',
  atmosphere_stack: '氛围堆叠：多张同风格图叠加营造氛围',
  before_after: '前后对比：使用前vs使用后',
  problem_solution: '问题→解决方案',
}

// ---- 辅助函数 ----

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/<br\s*\/?>/gi, '\n').trim()
}

function stripWhitespace(s: string): string {
  return s.replace(/\s/g, '')
}

function classifyOpening(text: string): string {
  const clean = text.replace(/[\s\n]+/g, '')
  for (const p of OPENING_PATTERNS) {
    if (p.re.test(clean)) return p.type
  }
  return 'direct_claim'
}

function classifyClosing(text: string): string {
  const sentences = text.split(/[。！!？?\n]+/).filter(s => s.trim())
  const last = sentences[sentences.length - 1] || ''
  if (/[￥¥\d]+元/.test(last) || /价格|低至|仅需|只要/.test(last)) return 'price_cta'
  if (/总结|总之|一言蔽之|说真的|真心/.test(last)) return 'benefit_summary'
  if (/快去|赶紧|马上|试试|冲冲|入手/.test(last)) return 'scene_loopback'
  return 'benefit_summary'
}

// ---- 受众标签归一化 ----

function normalizeAudienceTag(raw: string): string[] {
  if (!raw || !raw.trim()) return []
  const t = raw.trim()
  const matched: string[] = []
  for (const tag of AUDIENCE_TAG_POOL) {
    if (t.includes(tag) || tag.includes(t)) matched.push(tag)
  }
  // 模糊匹配
  if (matched.length === 0) {
    if (/宝|妈|娃|孩子|儿童|婴|孕|产/.test(t)) matched.push('宝妈', '母婴')
    if (/学生|大学|考研|考试/.test(t)) matched.push('学生')
    if (/上班|职场|工作|加班|通勤/.test(t)) matched.push('上班族')
    if (/老人|长辈|爸妈|父母|退休/.test(t)) matched.push('银发族')
    if (/健身|运动|减脂|瘦|胖|卡路里/.test(t)) matched.push('健身人群', '减脂')
    if (/养生|保健|中药|滋补/.test(t)) matched.push('养生')
    if (/熬夜|夜猫|失眠/.test(t)) matched.push('熬夜党')
    if (/外卖|外食|方便/.test(t)) matched.push('外卖党')
  }
  return [...new Set(matched)]
}

// ---- 4.9 perModule 专属字段 ----

function extractPerModuleFields(moduleKey: string, text: string) {
  const fields: Record<string, any> = {}

  // taste: sensoryDescriptors
  if (moduleKey === 'taste') {
    const found = SENSORY_WORDS.filter(w => text.includes(w))
    fields.sensoryDescriptors = { words: found, count: found.length, density: (found.length / Math.max(1, stripWhitespace(text).length) * 100).toFixed(1) }
  }

  // trust: evidenceTypes
  if (moduleKey === 'trust') {
    const types: Record<string, boolean> = {}
    if (/配料|成分/.test(text)) types.ingredientTable = true
    if (/证书|认证|SGS|检测/.test(text)) types.certification = true
    if (/央视|溯源/.test(text)) types.sourceTracking = true
    if (/评价|好评|回购|推荐/.test(text)) types.userReview = true
    if (/专家|博士|研究|实验/.test(text)) types.expertEndorsement = true
    fields.evidenceTypes = { types, primaryType: Object.entries(types).find(([,v]) => v)?.[0] || 'ingredientTable' }
  }

  // cta: urgencyTactics
  if (moduleKey === 'cta') {
    const tactics: string[] = []
    if (/限时|截止|倒计时/.test(text)) tactics.push('timeLimit')
    if (/限量|仅\d|只剩|抢光/.test(text)) tactics.push('quantityLimit')
    if (/赠|送|加码|额外/.test(text)) tactics.push('bonusUpsell')
    if (/低至|只要|仅需|￥/.test(text)) tactics.push('priceAnchor')
    fields.urgencyTactics = { tactics, primaryTactic: tactics[0] || 'priceAnchor' }
  }

  // hook: hookTypes
  if (moduleKey === 'hook') {
    fields.hookTypes = {
      openingType: classifyOpening(text),
      hasEmojiLead: EMOJI_RE.test(text.trimStart().slice(0, 5)),
      hasQuestion: /[？?]/.test(text.slice(0, 50)),
    }
  }

  // brand: authoritySources
  if (moduleKey === 'brand') {
    const sources: string[] = []
    if (/SGS|检测|认证/.test(text)) sources.push('sgsCert')
    if (/央视/.test(text)) sources.push('cctvSource')
    if (/专家|博士/.test(text)) sources.push('expertEndorsement')
    if (/数据|研究表明|实验|证明/.test(text)) sources.push('dataCitation')
    if (/第一|领先|首家|唯一/.test(text)) sources.push('marketPosition')
    fields.authoritySources = { sources, count: sources.length }
  }

  // scene: scenarioTypes
  if (moduleKey === 'scene') {
    const scenarios: string[] = []
    if (/办公|上班|公司|办公室|下午茶/.test(text)) scenarios.push('office')
    if (/朋友|聚会|派对|聚餐/.test(text)) scenarios.push('social')
    if (/户外|野餐|露营|旅行|出游/.test(text)) scenarios.push('outdoor')
    if (/在家|独处|一个人|追剧|宅/.test(text)) scenarios.push('solo')
    if (/家庭|一家人|孩子|宝宝/.test(text)) scenarios.push('family')
    fields.scenarioTypes = { scenarios, primaryScenario: scenarios[0] || 'general' }
  }

  return Object.keys(fields).length > 0 ? fields : undefined
}

// ---- 4.1 styleProfile ----

function analyzeModuleStyle(text: string) {
  const clean = stripWhitespace(text)
  const charCount = clean.length
  if (charCount === 0) return null

  // emoji
  const emojis = text.match(EMOJI_RE) || []
  const emojiCount = emojis.length
  const emojiDensity = parseFloat((emojiCount / charCount * 100).toFixed(1))

  // emoji position
  const lines = text.split('\n').filter(l => l.trim())
  let emojiLineStart = 0, emojiInline = 0
  for (const line of lines) {
    if (EMOJI_RE.test(line.trimStart().slice(0, 2))) emojiLineStart++
    else if (EMOJI_RE.test(line)) emojiInline++
  }
  const totalEmojiLines = emojiLineStart + emojiInline || 1

  // top emojis
  const emojiFreq: Record<string, number> = {}
  for (const e of emojis) { emojiFreq[e] = (emojiFreq[e] || 0) + 1 }
  const topEmojis = Object.entries(emojiFreq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([e]) => e)

  // sentences
  const sentences = text.split(/[。！？!?\n]+/).filter(s => s.trim())
  const avgSentenceLen = Math.round(sentences.reduce((s, sen) => s + stripWhitespace(sen).length, 0) / Math.max(1, sentences.length))
  const shortSentences = sentences.filter(s => stripWhitespace(s).length <= 15)
  const longSentences = sentences.filter(s => stripWhitespace(s).length >= 40)
  const shortRatio = parseFloat((shortSentences.length / Math.max(1, sentences.length)).toFixed(2))
  const longRatio = parseFloat((longSentences.length / Math.max(1, sentences.length)).toFixed(2))

  // paragraphs
  const paragraphs = text.split(/\n{2,}/).filter(p => p.trim())
  const paraCount = paragraphs.length

  // punctuation
  const exclamationCount = (text.match(/[！!]/g) || []).length
  const questionCount = (text.match(/[？?]/g) || []).length
  const exclamationPerPara = parseFloat((exclamationCount / Math.max(1, paraCount)).toFixed(1))
  const questionPerPara = parseFloat((questionCount / Math.max(1, paraCount)).toFixed(1))

  // opening / closing
  const openingType = classifyOpening(text)
  const closingType = classifyClosing(text)
  const openingFirstSentence = sentences[0]?.slice(0, 50) || ''
  const closingLastSentence = sentences[sentences.length - 1]?.slice(0, 50) || ''

  // numbers
  const numberCount = (text.match(/[\d.]+/g) || []).length
  const numberDensity = parseFloat((numberCount / Math.max(1, paraCount)).toFixed(1))

  // transition words
  const transitionCandidates = ['而且', '更关键的是', '重点是', '说白了就是', '你想想', '更棒的是', '关键是', '更重要的是', '换句话说', '简单来说']
  const transitionWords = transitionCandidates.filter(w => text.includes(w))

  // key phrases: extract bracketed/starred phrases or emoji-led claims
  const keyPhrases: string[] = []
  const bracketMatch = text.match(/【(.+?)】/g)
  if (bracketMatch) keyPhrases.push(...bracketMatch.map(m => m.replace(/[【】]/g, '')))
  const emojiLines = lines.filter(l => EMOJI_RE.test(l.trimStart().slice(0, 2)))
  keyPhrases.push(...emojiLines.slice(0, 3).map(l => l.trim().slice(0, 30)))

  return {
    charCount, sentenceCount: sentences.length,
    avgSentenceLen, shortRatio, longRatio,
    emojiCount, topEmojis,
    emojiProfile: {
      density: emojiDensity,
      positionPreference: {
        lineStart: parseFloat((emojiLineStart / totalEmojiLines).toFixed(2)),
        inline: parseFloat((emojiInline / totalEmojiLines).toFixed(2)),
        lineEnd: 0,
      },
      topEmojis,
      densityDesc: `每100字约${emojiDensity}个emoji`,
    },
    sentenceProfile: {
      avgLength: avgSentenceLen,
      shortRatio, longRatio,
      rhythmPattern: shortRatio > 0.35 ? '短-长-短' : '均衡',
    },
    punctuationProfile: { exclamationPerParagraph: exclamationPerPara, questionPerParagraph: questionPerPara },
    openingType, openingFirstSentence,
    closingType, closingLastSentence,
    transitionWords,
    keyPhrases: [...new Set(keyPhrases)].slice(0, 5),
    numberDensity,
    structureType: paraCount <= 1 ? '单段式' : paraCount <= 3 ? '短段落式' : '多段递进式',
    structureDesc: '',
  }
}

function analyzeGlobalStyle(moduleStyles: Map<string, ReturnType<typeof analyzeModuleStyle>>) {
  const allStyles = [...moduleStyles.values()].filter(Boolean) as NonNullable<ReturnType<typeof analyzeModuleStyle>>[]
  if (allStyles.length === 0) return null

  const totalChars = allStyles.reduce((s, m) => s + m.charCount, 0)
  const totalEmojis = allStyles.reduce((s, m) => s + m.emojiCount, 0)
  const totalSentences = allStyles.reduce((s, m) => s + m.sentenceCount, 0)
  const avgSentenceLen = Math.round(allStyles.reduce((s, m) => s + m.avgSentenceLen, 0) / allStyles.length)

  const pacing = totalChars < 3000 ? 'fast' : totalChars < 8000 ? 'medium' : 'slow'

  // Opening pattern distribution
  const openingDist: Record<string, number> = {}
  for (const m of allStyles) { openingDist[m.openingType] = (openingDist[m.openingType] || 0) + 1 }
  const total = allStyles.length

  return {
    totalChars, totalModules: allStyles.length, totalSentences,
    pacing,
    pacingDesc: pacing === 'fast' ? '快节奏（模块短小、图片密集）' : pacing === 'medium' ? '中节奏（图文均衡）' : '慢节奏（长文为主）',
    avgSentenceLen,
    emojiDensity: parseFloat((totalEmojis / Math.max(1, totalChars) * 100).toFixed(1)),
    openingDistribution: Object.entries(openingDist).map(([type, count]) => ({ type, frequency: parseFloat((count / total).toFixed(2)) })),
  }
}

// ---- 4.2 layoutBlueprint ----

function extractLayoutBlueprint(
  displayOrder: string[],
  moduleImagesMap: Map<string, ClassifiedImage[]>,
  moduleStyles: Map<string, ReturnType<typeof analyzeModuleStyle>>,
  classifiedImages: ClassifiedImage[],
) {
  const totalImages = classifiedImages.length
  const totalTextChars = [...moduleStyles.values()].reduce((s, m) => s + (m?.charCount || 0), 0)
  const imageToTextRatio = parseFloat((totalImages / Math.max(1, totalTextChars / 100)).toFixed(2))

  // Image density curve
  const totalMods = displayOrder.length
  const frontCount = Math.ceil(totalMods * 0.3)
  const frontImages = displayOrder.slice(0, frontCount).reduce((s, k) => s + (moduleImagesMap.get(k)?.length || 0), 0)
  const frontRatio = totalImages > 0 ? frontImages / totalImages : 0
  const densityCurve = frontRatio > 0.5 ? 'front_heavy' : frontRatio < 0.2 ? 'back_heavy' : 'balanced'

  // Per-module layouts
  const moduleLayouts: Record<string, any> = {}
  for (const key of displayOrder) {
    const imgs = moduleImagesMap.get(key) || []
    const style = moduleStyles.get(key)
    const imgCount = imgs.length
    const textLen = style?.charCount || 0
    const segCount = textLen > 0 ? Math.max(1, Math.ceil(textLen / 200)) : (imgCount > 0 ? 1 : 0)

    // Pattern
    let pattern: string, patternSequence: string[]
    if (!textLen && imgCount > 0) { pattern = 'images_only'; patternSequence = ['images'] }
    else if (textLen && imgCount === 0) { pattern = 'text_only'; patternSequence = ['text'] }
    else if (segCount <= 1) { pattern = 'image_before_text'; patternSequence = ['images', 'text'] }
    else { pattern = 'images_interspersed'; patternSequence = ['text', 'images', 'text'] }

    // Image grouping
    const groups: { groupType: string; count: number; desc: string }[] = []
    if (imgCount > 0) {
      if (imgCount <= 2) groups.push({ groupType: 'pair', count: imgCount, desc: '图文配对' })
      else if (imgCount <= 6) groups.push({ groupType: 'stack', count: imgCount, desc: '小堆叠展示' })
      else { groups.push({ groupType: 'stack', count: Math.ceil(imgCount / 2), desc: '多角度堆叠' }); if (imgCount > 8) groups.push({ groupType: 'grid', count: Math.floor(imgCount / 2), desc: '网格展示' }) }
    }

    moduleLayouts[key] = {
      typicalPattern: pattern,
      patternSequence,
      typicalImageCount: imgCount > 0 ? { min: Math.max(1, imgCount - 2), max: imgCount + 2, avg: imgCount } : { min: 0, max: 0, avg: 0 },
      typicalSegmentCount: { min: Math.max(1, segCount - 1), max: segCount + 1, avg: segCount },
      imageGroupingPerSegment: groups,
    }
  }

  // Document pacing
  const docPacing: Record<string, any> = {}
  const third = Math.ceil(totalMods / 3)
  const seg1Mods = displayOrder.slice(0, third)
  const seg2Mods = displayOrder.slice(third, third * 2)
  const seg3Mods = displayOrder.slice(third * 2)
  const seg1Imgs = seg1Mods.reduce((s, k) => s + (moduleImagesMap.get(k)?.length || 0), 0)
  const seg2ModsImgs = seg2Mods.reduce((s, k) => s + (moduleImagesMap.get(k)?.length || 0), 0)
  const seg3ModsImgs = seg3Mods.reduce((s, k) => s + (moduleImagesMap.get(k)?.length || 0), 0)
  const seg1Chars = seg1Mods.reduce((s, k) => s + (moduleStyles.get(k)?.charCount || 0), 0)
  const seg2Chars = seg2Mods.reduce((s, k) => s + (moduleStyles.get(k)?.charCount || 0), 0)
  const seg3Chars = seg3Mods.reduce((s, k) => s + (moduleStyles.get(k)?.charCount || 0), 0)

  docPacing.segment1_open = { modules: seg1Mods, style: seg1Imgs > seg2ModsImgs ? '密集轰炸' : '正常开场', imagesPer100chars: parseFloat((seg1Imgs / Math.max(1, seg1Chars / 100)).toFixed(1)) }
  docPacing.segment2_body = { modules: seg2Mods, style: '图文交替', imagesPer100chars: parseFloat((seg2ModsImgs / Math.max(1, seg2Chars / 100)).toFixed(1)) }
  docPacing.segment3_close = { modules: seg3Mods, style: '文主图辅', imagesPer100chars: parseFloat((seg3ModsImgs / Math.max(1, seg3Chars / 100)).toFixed(1)) }

  return {
    overallStructure: {
      moduleCount: totalMods,
      moduleOrder: displayOrder,
      totalImages, totalTextChars, imageToTextRatio,
      imageDensityCurve: densityCurve,
      curveDesc: densityCurve === 'front_heavy' ? '前段集中大量图片，中后段密度递减' : densityCurve === 'balanced' ? '图片均匀分布' : '后段图片密集',
      documentPacing: docPacing,
    },
    moduleLayouts,
  }
}

// ---- 4.5 imageRelations (启发式规则) ----

function computeImageRelations(
  displayOrder: string[],
  moduleImagesMap: Map<string, ClassifiedImage[]>,
  classifiedImages: ClassifiedImage[],
) {
  const relations: any[] = []
  let relId = 1

  for (const key of displayOrder) {
    const imgs = moduleImagesMap.get(key) || []
    if (imgs.length < 2) continue

    const imgIndices = imgs.map(img => classifiedImages.findIndex(ci => ci.id === img.id) + 1)
    const imgDescs = imgs.map(img => img.desc || img.imageContentSummary || '')

    // Sequential images in same module → narrative_sequence
    const relation: any = {
      id: `rel_${String(relId).padStart(3, '0')}`,
      type: imgIndices.length === 2 ? 'comparison' : 'narrative_sequence',
      typeDesc: RELATION_TYPE_DEFINITIONS[imgIndices.length === 2 ? 'comparison' : 'narrative_sequence'],
      images: imgIndices,
      module: key,
      inferred: 'heuristic',
      confidence: imgIndices.length <= 4 ? 'medium' : 'low',
    }

    // Build simple relation matrix for adjacent pairs
    if (imgIndices.length >= 2) {
      const matrix: Record<string, { relation: string; desc: string }> = {}
      for (let j = 0; j < imgIndices.length - 1; j++) {
        const a = imgIndices[j], b = imgIndices[j + 1]
        const descA = imgDescs[j] || '', descB = imgDescs[j + 1] || ''
        const commonWords = descA.split(/[,，;；]/).filter((w: string) => w.trim() && descB.includes(w.trim()))
        matrix[`${a}_to_${b}`] = {
          relation: commonWords.length > 0 ? 'context_add' : 'angle_change',
          desc: commonWords.length > 0 ? `关联词: ${commonWords.slice(0, 2).join(',')}` : '连续展示',
        }
      }
      relation.relationMatrix = matrix
    }

    if (imgIndices.length >= 3) {
      relation.flowDirection = '全景→中景→特写'
      relation.visualRhythm = '全景建立认知→中景展示特征→特写强化细节'
    }

    relations.push(relation)
    relId++
  }

  // Cross-module bridges: same brand in adjacent modules
  for (let i = 0; i < displayOrder.length - 1; i++) {
    const modA = displayOrder[i], modB = displayOrder[i + 1]
    const imgsA = moduleImagesMap.get(modA) || [], imgsB = moduleImagesMap.get(modB) || []
    if (imgsA.length === 0 || imgsB.length === 0) continue

    // Check for shared content (brand, product name) in image summaries
    const summariesA = imgsA.map(img => img.imageContentSummary || '').filter(Boolean)
    const summariesB = imgsB.map(img => img.imageContentSummary || '').filter(Boolean)
    let shared = false
    for (const sa of summariesA) {
      for (const sb of summariesB) {
        const wordsA = new Set(sa.split(/[,，;；\s]+/).filter((w: string) => w.length >= 2))
        const wordsB = sb.split(/[,，;；\s]+/).filter((w: string) => w.length >= 2)
        const intersection = [...wordsA].filter(w => wordsB.has(w))
        if (intersection.length >= 2) { shared = true; break }
      }
      if (shared) break
    }

    if (shared) {
      relations.push({
        id: `rel_${String(relId).padStart(3, '0')}`,
        type: 'cross_module_bridge',
        typeDesc: RELATION_TYPE_DEFINITIONS.cross_module_bridge,
        images: [
          classifiedImages.findIndex(ci => ci.id === imgsA[imgsA.length - 1].id) + 1,
          classifiedImages.findIndex(ci => ci.id === imgsB[0].id) + 1,
        ],
        fromModule: modA, toModule: modB,
        inferred: 'heuristic',
        confidence: 'medium',
        description: `${modA} 模块最后一张图 → ${modB} 模块第一张图，内容存在关联`,
      })
      relId++
    }
  }

  return { relations, relationTypeDefinitions: RELATION_TYPE_DEFINITIONS }
}

// ---- 4.6 crossModuleLinks ----

function extractCrossModuleLinks(displayOrder: string[], moduleStyles: Map<string, ReturnType<typeof analyzeModuleStyle>>) {
  const links: any[] = []
  for (let i = 0; i < displayOrder.length - 1; i++) {
    const from = displayOrder[i], to = displayOrder[i + 1]
    const fromStyle = moduleStyles.get(from), toStyle = moduleStyles.get(to)
    if (!fromStyle || !toStyle) continue

    // Heuristic: hook→price = escalation, taste→trust = deepening, ingredient→brand = authority_chain
    let linkType = 'natural_flow'
    if (from === 'hook' && to === 'price') linkType = 'escalation'
    else if (from === 'taste' && to === 'trust') linkType = 'deepening'
    else if (from === 'ingredient' && to === 'brand') linkType = 'authority_chain'
    else if (from === 'hook' && to === 'taste') linkType = 'experience_bridge'

    links.push({
      fromModule: from, toModule: to, linkType,
      desc: '',
      textBridging: fromStyle.closingLastSentence ? `${from} 末尾'${fromStyle.closingLastSentence.slice(0, 30)}' 自然过渡到 ${to}` : '',
      inferred: 'heuristic',
    })
  }

  // orderRationale (4.16)
  const orderRationale: Record<string, string> = {}
  if (displayOrder[0]) orderRationale[`${displayOrder[0]}_first`] = '3秒内抓住注意力，建立产品第一印象'
  for (let i = 0; i < displayOrder.length - 1; i++) {
    const from = displayOrder[i], to = displayOrder[i + 1]
    const link = links.find(l => l.fromModule === from && l.toModule === to)
    if (link?.linkType === 'escalation') orderRationale[`${to}_after_${from}`] = '欲望建立后用价格引爆购买冲动'
    else if (link?.linkType === 'deepening') orderRationale[`${to}_after_${from}`] = '感官好感建立后用理性信息深化信任'
    else orderRationale[`${to}_after_${from}`] = '自然阅读流'
  }

  return { links, orderRationale }
}

// ---- 4.7 audienceContext ----

function buildAudienceContext(input: ProductInput) {
  const rawAudience = input.targetAudience || ''
  const tags = normalizeAudienceTag(rawAudience)

  // Generate natural language instruction (4.12)
  let audienceInstruction = ''
  if (tags.length > 0) {
    const tagStr = tags.join('、')
    audienceInstruction = `这篇文案的目标读者是${tagStr}人群。`
    if (tags.includes('宝妈') || tags.includes('母婴')) audienceInstruction += '在写作时：强调安全性、营养价值、适合孩子、方便省心。避免使用过于激进或暗示性强的表达。'
    else if (tags.includes('上班族')) audienceInstruction += '在写作时：强调方便快捷、性价比高、适合办公室场景。用"打工人必备""办公室好物"等接地气的表达。'
    else if (tags.includes('学生')) audienceInstruction += '在写作时：强调价格友好、社交属性、新鲜有趣。用活泼、年轻化的语言风格。'
    else if (tags.includes('减脂') || tags.includes('健身人群')) audienceInstruction += '在写作时：强调低卡、高蛋白、健康配料。避免过度强调"美味""上瘾"等与健康目标冲突的表达。'
    else audienceInstruction += '在写作时：用平实但有温度的语言，像一个懂产品的朋友在推荐。'
  } else {
    audienceInstruction = '用平实但有温度的语言写作，像一个懂产品、会聊天的朋友在推荐好东西。'
  }

  return {
    primaryAudience: {
      demographic: rawAudience || '未指定',
      tags,
      psychographic: '',
      painPoints: [] as string[],
      readingScenario: '刷小红书/朋友圈时快速浏览',
    },
    platform: {
      name: '小红书',
      contentFormat: '图文笔记',
      typicalReadingTime: '30-60秒',
    },
    campaignContext: {
      type: input.style === 'default' ? '日常种草' : '新品推广',
      season: '',
    },
    audienceInstruction,
  }
}

// ---- 主入口 ----

export interface V3CorpusInput {
  input: ProductInput
  classifiedImages: ClassifiedImage[]
  centerModules: ModuleResult[]
  displayOrder: string[]
  fileMap: Map<string, File>
}

export interface V3CorpusOutput {
  corpus: any
  images: { id: string; base64: string; fileName: string }[]
}

/**
 * 构建 v3 语料 JSON
 * 在 buildCorpusJSON() 导出时调用，输出 v3 schema 的完整学习档案
 */
export function buildCorpusV3({ input, classifiedImages, centerModules, displayOrder, fileMap }: V3CorpusInput): V3CorpusOutput {
  const getExt = (f: File | undefined) => f ? (f.name.includes('.') ? f.name.split('.').pop() || 'jpg' : 'jpg') : 'jpg'

  const corpus: any = {
    version: '3.0',
    schema: 'corpus-学习增强-v3',
    productName: input.productName,
    category: { level1: input.catLevel1, level2: input.catLevel2, level3: input.catLevel3 },
    styleTag: (input.versionStyles && input.versionStyles[0]) || input.style || 'xiaohongshu',
    imageCount: classifiedImages.length,
    source: '预审库自动收集',
    convertedAt: new Date().toISOString(),
    modules: [] as any[],
    images: [] as any[],
    styleProfile: null as any,
    layoutBlueprint: null as any,
    imageRelations: null as any,
    crossModuleLinks: null as any,
    audienceContext: null as any,
    feedbackSignals: { status: 'none', note: '暂无反馈数据' },
  }

  // ---- images[] ----
  const imageFiles: { id: string; base64: string; fileName: string }[] = []
  let imgIdx = 1
  corpus.images = classifiedImages.map((img) => {
    const f = fileMap.get(img.id)
    const ext = getExt(f)
    const fileName = `image${String(imgIdx).padStart(3, '0')}.${ext}`
    imgIdx++
    imageFiles.push({ id: img.id, base64: img.preview?.replace(/^data:image\/\w+;base64,/, '') || '', fileName })

    // Enhanced image structure (4.4)
    const contentSummary = img.imageContentSummary || ''
    const entities = extractEntities(contentSummary)

    return {
      id: imgIdx - 1,
      file: `images/${fileName}`,
      module: (img as any).suggestedModule || '',
      suggestedModule: (img as any).suggestedModule || '',
      desc: img.desc || '',
      layout_role: img.layout_role || 'detail',
      contentAnalysis: {
        summary: contentSummary,
        ocrText: (img as any).imageOcrText || '',
        extractedEntities: entities,
        visualElements: [] as string[],
        textDensity: contentSummary.length > 200 ? 'high' : contentSummary.length > 50 ? 'medium' : 'low',
        composition: img.layout_role === 'hero' ? 'product_centered' : 'standard',
      },
      narrativeRole: {
        isKeyVisual: img.layout_role === 'hero',
        importanceInDoc: img.layout_role === 'hero' ? 'critical' : 'supporting',
        storyPosition: 'supporting',
        emotionalFunction: 'information',
        informationLevel: img.layout_role === 'hero' ? 'overview' : 'detail',
      },
      contextInDocument: {
        positionInModule: 0,
        positionDesc: '',
        associatedTextPhrases: [] as string[],
      },
      imageQuality: {
        level: 'standard',
        suggestedUsage: img.layout_role === 'hero' ? 'hero_image' : 'inline',
        suggestedUsageDesc: img.layout_role === 'hero' ? '适合做大图主视觉' : '适合小尺寸嵌入',
      },
    }
  })

  // ---- modules[] with writingProfile + enhanced layout ----
  const moduleImagesMap = new Map<string, ClassifiedImage[]>()
  const moduleStyles = new Map<string, ReturnType<typeof analyzeModuleStyle>>()

  // Assign images to modules (reuse existing logic)
  const moduleImages = assignImagesV3(classifiedImages, displayOrder)

  for (const key of displayOrder) {
    const cm = centerModules.find(m => m.moduleKey === key)
    const imgs = moduleImages.get(key) || []
    const text = cm ? stripHtml(cm.content) : ''
    const imgCount = imgs.length
    moduleImagesMap.set(key, imgs)

    // Writing profile
    const writingProfile = analyzeModuleStyle(text)
    if (writingProfile) {
      writingProfile.structureDesc = buildStructureDesc(text, imgCount)
      moduleStyles.set(key, writingProfile)
    }

    // Per-module specialized fields
    const specializedFields = extractPerModuleFields(key, text)

    // Segments with enhanced image binding
    const paragraphs = text ? text.split(/\n{2,}/).filter(p => p.trim()) : []
    const segCount = paragraphs.length || 1

    // Distribute images across paragraphs
    const segImagesList: ClassifiedImage[][] = []
    if (imgs.length > 0 && paragraphs.length > 0) {
      const paraLens = paragraphs.map(p => stripWhitespace(p).length)
      const totalLen = paraLens.reduce((a, b) => a + b, 0) || 1
      let cursor = 0
      for (let i = 0; i < paragraphs.length; i++) {
        const ratio = paraLens[i] / totalLen
        const count = i === paragraphs.length - 1 ? imgs.length - cursor : Math.max(0, Math.round(imgs.length * ratio))
        segImagesList.push(imgs.slice(cursor, cursor + count))
        cursor += count
      }
      if (cursor < imgs.length) segImagesList[segImagesList.length - 1].push(...imgs.slice(cursor))
    } else if (imgs.length > 0) {
      segImagesList.push([...imgs])
    } else {
      for (let i = 0; i < segCount; i++) segImagesList.push([])
    }

    const segments = paragraphs.map((para, i) => {
      const segImgs = segImagesList[i] || []
      const mapped = segImgs.map(img => ({
        imgId: classifiedImages.findIndex(ci => ci.id === img.id) + 1,
        group: segImgs.length === 2 ? 'pair' as const : 'stack' as const,
        groupPosition: segImgs.indexOf(img),
        role: img.desc || `图${i + 1}`,
        position: 'before_text' as const,
        positionPrecision: `segment_${i}_before_text` as const,
        relationship: img.imageContentSummary || '',
        illustratesWhat: img.desc || '',
        textPhrasesSupported: extractPhraseMatches(para, img.imageContentSummary || ''),
      }))
      const textType = i === 0 ? `${key}_intro` : i === paragraphs.length - 1 ? `${key}_summary` : `${key}_detail`
      return {
        index: i, text: para, textType, charCount: stripWhitespace(para).length,
        sentenceCount: para.split(/[。！？!?]+/).filter(s => s.trim()).length,
        function: i === 0 ? '开篇引入' : i === paragraphs.length - 1 ? '总结收尾' : '主体展开',
        images: mapped,
        binding: mapped.length > 0 ? 'image_before_text' as const : 'no_image' as const,
        bindingStrength: mapped.length > 0 ? 'strong' as const : undefined,
        bindingDesc: mapped.length > 0 ? '图片直接展示文字相关内容' : undefined,
      }
    })

    // Pattern
    const density = imgCount === 0 ? 'none' : imgCount <= 2 ? 'low' : imgCount <= 8 ? 'medium' : 'high'
    const pattern = text && imgCount > 0 ? (segCount > 1 ? 'images_interspersed' : 'image_before_text') : text ? 'text_only' : imgCount > 0 ? 'images_only' : 'text_only'
    const patternSequence = pattern === 'images_interspersed' ? ['text', 'images', 'text'] : pattern === 'image_before_text' ? ['images', 'text'] : pattern === 'images_only' ? ['images'] : ['text']

    // Image groups
    const imageGroups: Record<string, any> = {}
    if (imgCount > 0) {
      const allImgIds = segments.flatMap(s => s.images.map((si: any) => si.imgId))
      imageGroups.group1 = { imgIds: allImgIds, groupType: imgCount <= 2 ? 'pair' : 'stack', layoutHint: 'vertical_scroll', narrativeFunction: `${cm?.moduleLabel || key}配图` }
    }

    const mod: any = {
      moduleKey: key, moduleName: cm?.moduleLabel || key, order: 0,
      layout: { overallPattern: pattern, patternSequence, imageCount: imgCount, textSegmentCount: segCount, density, imageDistribution: segImagesList.map(s => s.length), imageGroupingPerSegment: segImagesList.map(s => s.length > 0 ? (s.length <= 2 ? 'pair' : 'stack') : null).filter(Boolean) },
      writingProfile: writingProfile ? { ...writingProfile, ...(specializedFields || {}) } : undefined,
      segments,
      imageGroups,
    }
    corpus.modules.push(mod)
  }

  // Re-number modules
  corpus.modules.forEach((m: any, i: number) => { m.order = i + 1 })

  // ---- styleProfile (4.1) ----
  const globalStyle = analyzeGlobalStyle(moduleStyles)
  const perModule: Record<string, any> = {}
  const crossModuleVariance: Record<string, any> = {}
  for (const [key, style] of moduleStyles) {
    if (!style) continue
    perModule[key] = {
      charRange: { min: style.charCount, max: style.charCount, avg: style.charCount },
      emojiProfile: style.emojiProfile,
      sentenceProfile: style.sentenceProfile,
      punctuationProfile: style.punctuationProfile,
      openingPatterns: [{ type: style.openingType, frequency: 1.0, example: style.openingFirstSentence }],
      closingPatterns: [{ type: style.closingType, frequency: 1.0 }],
      transitionWords: style.transitionWords,
      keyPhrasePatterns: style.keyPhrases.map(p => ({ pattern: 'extracted', example: p })),
      numberFormatting: {},
    }
    crossModuleVariance[key] = {
      tone: style.emojiProfile.density > 0.5 ? '活泼有力' : style.charCount > 400 ? '专业详尽' : '亲和简洁',
      emojiDensity: style.emojiProfile.density > 0.5 ? 'high' : style.emojiProfile.density > 0.2 ? 'medium' : 'low',
    }
  }

  corpus.styleProfile = {
    sampleInfo: {
      totalChars: globalStyle?.totalChars || 0,
      totalModules: globalStyle?.totalModules || 0,
      totalImages: classifiedImages.length,
      totalParagraphs: [...moduleStyles.values()].reduce((s, m) => s + (m?.sentenceCount || 0), 0),
    },
    globalPatterns: {
      pacing: globalStyle?.pacing || 'medium',
      pacingDesc: globalStyle?.pacingDesc || '',
      overallTone: { primaryTone: '亲切活泼', secondaryTone: '专业可信', personaDesc: '像一个懂产品、会聊天的朋友在推荐好东西' },
    },
    perModule,
    crossModulePatterns: { styleVariance: crossModuleVariance, moduleConnectionPatterns: [] },
    createdAt: new Date().toISOString(),
  }

  // ---- layoutBlueprint (4.2) ----
  corpus.layoutBlueprint = extractLayoutBlueprint(displayOrder, moduleImagesMap, moduleStyles, classifiedImages)

  // ---- imageRelations (4.5) ----
  corpus.imageRelations = computeImageRelations(displayOrder, moduleImagesMap, classifiedImages)

  // ---- crossModuleLinks (4.6 + 4.16) ----
  const crossMod = extractCrossModuleLinks(displayOrder, moduleStyles)
  corpus.crossModuleLinks = { links: crossMod.links, orderRationale: crossMod.orderRationale }

  // ---- audienceContext (4.7 + 4.12) ----
  corpus.audienceContext = buildAudienceContext(input)

  return { corpus, images: imageFiles }
}

// ---- helpers ----

function assignImagesV3(classifiedImages: ClassifiedImage[], displayOrder: string[]): Map<string, ClassifiedImage[]> {
  const map = new Map<string, ClassifiedImage[]>()
  for (const img of classifiedImages) {
    const target = (img as any).suggestedModule || displayOrder[0] || 'hook'
    if (!map.has(target)) map.set(target, [])
    map.get(target)!.push(img)
  }
  return map
}

function extractEntities(summary: string): Record<string, any> {
  const entities: Record<string, any> = {}
  const brandMatch = summary.match(/品牌[：:]\s*(.+?)[,;；，\s]/)
  if (brandMatch) entities.brand = brandMatch[1].trim()
  const productMatch = summary.match(/商品名称[：:]\s*(.+?)[,;；，\s]/)
  if (productMatch) entities.productName = productMatch[1].trim()
  const numbers = summary.match(/[\d.]+/g) || []
  if (numbers.length > 0) entities.numbers = [...new Set(numbers)].slice(0, 10)
  return entities
}

function extractPhraseMatches(text: string, summary: string): string[] {
  const phrases: string[] = []
  const words = summary.split(/[,，;；\s]+/).filter(w => w.length >= 3)
  for (const w of words.slice(0, 10)) {
    if (text.includes(w)) phrases.push(w)
  }
  return [...new Set(phrases)].slice(0, 5)
}

function buildStructureDesc(text: string, imgCount: number): string {
  const paragraphs = text.split(/\n{2,}/).filter(p => p.trim())
  if (paragraphs.length <= 1) return imgCount > 0 ? '图文配对式' : '单段陈述式'
  if (paragraphs.length <= 3) return imgCount > 0 ? '图文交替式' : '短段落递进式'
  return '多段递进式'
}
