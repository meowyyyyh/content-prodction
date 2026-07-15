const fs = require('fs')
const path = require('path')

const mdPath = path.join(__dirname, '认养一头牛每日吨吨木姜子香茅酸奶.md')
const jsonPath = path.join(__dirname, '认养一头牛每日吨吨木姜子香茅酸奶.json')

const content = fs.readFileSync(mdPath, 'utf-8')

// 按 --- 分割正文和图片清单
const parts = content.split(/\n---\n/)
const mainPart = parts[0]
const imagePart = parts.slice(1).join('\n---\n')

// 解析模块内容：**模块名**：后面跟内容（可能多行，直到下一个 ** 或空行）
const modules = {}
const moduleKeys = [
  '商品名', '模板',
  '首屏钩子', '价格福利', '口感体验', '基础信任',
  '物流售后', '储存贴士', '行动召唤',
  '成分科普', '原料溯源', '品牌背书', '场景共情',
  '用户反馈', '全网比价', '常见问题'
]

let remaining = mainPart
for (const key of moduleKeys) {
  const marker = `**${key}**`
  const idx = remaining.indexOf(marker)
  if (idx === -1) continue

  // 去掉当前标记及之前内容
  const after = remaining.slice(idx + marker.length)
  // 找到下一个 ** 标记或结束
  const nextMarker = after.search(/\n\*\*[^*]+\*\*/)
  const value = nextMarker === -1
    ? after.replace(/^[：:\s\n]+/, '').trim()
    : after.slice(0, nextMarker).replace(/^[：:\s\n]+/, '').trim()

  modules[key] = value
  remaining = after.slice(nextMarker === -1 ? after.length : nextMarker)
}

// 解析图片清单表格
const images = []
const tableMatch = imagePart.match(/\| 编号 \|.*\|[\s\S]*/)
if (tableMatch) {
  const lines = tableMatch[0].split('\n').filter(l => l.trim().startsWith('|') && /\d+/.test(l.split('|')[1] || ''))
  for (const line of lines) {
    const cols = line.split('|').map(c => c.trim()).filter(Boolean)
    if (cols.length >= 4) {
      const rawType = cols[3] || ''
      const types = rawType.split(/[、,，]/).map(t => t.trim()).filter(Boolean)
      images.push({
        id: parseInt(cols[0]),
        file: 'images/' + cols[1],
        desc: cols[2],
        type: types,            // 多标签数组，第一个是主要类型
        primaryType: types[0] || '',
        module: cols[4] || ''
      })
    }
  }
}

// 组装 JSON
const result = {
  productName: modules['商品名'] || '',
  template: modules['模板'] || '',
  category: {
    level1: '食品保健',
    level2: '咖啡/麦片/冲饮',
    level3: '常温乳制品',
    level4: '调制乳/风味牛奶'
  },
  modules: {
    hook: modules['首屏钩子'] || '',
    price: modules['价格福利'] || '',
    taste: modules['口感体验'] || '',
    trust: modules['基础信任'] || '',
    aftercare: modules['物流售后'] || '',
    tips: modules['储存贴士'] || '',
    cta: modules['行动召唤'] || '',
    ingredient: modules['成分科普'] || '',
    origin: modules['原料溯源'] || '',
    brand: modules['品牌背书'] || '',
    scene: modules['场景共情'] || '',
    feedback: modules['用户反馈'] || '',
    comparison: modules['全网比价'] || '',
    faq: modules['常见问题'] || ''
  },
  images,
  imageCount: images.length,
  source: '语料库手动收集',
  convertedAt: new Date().toISOString()
}

fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2), 'utf-8')
console.log(`✅ 转换完成: ${jsonPath}`)
console.log(`   模块数: ${Object.values(result.modules).filter(Boolean).length}`)
console.log(`   图片数: ${images.length}`)
