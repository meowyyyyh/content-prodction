// ============================================================
// 语料库 v2 → v3 迁移脚本
// 扫描 data/corpus/ 下所有 v2 JSON，升级为 v3 schema
// 用法：node scripts/migrate-v2-to-v3.cjs [--dry-run]
// ============================================================

const fs = require('fs')
const path = require('path')

const CORPUS_DIR = path.join(__dirname, '..', 'data', 'corpus')
const DRY_RUN = process.argv.includes('--dry-run')

const EMOJI_RE = /[\p{Emoji_Presentation}\p{Extended_Pictographic}✂️➗✖️➕➖✳️❇️⭕🅿️🈁🈂️🈚🈷️🈶🈯🉐🈹🈲🈸🈴🈵🈺🉑©®™〰️➰➿⁉️‼️⭕❌⭕❎ℹ️Ⓜ️🅰️🅱️🆎🆑🆒🆓🆔🆕🆖🆗🆘🆙🆚🈁🈂️🈷️🈶🈯🉐🈹🈲🈸🈴🈵🈺🉑]+/gu

const RELATION_TYPE_DEFINITIONS = {
  narrative_sequence: '叙事递进：图片按故事线排列',
  comparison: '对比：两张或多张图形成对比关系',
  detail_zoom: '细节放大：后图是前图某部分的放大',
  evidence_chain: '证据链：多图组成逻辑推理链',
  cross_module_bridge: '跨模块桥接：不同模块的图片之间形成呼应',
  atmosphere_stack: '氛围堆叠：多张同风格图叠加营造氛围',
  before_after: '前后对比：使用前vs使用后',
  problem_solution: '问题→解决方案',
}

// ---- helpers ----

function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, '').replace(/<br\s*\/?>/gi, '\n').trim()
}

function stripWs(s) { return (s || '').replace(/\s/g, '') }

function analyzeModuleStyle(text) {
  const clean = stripWs(text)
  const charCount = clean.length
  if (charCount === 0) return null

  const emojis = text.match(EMOJI_RE) || []
  const emojiCount = emojis.length
  const emojiDensity = parseFloat((emojiCount / Math.max(1, charCount) * 100).toFixed(1))

  const lines = text.split('\n').filter(l => l.trim())
  let emojiLineStart = 0, emojiInline = 0
  for (const line of lines) {
    if (EMOJI_RE.test(line.trimStart().slice(0, 2))) emojiLineStart++
    else if (EMOJI_RE.test(line)) emojiInline++
  }
  const totalEmojiLines = emojiLineStart + emojiInline || 1

  const emojiFreq = {}
  for (const e of emojis) { emojiFreq[e] = (emojiFreq[e] || 0) + 1 }
  const topEmojis = Object.entries(emojiFreq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([e]) => e)

  const sentences = text.split(/[。！？!?\n]+/).filter(s => s.trim())
  const avgSentenceLen = Math.round(sentences.reduce((s, sen) => s + stripWs(sen).length, 0) / Math.max(1, sentences.length))
  const shortCount = sentences.filter(s => stripWs(s).length <= 15).length
  const longCount = sentences.filter(s => stripWs(s).length >= 40).length

  const paragraphs = text.split(/\n{2,}/).filter(p => p.trim())
  const exclamationCount = (text.match(/[！!]/g) || []).length
  const questionCount = (text.match(/[？?]/g) || []).length

  const openingType = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(clean) ? 'emoji_claim'
    : /^.*?[？?]/.test(clean.slice(0, 50)) ? 'question_hook'
    : 'direct_claim'

  const closingSentences = sentences[sentences.length - 1] || ''
  const closingType = /[￥¥\d]+元|价格|低至|仅需|只要/.test(closingSentences) ? 'price_cta'
    : /总结|总之|真心|推荐/.test(closingSentences) ? 'benefit_summary'
    : 'scene_loopback'

  return {
    charCount, sentenceCount: sentences.length,
    avgSentenceLen,
    shortRatio: parseFloat((shortCount / Math.max(1, sentences.length)).toFixed(2)),
    longRatio: parseFloat((longCount / Math.max(1, sentences.length)).toFixed(2)),
    emojiCount, topEmojis,
    emojiProfile: {
      density: emojiDensity,
      positionPreference: { lineStart: parseFloat((emojiLineStart / totalEmojiLines).toFixed(2)), inline: parseFloat((emojiInline / totalEmojiLines).toFixed(2)), lineEnd: 0 },
      topEmojis,
    },
    sentenceProfile: { avgLength: avgSentenceLen, shortRatio: parseFloat((shortCount / Math.max(1, sentences.length)).toFixed(2)), longRatio: parseFloat((longCount / Math.max(1, sentences.length)).toFixed(2)), rhythmPattern: shortCount > sentences.length * 0.35 ? '短-长-短' : '均衡' },
    punctuationProfile: { exclamationPerParagraph: parseFloat((exclamationCount / Math.max(1, paragraphs.length)).toFixed(1)), questionPerParagraph: parseFloat((questionCount / Math.max(1, paragraphs.length)).toFixed(1)) },
    openingType, openingFirstSentence: sentences[0]?.slice(0, 50) || '',
    closingType, closingLastSentence: closingSentences.slice(0, 50),
    transitionWords: [],
    keyPhrases: [],
    numberDensity: 0,
    structureType: paragraphs.length <= 1 ? '单段式' : '短段落式',
    structureDesc: '',
  }
}

function computeImageRelationsHeuristic(modules, allImages) {
  const relations = []
  let relId = 1
  for (const mod of modules) {
    const segments = mod.segments || []
    const allModImgs = segments.flatMap(s => (s.images || []).map(i => i.imgId))
    if (allModImgs.length < 2) continue
    const uniqueImgs = [...new Set(allModImgs)]
    if (uniqueImgs.length < 2) continue

    const relation = {
      id: `rel_${String(relId).padStart(3, '0')}`,
      type: uniqueImgs.length === 2 ? 'comparison' : 'narrative_sequence',
      typeDesc: RELATION_TYPE_DEFINITIONS[uniqueImgs.length === 2 ? 'comparison' : 'narrative_sequence'],
      images: uniqueImgs,
      module: mod.moduleKey,
      inferred: 'heuristic',
      confidence: uniqueImgs.length <= 4 ? 'medium' : 'low',
    }

    if (uniqueImgs.length >= 2) {
      const matrix = {}
      for (let j = 0; j < uniqueImgs.length - 1; j++) {
        matrix[`${uniqueImgs[j]}_to_${uniqueImgs[j+1]}`] = { relation: 'angle_change', desc: '连续展示' }
      }
      relation.relationMatrix = matrix
    }
    if (uniqueImgs.length >= 3) {
      relation.flowDirection = '远→近→特写'
      relation.visualRhythm = '全景建立认知→中景展示特征→特写强化细节'
    }
    relations.push(relation)
    relId++
  }
  return { relations, relationTypeDefinitions: RELATION_TYPE_DEFINITIONS }
}

function extractCrossModuleLinks(modules) {
  const links = []
  const orderRationale = {}
  for (let i = 0; i < modules.length - 1; i++) {
    const from = modules[i].moduleKey, to = modules[i + 1].moduleKey
    let linkType = 'natural_flow'
    if (from === 'hook' && to === 'price') linkType = 'escalation'
    else if (from === 'taste' && to === 'trust') linkType = 'deepening'
    else if (from === 'ingredient' && to === 'brand') linkType = 'authority_chain'
    links.push({ fromModule: from, toModule: to, linkType, desc: '', textBridging: '', inferred: 'heuristic' })
  }
  if (modules[0]) orderRationale[`${modules[0].moduleKey}_first`] = '3秒内抓住注意力'
  for (let i = 0; i < modules.length - 1; i++) {
    orderRationale[`${modules[i+1].moduleKey}_after_${modules[i].moduleKey}`] = '自然阅读流'
  }
  return { links, orderRationale }
}

function migrateOne(jsonPath) {
  console.log(`  📄 ${path.relative(CORPUS_DIR, jsonPath)}`)
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))

  // Skip non-corpus files (must have modules + images + category)
  if (!data.modules || !Array.isArray(data.modules) || !data.category) {
    console.log('    ⏭  not a corpus JSON (no modules/category), skipping')
    return null
  }

  // Skip if already v3
  if (data.version === '3.0' || data.schema === 'corpus-学习增强-v3') {
    console.log('    ⏭  already v3, skipping')
    return
  }

  const modules = data.modules || []
  const images = data.images || []

  // ---- Build module styles ----
  const moduleStyles = {}
  for (const mod of modules) {
    const allText = (mod.segments || []).map(s => s.text || '').join('\n\n')
    const style = analyzeModuleStyle(allText)
    if (style) moduleStyles[mod.moduleKey] = style

    // Add writingProfile + specialized fields
    const paragraphs = allText.split(/\n{2,}/).filter(p => p.trim())
    mod.writingProfile = style ? {
      ...style,
      structureDesc: paragraphs.length <= 1 ? '单段式' : '短段落式',
    } : undefined

    // Enhance segments
    if (mod.segments) {
      mod.segments = mod.segments.map((seg, idx) => ({
        index: idx,
        ...seg,
        charCount: stripWs(seg.text || '').length,
        sentenceCount: (seg.text || '').split(/[。！？!?]+/).filter(s => s.trim()).length,
        function: idx === 0 ? '开篇引入' : idx === (mod.segments || []).length - 1 ? '总结收尾' : '主体展开',
        bindingStrength: (seg.images || []).length > 0 ? 'strong' : undefined,
        bindingDesc: (seg.images || []).length > 0 ? '图片直接展示文字相关内容' : undefined,
      }))
    }

    // Enhance layout
    if (mod.layout) {
      const imgCount = mod.layout.imageCount || 0
      const segCount = (mod.segments || []).length || 1
      mod.layout.patternSequence = mod.layout.overallPattern === 'images_interspersed' ? ['text', 'images', 'text']
        : mod.layout.overallPattern === 'image_before_text' ? ['images', 'text']
        : mod.layout.overallPattern === 'images_only' ? ['images'] : ['text']
      mod.layout.imageDistribution = (mod.segments || []).map(s => (s.images || []).length)
      mod.layout.imageGroupingPerSegment = (mod.segments || []).map(s => {
        const c = (s.images || []).length
        return c === 0 ? null : c <= 2 ? 'pair' : 'stack'
      }).filter(Boolean)
    }

    // Enhanced image groups
    if (mod.imageGroups) {
      const newGroups = {}
      for (const [gKey, gVal] of Object.entries(mod.imageGroups)) {
        newGroups[gKey] = {
          ...gVal,
          layoutHint: 'vertical_scroll',
          narrativeFunction: `${mod.moduleName || mod.moduleKey}配图`,
        }
      }
      mod.imageGroups = newGroups
    }
  }

  // ---- Enhance images ----
  const enhancedImages = images.map((img, idx) => ({
    ...img,
    contentAnalysis: {
      summary: img.imageContentSummary || '',
      ocrText: img.imageOcrText || '',
      extractedEntities: {},
      visualElements: [],
      textDensity: (img.imageContentSummary || '').length > 200 ? 'high' : (img.imageContentSummary || '').length > 50 ? 'medium' : 'low',
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
      positionInModule: idx,
      positionDesc: '',
      associatedTextPhrases: [],
    },
    imageQuality: {
      level: 'standard',
      suggestedUsage: img.layout_role === 'hero' ? 'hero_image' : 'inline',
      suggestedUsageDesc: img.layout_role === 'hero' ? '适合做大图主视觉' : '适合小尺寸嵌入',
    },
  }))

  // ---- Aggregate styleProfile ----
  const allStyles = Object.values(moduleStyles).filter(Boolean)
  const totalChars = allStyles.reduce((s, m) => s + m.charCount, 0)
  const perModule = {}
  const crossModuleVariance = {}
  for (const [key, style] of Object.entries(moduleStyles)) {
    if (!style) continue
    perModule[key] = {
      charRange: { min: style.charCount, max: style.charCount, avg: style.charCount },
      emojiProfile: style.emojiProfile,
      sentenceProfile: style.sentenceProfile,
      punctuationProfile: style.punctuationProfile,
      openingPatterns: [{ type: style.openingType, frequency: 1.0, example: style.openingFirstSentence }],
      closingPatterns: [{ type: style.closingType, frequency: 1.0 }],
      transitionWords: [],
      keyPhrasePatterns: [],
      numberFormatting: {},
    }
    crossModuleVariance[key] = { tone: style.emojiProfile.density > 0.5 ? '活泼有力' : '亲和简洁', emojiDensity: style.emojiProfile.density > 0.5 ? 'high' : 'medium' }
  }

  const styleProfile = {
    sampleInfo: { totalChars, totalModules: modules.length, totalImages: images.length, totalParagraphs: modules.reduce((s, m) => s + (m.segments || []).length, 0) },
    globalPatterns: { pacing: totalChars < 3000 ? 'fast' : 'medium', pacingDesc: '', overallTone: { primaryTone: '亲切活泼', secondaryTone: '专业可信', personaDesc: '像一个懂产品、会聊天的朋友在推荐好东西' } },
    perModule,
    crossModulePatterns: { styleVariance: crossModuleVariance, moduleConnectionPatterns: [] },
    createdAt: data.convertedAt || new Date().toISOString(),
  }

  // ---- layoutBlueprint ----
  const moduleLayouts = {}
  for (const mod of modules) {
    const imgCount = (mod.segments || []).reduce((s, seg) => s + (seg.images || []).length, 0)
    const segCount = (mod.segments || []).length || 1
    const pattern = mod.layout?.overallPattern || (imgCount > 0 && segCount > 1 ? 'images_interspersed' : imgCount > 0 ? 'image_before_text' : 'text_only')
    moduleLayouts[mod.moduleKey] = {
      typicalPattern: pattern,
      patternSequence: pattern === 'images_interspersed' ? ['text', 'images', 'text'] : pattern === 'image_before_text' ? ['images', 'text'] : ['text'],
      typicalImageCount: { min: Math.max(0, imgCount - 2), max: imgCount + 2, avg: imgCount },
      typicalSegmentCount: { min: Math.max(1, segCount - 1), max: segCount + 1, avg: segCount },
      imageGroupingPerSegment: [],
    }
  }
  const layoutBlueprint = {
    overallStructure: { moduleCount: modules.length, moduleOrder: modules.map(m => m.moduleKey), totalImages: images.length, totalTextChars: totalChars, imageToTextRatio: parseFloat((images.length / Math.max(1, totalChars / 100)).toFixed(2)), imageDensityCurve: 'front_heavy', curveDesc: '', documentPacing: {} },
    moduleLayouts,
  }

  // ---- Build v3 ----
  const v3 = {
    ...data,
    version: '3.0',
    schema: 'corpus-学习增强-v3',
    modules,
    images: enhancedImages,
    styleProfile,
    layoutBlueprint,
    imageRelations: computeImageRelationsHeuristic(modules, enhancedImages),
    crossModuleLinks: extractCrossModuleLinks(modules),
    audienceContext: {
      primaryAudience: { demographic: '未指定', tags: [], psychographic: '', painPoints: [], readingScenario: '刷小红书/朋友圈时快速浏览' },
      platform: { name: '小红书', contentFormat: '图文笔记', typicalReadingTime: '30-60秒' },
      campaignContext: { type: '日常种草', season: '' },
      audienceInstruction: '用平实但有温度的语言写作，像一个懂产品、会聊天的朋友在推荐好东西。',
    },
    feedbackSignals: { status: 'none', note: '由 v2 迁移生成' },
  }

  // Remove old top-level fields that are now nested
  delete v3.sourceNote

  return v3
}

// ---- main ----

function main() {
  console.log(`🔍 扫描语料目录: ${CORPUS_DIR}`)
  if (!fs.existsSync(CORPUS_DIR)) { console.log('⚠ 语料目录不存在'); return }

  const jsonFiles = []
  function scan(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'images') scan(path.join(dir, e.name))
      else if (e.name.endsWith('.json') && !e.name.startsWith('.')) jsonFiles.push(path.join(dir, e.name))
    }
  }
  scan(CORPUS_DIR)

  console.log(`📦 找到 ${jsonFiles.length} 个 JSON 文件`)

  let migrated = 0, skipped = 0, errors = 0
  for (const jsonPath of jsonFiles) {
    try {
      const v3 = migrateOne(jsonPath)
      if (!v3) { skipped++; continue }

      if (DRY_RUN) {
        console.log(`    ✅ [DRY-RUN] would write v3 (${JSON.stringify(v3).length} bytes)`)
      } else {
        // Backup original
        const bakPath = jsonPath.replace('.json', '.v2.bak.json')
        fs.copyFileSync(jsonPath, bakPath)
        fs.writeFileSync(jsonPath, JSON.stringify(v3, null, 2), 'utf-8')
        console.log(`    ✅ migrated (backup: ${path.basename(bakPath)})`)
      }
      migrated++
    } catch (e) {
      console.error(`    ❌ ${e.message}`)
      errors++
    }
  }

  console.log(`\n📊 迁移完成: ${migrated} migrated, ${skipped} skipped, ${errors} errors`)
  if (DRY_RUN) console.log('   (--dry-run mode, no files written)')
  if (migrated > 0 && !DRY_RUN) console.log('   (originals backed up as .v2.bak.json)')
}

main()
