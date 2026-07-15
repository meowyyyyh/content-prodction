// ============================================================
// 语料入库脚本
// 扫描 data/corpus/ 下所有商品文件夹 → 切片 → 追加到 RAG 索引
// 用法：node import_corpus.cjs
// ============================================================

const fs = require('fs')
const path = require('path')

const CORPUS_DIR = path.join(__dirname, '..', 'corpus')
const RAG_INDEX_PATH = path.join(__dirname, 'corpus_index.json')

// 模块 ID 映射
const MODULE_KEY_MAP = {
  '首屏钩子': 'hook', '价格福利': 'price', '口感体验': 'taste', '基础信任': 'trust',
  '物流售后': 'aftercare', '储存贴士': 'tips', '行动召唤': 'cta',
  '成分科普': 'ingredient', '原料溯源': 'origin', '品牌背书': 'brand',
  '场景共情': 'scene', '用户反馈': 'feedback', '全网比价': 'comparison', '常见问题': 'faq'
}

const MODULE_LABEL_MAP = Object.fromEntries(Object.entries(MODULE_KEY_MAP).map(([k, v]) => [v, k]))

// 解析品类路径 "食品保健 > 咖啡/麦片/冲饮 > 常温乳制品 > 调制乳/风味牛奶"
function parseCategory(categoryLine) {
  if (!categoryLine) return { category: '未知', subCategory: '未知' }
  const parts = categoryLine.split('>').map(s => s.trim()).filter(Boolean)
  return {
    category: parts[0] || '未知',
    subCategory: parts[parts.length - 1] || '未知'
  }
}

// 扫描语料目录
function scanCorpus() {
  const entries = []
  if (!fs.existsSync(CORPUS_DIR)) { console.log('⚠ 语料目录不存在:', CORPUS_DIR); return entries }

  // 遍历：一级类目 → 四级类目 → 商品文件夹
  const level1Cats = fs.readdirSync(CORPUS_DIR)
  for (const l1 of level1Cats) {
    const l1Path = path.join(CORPUS_DIR, l1)
    if (!fs.statSync(l1Path).isDirectory()) continue

    const level4Cats = fs.readdirSync(l1Path)
    for (const l4 of level4Cats) {
      const l4Path = path.join(l1Path, l4)
      if (!fs.statSync(l4Path).isDirectory()) continue

      const products = fs.readdirSync(l4Path)
      for (const prod of products) {
        const prodPath = path.join(l4Path, prod)
        if (!fs.statSync(prodPath).isDirectory()) continue

        // 找 json 文件
        const files = fs.readdirSync(prodPath)
        const jsonFile = files.find(f => f.endsWith('.json') && !f.startsWith('corpus'))
        if (!jsonFile) { console.log('  ⚠ 找不到 JSON:', prodPath); continue }

        const jsonPath = path.join(prodPath, jsonFile)
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))

      // 解析品类
      const catInfo = parseCategory(data.categoryLine || '')
      if (data.category && typeof data.category === 'object') {
        catInfo.category = data.category.level2 || data.category.level1 || catInfo.category
        catInfo.subCategory = data.category.level4 || data.category.level3 || catInfo.subCategory
      }

      // 逐个模块切片
      for (const [moduleKey, content] of Object.entries(data.modules || {})) {
        if (!content || !content.trim()) continue
        const label = MODULE_LABEL_MAP[moduleKey] || moduleKey
        entries.push({
          id: `${catInfo.subCategory}-${moduleKey}-${prod.slice(0, 4)}`,
          category: catInfo.subCategory,
          module_id: moduleKey,
          module_name: label,
          style_tag: data.template || '小红书种草风',
          content: content.slice(0, 500),
          note: `来源: ${data.productName || prod}`
        })
      }
    }
    }
  }
  return entries
}

// 主流程
function main() {
  console.log('📦 扫描语料目录:', CORPUS_DIR)
  const newEntries = scanCorpus()

  if (newEntries.length === 0) {
    console.log('⚠ 没有找到新语料')
    return
  }

  // 去重（同 ID 覆盖）
  const index = {}
  for (const entry of newEntries) {
    index[entry.id] = entry
  }

  const corpusIndex = {
    knowledge_base_name: '快稿种草语料库',
    version: new Date().toISOString().slice(0, 10),
    update_time: new Date().toISOString(),
    total_count: Object.keys(index).length,
    corpus_list: Object.values(index)
  }

  fs.writeFileSync(RAG_INDEX_PATH, JSON.stringify(corpusIndex, null, 2), 'utf-8')
  console.log(`✅ 入库完成: ${RAG_INDEX_PATH}`)
  console.log(`   总条目: ${corpusIndex.total_count}`)
  console.log(`   来源商品: ${[...new Set(newEntries.map(e => e.note.split(':')[0]))].length} 个`)
}

main()
