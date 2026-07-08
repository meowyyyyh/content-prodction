// ============================================================
// 生成引擎服务
// 负责组装 Prompt、调用 LLM、解析返回结果
// ============================================================

import { CONFIG } from '../config/index.js'
import { GLOBAL_SYSTEM_PROMPT } from '../prompts/global.js'
import { STYLE_PROMPTS } from '../prompts/styles.js'
import { MODULE_PROMPTS } from '../prompts/modules.js'

// 非小红书风格的精简模块要求：只定义内容要素，风格由 styles.js 控制
const MODULE_CONTENT_REQS = {
  hook:       '必须包含：品牌名 + 品类 + 核心差异化卖点 + 价格福利信息。不低于160字。',
  price:      '必须包含：总价、规格数量、单份价格计算（总价÷数量）、赠品信息。不低于120字。',
  taste:      '必须包含：口感的三层变化（前调→中调→后调），用感官动词描写。不低于240字。',
  trust:      '必须包含：配料表关键信息、无添加承诺、核心营养含量。不低于160字。',
  aftercare:  '必须包含：快递公司、发货仓、发货时效、不发货地区、售后规则、签收提醒。不低于120字。',
  tips:       '必须包含：储存温度、保质期、开封后保存时间、建议饮用年龄、不适用人群。不低于120字。',
  cta:        '必须包含：核心利益点总结、售后保障、下单方式。不低于80字。',
  ingredient:'必须包含：成分名称、通俗解释、与产品的关联、含量数据。不低于240字。',
  origin:     '必须包含：产地地理位置、产地优势（气候/水源/土壤）、原料特点、与产品的关联。不低于160字。',
  brand:      '必须包含：品牌实力介绍、用具体数字建立信任。不低于200字。',
  scene:      '必须包含：3-4个高频使用场景，每个场景写清楚时间+用法+感受。不低于240字。',
  feedback:   '必须包含：2-3个不同身份的模拟用户评价，口语化有细节。不低于160字。',
  comparison: '必须包含：各平台价格对比（逐行列出），团购价突出标注，结尾总结省钱。不低于120字。',
  faq:        '必须包含：4-6个常见问题，Q用简洁提问，A务实直接。不低于200字。',
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
export function buildPrompt({ product, modules, focus }) {
  // 全局系统指令
  const systemParts = [GLOBAL_SYSTEM_PROMPT]

  // 风格指令（最高优先级：覆盖模块级 emoji 和格式规则）
  const stylePrompt = STYLE_PROMPTS[product.style]
  if (stylePrompt) {
    systemParts.push(stylePrompt)
    systemParts.push(`## 风格优先规则（最高优先级）
当前选择的风格是「${product.style === 'xiaohongshu' ? '小红书种草风' : product.style === 'girlfriend' ? '日常闺蜜风' : product.style === 'minimalist' ? '简约功能风' : product.style === 'fun' ? '趣味风' : product.style === 'premium' ? '高端大气风' : ''}」。

**风格规则具有最高优先级。当模块级指令与风格规则冲突时，以风格规则为准。**

具体来说：
- 风格规定了 emoji 的使用（数量、位置、类型），模块级指令中的 emoji 仅为默认建议，实际以风格规则为准
- 风格规定了段落长度、感叹号使用、数字呈现方式，必须严格执行
- 风格规定了价格描述方式（强调/随口/精确/笑点/不提），覆盖模块级的默认价格描述
- 模块指令定义的是「写什么内容」（结构、要素、信息点），风格定义的是「怎么写」（语气、节奏、细节）`)
  }

  // 版本侧重
  if (focus === 'value') {
    systemParts.push(`## 版本二：老团长直推风（与版本一完全不同的风格）

**你不是小红书博主，你是一个做了5年团购的老团长。你的风格和版本一完全不同。**

人设：你每天跟供应商砍价、跟物流吵架、跟团长群交流。你对产品很了解但懒得写小作文。你的文字像在群里发了一条语音转文字——直接、有信息量、不装。

具体规则：
- **emoji 克制**：偶尔用一个点缀即可，不靠图标装饰
- **首屏钩子**：开门见山，不铺垫。"这款我跟了3个月，今天终于能上了。""直接说：XX产品，XX价格，XX规格。"
- **价格福利**：算账式。逐项列出：原价XX → 团购价XX → 省XX。像报价单一样干脆。"成本我算过了，这个价你能拿到是因为..."
- **口感体验**：克制。不写"丝滑""绝了""入口即化"，写"酸度适中""甜度刚好""喝完嘴里干净"。像在跟另一个团长交流品控反馈。
- **行动召唤**：不催促。"链接在评论区。""需要的自己拍。""明天中午截单。"
- **段落节奏**：每段不超过2句。大量留白。像群里快速刷屏的消息。
- **字数控制**：每个模块比版本一少30-40%。能一句话说清楚的不写两句。你珍惜团友的时间。
- **禁止**：感叹号连用（最多1个）、"姐妹们""宝子们"、小红书式夸张修辞、"手慢无""抢疯了"等虚假紧迫感

核心差异：版本一是"闺蜜兴奋地安利"，版本二是"老团长冷静地告诉你这东西为什么值得买"。`)
  } else {
    if (product.textLength === 'short') { systemParts.push(`## 文本长度：精简模式\n要求：控制篇幅，每模块50-100字，结构清晰，用编号逐条展开，减少修饰性描述。`) } else { systemParts.push(`## 文本长度：详细模式\n要求：每模块充分展开，不少于规定字数，细节丰富，层次分明。`) }
  systemParts.push(`## 版本侧重：口感体验向\n本版本重点突出感官体验，放大口感与风味描述模块，做足味觉、嗅觉、质地的细节描写。`)
  }

  // POC 语料覆盖度声明
  systemParts.push(`## 语料库覆盖度声明
当前语料库仅覆盖乳制品和冷冻甜品品类。其他品类参考通用食品写作原则生成。语料中的合规警告已被标注，生成时请勿模仿其中的违规表述。`)

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

  const isXiaohongshu = !product.style || product.style === 'xiaohongshu'
  const styleReminder = isXiaohongshu ? '' : `## ⚠️ 风格指令优先（最高优先级）
当前选择的风格是「${product.style === 'girlfriend' ? '日常闺蜜风' : product.style === 'minimalist' ? '简约功能风' : product.style === 'fun' ? '趣味风' : product.style === 'premium' ? '高端大气风' : ''}」。
**请严格按照系统指令中该风格的「各模块写作规则」来写每个模块。下面的模块要求只定义了「必须包含哪些信息」，怎么写（语气、emoji、句式、段落长度、价格描述方式）完全由风格规则决定。风格规则优先级高于下面的任何模块指令。**\n\n`

  const modulePrompts = modules.map(key => {
    if (isXiaohongshu) return MODULE_PROMPTS[key]
    const req = MODULE_CONTENT_REQS[key]
    return req ? `## 模块：${key}\n${req}` : ''
  }).filter(Boolean)

  const userPrompt = `${styleReminder}## 商品信息

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

请严格基于以上商品信息，依次生成以下模块的文案。禁止编造任何输入中未提供的价格、配料、功效、认证等客观数据。每个模块之间用 \`---\` 分隔，模块内用自然段落表达。

${modulePrompts.join('\n\n---\n\n')}

## 输出格式

请严格按照以下格式输出，每个模块用 \`===模块key===\` 标记，模块之间用空行分隔：

${modules.map(k => `===${k}===\n[文案]`).join('\n\n')}

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

/** 清洗内容：移除模块标记和HTML标签，还原结构化纯文本 */
function cleanContent(text) {
  return text
    .replace(/<br\s*\/?>/gi, '\n')       // <br> → 换行
    .replace(/<\/tr>/gi, '\n')            // 表格行尾 → 换行
    .replace(/<\/td>\s*<td[^>]*>/gi, ' / ') // 表格单元格 → 斜杠分隔
    .replace(/<\/th>\s*<th[^>]*>/gi, ' / ') // 表头单元格 → 斜杠分隔
    .replace(/<[^>]+>/g, '')             // 移除所有剩余HTML标签
    .replace(/===\w+===/g, '')           // 移除 ===xxx=== 标记
    .replace(/[ \t]+/g, ' ')             // 压缩多余空格
    .replace(/\n{3,}/g, '\n\n')          // 最多连续2个换行
    .replace(/^\s*\n/gm, '')             // 移除空行
    .trim()
}
