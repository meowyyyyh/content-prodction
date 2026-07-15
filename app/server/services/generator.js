// ============================================================
// 生成引擎服务
// 负责组装 Prompt、调用 LLM、解析返回结果
// ============================================================

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { CONFIG } from '../config/index.js'
import { GLOBAL_SYSTEM_PROMPT } from '../prompts/global.js'
import { STYLE_PROMPTS } from '../prompts/styles.js'
import { MODULE_CONTENT_REQS } from '../prompts/modules.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// 加载语料索引
let corpusIndex = null
function loadCorpus() {
  if (corpusIndex) return corpusIndex
  const indexPath = resolve(__dirname, '../../../data/rag/corpus_index.json')
  if (!existsSync(indexPath)) return null
  corpusIndex = JSON.parse(readFileSync(indexPath, 'utf-8'))
  return corpusIndex
}

// 检索语料：按品类 + 模块匹配，返回 top 3
function retrieveCorpus(subCategory, moduleKey) {
  const index = loadCorpus()
  if (!index || !index.corpus_list) return []
  const candidates = index.corpus_list
    .filter(e => e.category === subCategory && e.module_id === moduleKey)
    .slice(0, 3)
  return candidates
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
export function buildPrompt({ product, modules, focus, images }) {
  // 全局系统指令
  const systemParts = [GLOBAL_SYSTEM_PROMPT]

  // 风格指令（6套风格统一入口，管"怎么写"）
  const stylePrompt = STYLE_PROMPTS[product.style]
  if (stylePrompt) {
    systemParts.push(stylePrompt)
  }

  // 轻量版本侧重提示（不改人设，只提示侧重方向）
  if (focus === 'taste') {
    systemParts.push(`## 版本侧重
本版本重点突出感官体验，放大口感与风味描述模块，做足味觉、嗅觉、质地的细节描写。`)
  }

  // 图片信息注入（语料库驱动：图片类型 → 建议模块，优先级从左到右）
  const imageModuleMap = {
    '封面图': ['hook'], '产品图': ['taste'],
    '配料表': ['ingredient', 'trust', 'origin'], '配料图': ['ingredient', 'trust', 'origin'],
    '场景图': ['scene'], '品牌图': ['brand'], '包装图': ['hook'],
  }
  if (images && images.length > 0) {
    // 按模块聚合图片描述
    const moduleImages = {}
    for (const img of images) {
      const targets = imageModuleMap[img.type] || ['tips'] // 兜底放到 tips
      for (const mod of targets) {
        if (modules.includes(mod)) {
          if (!moduleImages[mod]) moduleImages[mod] = []
          moduleImages[mod].push(img)
        }
      }
    }
    // 注入到 system prompt
    if (Object.keys(moduleImages).length > 0) {
      const imageParts = ['## 图片排版指令']
      imageParts.push('运营已上传商品图片。每个模块的图片数量如下，请严格按 图1→文→图2→文→... 的节奏写对应文案。每张图后跟 1-2 句话，描述图里的细节，不要泛泛而谈。')
      for (const [mod, imgs] of Object.entries(moduleImages)) {
        imageParts.push(`\n### ${mod} 模块（${imgs.length} 张图）`)
        imgs.forEach((img, i) => {
          imageParts.push(`图${i + 1}：${img.desc || '商品图片'}`)
        })
      }
      imageParts.push('\n请确保每段文字紧跟在对应图片之后，文案自然引用图片中的视觉细节。')
      systemParts.push(imageParts.join('\n'))
    }
  }

  // 语料库 RAG 注入
  const subCategory = product.subCategory || '调制乳/风味牛奶'
  const corpusRefs = []
  for (const modKey of modules) {
    const refs = retrieveCorpus(subCategory, modKey)
    if (refs.length > 0) {
      corpusRefs.push(`### ${modKey}\n${refs.map(r => `> ${r.content.slice(0, 200)}`).join('\n\n')}`)
    }
  }
  if (corpusRefs.length > 0) {
    systemParts.push(`## 参考语料（同类目高分笔记，仅参考写作风格和表达方式，具体产品信息以输入为准）\n\n${corpusRefs.join('\n\n')}`)
  }

  const systemPrompt = systemParts.join('\n\n---\n\n')

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

  // 模块指令（纯食材——所有风格共用，管"写什么"）
  const modulePrompts = modules.map(key => {
    return MODULE_CONTENT_REQS[key] || ''
  }).filter(Boolean)

  const userPrompt = `## 商品信息

- **商品名称：** ${product.productName || ''}
- **二级子品类：** ${subCategoryLabel}
- **规格净含量：** ${product.netWeight || '（未提供）'}
- **产地：** ${product.origin || '（未提供）'}
- **生产日期：** ${product.productionDate || '（未提供）'}
- **保质期：** ${product.shelfLifeValue || ''}${product.shelfLifeUnit === 'month' ? '个月' : product.shelfLifeUnit === 'day' ? '天' : product.shelfLifeUnit === 'year' ? '年' : ''}
- **建议售价：** ${product.suggestedPrice ? '¥' + product.suggestedPrice : '（未提供）'}
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
