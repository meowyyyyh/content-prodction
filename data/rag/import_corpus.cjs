// ============================================================
// 语料库 v3 入库脚本
// 扫描 data/corpus/ 下所有 v3（或 v2 兼容）商品 JSON → 构建结构化 RAG 索引
// 用法：node import_corpus.cjs
// ============================================================

const fs = require('fs')
const path = require('path')

const CORPUS_DIR = path.join(__dirname, '..', 'corpus')
const RAG_INDEX_PATH = path.join(__dirname, 'corpus_index.json')

// ---- 精简化范例裁剪 (4.14) ----
function truncateSample(text, maxChars = 300) {
  if (!text || !text.trim()) return ''
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= maxChars) return clean

  const sentences = clean.split(/[。！？!?]+/).filter(s => s.trim())
  if (sentences.length <= 2) return clean.slice(0, maxChars) + '…'

  // 开头2句 + 中间1个完整段落 + 结尾1句
  const first2 = sentences.slice(0, 2).join('。') + '。'
  const last1 = sentences[sentences.length - 1]
  const midIdx = Math.floor(sentences.length / 2)
  const mid1 = sentences[midIdx]

  let result = first2 + mid1 + '。' + last1 + '。'
  if (result.length > maxChars) {
    result = first2 + last1 + '。'
  }
  if (result.length > maxChars) {
    result = first2.slice(0, maxChars) + '…'
  }
  return result + `（共${clean.length}字，已精简）`
}

// ---- 扫描语料目录 ----

function scanCorpusV3() {
  const products = []
  if (!fs.existsSync(CORPUS_DIR)) { console.log('⚠ 语料目录不存在:', CORPUS_DIR); return products }

  const level1Cats = fs.readdirSync(CORPUS_DIR)
  for (const l1 of level1Cats) {
    const l1Path = path.join(CORPUS_DIR, l1)
    if (!fs.statSync(l1Path).isDirectory() || l1.startsWith('.')) continue

    const level2Cats = fs.readdirSync(l1Path)
    for (const l2 of level2Cats) {
      const l2Path = path.join(l1Path, l2)
      if (!fs.statSync(l2Path).isDirectory() || l2.startsWith('.')) continue

      const level3Cats = fs.readdirSync(l2Path)
      for (const l3 of level3Cats) {
        const l3Path = path.join(l2Path, l3)
        if (!fs.statSync(l3Path).isDirectory() || l3.startsWith('.')) continue

        const prodDirs = fs.readdirSync(l3Path)
        for (const prod of prodDirs) {
          const prodPath = path.join(l3Path, prod)
          if (!fs.statSync(prodPath).isDirectory() || prod.startsWith('.')) continue

          const files = fs.readdirSync(prodPath)
          // Prefer v2.bak excluded, main JSON
          const jsonFile = files.find(f => f.endsWith('.json') && !f.endsWith('.v2.bak.json') && !f.startsWith('analysis_') && !f.startsWith('.'))
          if (!jsonFile) continue

          try {
            const data = JSON.parse(fs.readFileSync(path.join(prodPath, jsonFile), 'utf-8'))
            // Must have modules + category
            if (!data.modules || !Array.isArray(data.modules) || !data.category) continue

            const catLevel3 = data.category.level3 || l3
            products.push({
              productName: data.productName || prod,
              category: data.category,
              catLevel3,
              styleTag: data.styleTag || 'xiaohongshu',
              version: data.version || '2.2',
              convertedAt: data.convertedAt || new Date().toISOString(),
              modules: data.modules || [],
              images: data.images || [],
              styleProfile: data.styleProfile || null,
              layoutBlueprint: data.layoutBlueprint || null,
              imageRelations: data.imageRelations || null,
              crossModuleLinks: data.crossModuleLinks || null,
              audienceContext: data.audienceContext || null,
            })
          } catch (e) {
            console.log(`  ⚠ 解析失败: ${path.relative(CORPUS_DIR, path.join(prodPath, jsonFile))} — ${e.message}`)
          }
        }
      }
    }
  }
  return products
}

// ---- 聚合 ----

function computeTemporalWeight(createdAt) {
  if (!createdAt) return 1.0
  const ageMs = Date.now() - new Date(createdAt).getTime()
  const ageMonths = ageMs / (1000 * 60 * 60 * 24 * 30)
  if (ageMonths <= 3) return 1.0
  if (ageMonths <= 6) return 0.7
  if (ageMonths <= 12) return 0.4
  return 0.2
}

function mergeStyleProfiles(profiles, weights) {
  // Simple weighted merge of numeric fields
  if (profiles.length === 0) return null
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1

  // For now, return the profile from the most recent product (highest weight)
  // Full aggregation would merge all fields, but that's complex
  let bestIdx = 0
  for (let i = 1; i < weights.length; i++) {
    if (weights[i] > weights[bestIdx]) bestIdx = i
  }
  return profiles[bestIdx]
}

function buildV3Index(products) {
  // Group by category (level3)
  const entries = {}
  const allModuleKeys = new Set()

  for (const prod of products) {
    const cat = prod.catLevel3
    if (!entries[cat]) {
      entries[cat] = {
        categoryMeta: { totalProducts: 0, totalModules: 0, updatedAt: '', products: [] },
        modules: {},
      }
    }
    const catEntry = entries[cat]
    catEntry.categoryMeta.totalProducts++
    catEntry.categoryMeta.updatedAt = prod.convertedAt
    catEntry.categoryMeta.products.push({
      productName: prod.productName,
      convertedAt: prod.convertedAt,
      styleTag: prod.styleTag,
    })

    for (const mod of prod.modules) {
      const mk = mod.moduleKey
      if (!mk) continue
      allModuleKeys.add(mk)
      catEntry.categoryMeta.totalModules++

      if (!catEntry.modules[mk]) {
        catEntry.modules[mk] = { samples: [], allStyles: [], allLayouts: [] }
      }

      // Extract text from segments
      const allText = (mod.segments || []).map(s => s.text || '').join('\n\n')
      const truncated = truncateSample(allText, 300)

      // Style snapshot from pre-computed styleProfile or module writingProfile
      const styleSnapshot = prod.styleProfile?.perModule?.[mk]
        || mod.writingProfile
        || null

      // Layout snapshot
      const layoutSnapshot = mod.layout || null

      // Audience tags
      const tags = prod.audienceContext?.primaryAudience?.tags || []

      catEntry.modules[mk].samples.push({
        productName: prod.productName,
        styleTag: prod.styleTag,
        version: prod.version,
        createdAt: prod.convertedAt,
        weight: computeTemporalWeight(prod.convertedAt),
        styleSnapshot,
        layoutSnapshot,
        textPreview: truncated,
        imageCount: mod.layout?.imageCount || (mod.segments || []).reduce((s, seg) => s + (seg.images || []).length, 0),
        segmentCount: (mod.segments || []).length || 1,
        patternSequence: mod.layout?.patternSequence || [],
        audience: { demographic: prod.audienceContext?.primaryAudience?.demographic || '', tags },
      })
      catEntry.modules[mk].allStyles.push(styleSnapshot)
      catEntry.modules[mk].allLayouts.push(layoutSnapshot)
    }
  }

  // Aggregate per category per module
  for (const [cat, catEntry] of Object.entries(entries)) {
    // Category-level aggregated profiles
    const allPerModule = {}
    for (const [mk, modEntry] of Object.entries(catEntry.modules)) {
      const weights = modEntry.samples.map(s => s.weight)
      const profiles = modEntry.samples.map(s => s.styleSnapshot).filter(Boolean)
      const layouts = modEntry.samples.map(s => s.layoutSnapshot).filter(Boolean)

      // Sort samples by weight desc, keep top 5
      modEntry.samples.sort((a, b) => b.weight - a.weight)
      modEntry.samples = modEntry.samples.slice(0, 5)

      allPerModule[mk] = {
        aggregatedStyle: mergeStyleProfiles(profiles, weights.slice(0, profiles.length)),
        aggregatedLayout: layouts.length > 0 ? layouts[0] : null,
        sampleCount: modEntry.samples.length,
        topPatternSequence: modEntry.samples[0]?.patternSequence || [],
        avgImageCount: Math.round(modEntry.samples.reduce((s, sm) => s + sm.imageCount, 0) / Math.max(1, modEntry.samples.length)),
      }
    }

    // Category-level aggregated style profile
    const catStyleProfile = {
      sampleInfo: {
        totalProducts: catEntry.categoryMeta.totalProducts,
        totalModules: catEntry.categoryMeta.totalModules,
      },
      perModule: allPerModule,
    }

    catEntry.aggregatedStyleProfile = catStyleProfile
    catEntry.aggregatedLayoutBlueprint = {
      moduleLayouts: Object.fromEntries(
        Object.entries(catEntry.modules).map(([mk, me]) => [
          mk,
          {
            typicalImageCount: { avg: me.samples[0]?.imageCount || 0 },
            typicalSegmentCount: { avg: me.samples[0]?.segmentCount || 1 },
            patternSequence: me.samples[0]?.patternSequence || [],
          },
        ])
      ),
    }

    // Clean up raw data arrays (keep only samples)
    delete catEntry.categoryMeta.products
    for (const [mk, modEntry] of Object.entries(catEntry.modules)) {
      delete modEntry.allStyles
      delete modEntry.allLayouts
    }
  }

  // Global cross-category profile for cold start
  const globalModuleDefaults = {}
  for (const mk of allModuleKeys) {
    const allSamples = []
    for (const [, catEntry] of Object.entries(entries)) {
      const modEntry = catEntry.modules[mk]
      if (modEntry) allSamples.push(...modEntry.samples)
    }
    if (allSamples.length > 0) {
      allSamples.sort((a, b) => b.weight - a.weight)
      globalModuleDefaults[mk] = {
        styleDefaults: allSamples[0]?.styleSnapshot || null,
        layoutDefaults: {
          typicalPattern: allSamples[0]?.patternSequence?.length > 2 ? 'images_interspersed' : 'image_before_text',
          patternSequence: allSamples[0]?.patternSequence || [],
          avgImageCount: Math.round(allSamples.reduce((s, sm) => s + sm.imageCount, 0) / allSamples.length),
        },
        sampleCount: allSamples.length,
      }
    }
  }

  return {
    version: '3.0',
    knowledge_base_name: '快稿种草语料库',
    updatedAt: new Date().toISOString(),
    totalProducts: products.length,
    totalModules: [...allModuleKeys].length,
    entries,
    globalProfile: {
      styleDefaults: Object.fromEntries(
        Object.entries(globalModuleDefaults).map(([mk, v]) => [mk, v.styleDefaults])
      ),
      layoutDefaults: Object.fromEntries(
        Object.entries(globalModuleDefaults).map(([mk, v]) => [mk, v.layoutDefaults])
      ),
      moduleDefaults: globalModuleDefaults,
    },
  }
}

// ---- main ----

function main() {
  console.log('📦 扫描语料目录:', CORPUS_DIR)
  const products = scanCorpusV3()
  console.log(`   找到 ${products.length} 个商品`)

  if (products.length === 0) {
    console.log('⚠ 没有找到有效语料')
    return
  }

  const totalMods = products.reduce((s, p) => s + p.modules.length, 0)
  console.log(`   共 ${totalMods} 个模块切片`)

  const index = buildV3Index(products)
  const totalSamples = Object.values(index.entries).reduce(
    (s, cat) => s + Object.values(cat.modules).reduce((sm, mod) => sm + mod.samples.length, 0),
    0
  )
  console.log(`   索引条目: ${totalSamples} samples`)

  fs.writeFileSync(RAG_INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8')
  console.log(`✅ 入库完成: ${RAG_INDEX_PATH}`)
  console.log(`   品类: ${Object.keys(index.entries).length}`)
  console.log(`   模块类型: ${Object.keys(index.globalProfile.moduleDefaults || {}).length}`)
}

main()
