// ============================================================
// 视觉模型服务 — doubao-seed-2.0-lite
// 图片分类 + 一句话描述
// ============================================================

import { CONFIG } from '../config/index.js'

const { endpoint, apiKey, model, temperature, maxTokens, timeout } = CONFIG.vision

const CLASSIFY_PROMPT = `你是一个商品笔记图片分析专家。请分析这张图片，输出以下字段：

1. type（图片类型）：封面图 / 产品图 / 配料表 / 场景图 / 品牌图 / 包装图 / 其他
   定义——
   - 封面图：含有促销文字、价格标签、卖点信息的商品宣传海报
   - 产品图：展示商品本身的照片（特写、多角度、质地细节）
   - 配料表：配料表或营养成分表的截图
   - 场景图：商品在生活/使用场景中的照片（办公桌、餐桌、户外等）
   - 品牌图：品牌logo、门店、工厂、证书、代言人、牧场
   - 包装图：外包装、礼盒、快递箱
   - 其他：无法归入以上类型

2. imageContentSummary（精炼内容摘要）：见下方第4条的精炼规则，先生成此字段。
   先以短句概括图中的核心硬信息（品牌、价格、规格、认证、关键卖点），让AI知道"图中已经展示了什么"。
   控制在100字以内。

3. desc（图片内容）：请按以下结构化格式，尽可能全面、详细地描述这张图片，不要精简——

   【物体】图中有什么商品/物体，数量、怎么摆放、朝向
   【文字】逐条列出所有可见的文字信息（原文转录，不要总结）：
     - 品牌名、商品名
     - 价格数字（精确到角）、规格数量
     - 卖点标签、宣传语（原文）
     - 配料表内容（尽量全）
     - 营养成分数据（精确数值）
     - 认证标识文字、印章文字
     - 日期、批号等
   【场景】在什么环境中（桌面、户外、手持、货架等），背景是什么
   【视觉】颜色、材质、光线、构图特点

   每条信息都要具体。总描述可到400字。

   【物体】图中有什么商品/物体，数量、怎么摆放、朝向
   【文字】逐条列出所有可见的文字信息（原文转录，不要总结）：
     - 品牌名、商品名
     - 价格数字（精确到角）、规格数量
     - 卖点标签、宣传语（原文）
     - 配料表内容（尽量全）
     - 营养成分数据（精确数值）
     - 认证标识文字、印章文字
     - 日期、批号等
   【场景】在什么环境中（桌面、户外、手持、货架等），背景是什么
   【视觉】颜色、材质、光线、构图特点

   每条信息都要具体。总描述可到400字。

5. imageOcrText（完整OCR文字）：
   识别图中所有可见的中文、英文和数字文字，逐行逐条输出，不要遗漏任何文字。
   包括但不限于：配料表全部内容（每一项）、营养成分表全部数据（每一项的精确数值）、包装上所有文字、卖点标签文字、二维码旁边的说明文字、日期、批号等。
   这部分用于语料库标注，必须尽可能完整，不要精简。

6. suggestedModule（建议模块）：
   根据图片内容，判断它最适合放在笔记的哪个模块中。
   可选值：hook（首屏钩子）/ price（价格福利）/ taste（口感体验）/ trust（基础信任）/ aftercare（物流售后）/ tips（储存贴士）/ cta（行动召唤）/ ingredient（成分科普）/ origin（原料溯源）/ brand（品牌背书）/ scene（场景共情）/ feedback（用户反馈）/ comparison（全网比价）/ faq（常见问题）
   判断标准——
   - 含价格/赠品信息的封面图 → hook 或 price
   - 产品特写/质地展示 → taste
   - 配料表/营养成分 → trust 或 ingredient
   - 使用场景照 → scene
   - 品牌/牧场/证书 → brand
   - 包装/快递 → aftercare

请严格按以下JSON格式返回，不要输出任何其他内容：
{"type":"产品图","desc":"白色酸奶瓶，绿色标签展示木姜子香茅风味","layout_role":"hero","imageContentSummary":"品牌：认养一头牛。售价：¥79.9/12瓶，送3瓶原味款。卖点标签：9种活性益生菌、A2生牛乳。视觉：白色瓶身绿色标签，浅色木质桌面。","imageOcrText":"认养一头牛 每日吨吨 木姜子香茅益生菌酸奶 200g×12瓶 79.9元 送3瓶原味款","suggestedModule":"taste"}`


/**
 * 分类单张图片
 * @param {string} base64 - base64 编码的图片数据（不含 data:image/...;base64, 前缀）
 * @param {string} mimeType - 图片 MIME 类型
 * @returns {Promise<{type: string, desc: string}>}
 */
export async function classifyImage(base64, mimeType = 'image/jpeg') {
  const body = {
    model,
    temperature,
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${base64}` }
        },
        { type: 'text', text: CLASSIFY_PROMPT }
      ]
    }]
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout)
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Vision API error ${res.status}: ${errText}`)
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content?.trim() || ''

  // 解析 JSON 返回
  try {
    // 尝试直接解析
    const result = JSON.parse(content)
    return {
      type: result.type || '其他',
      desc: result.desc || '',
      layout_role: result.layout_role || 'detail',
      imageContentSummary: result.imageContentSummary || '',
      imageOcrText: result.imageOcrText || '',
      suggestedModule: result.suggestedModule || ''
    }
  } catch {
    // 兜底：尝试从文本中提取 type
    const typeMatch = content.match(/产品图|配料表|场景图|品牌图|包装图|其他/)
    return {
      type: typeMatch ? typeMatch[0] : '其他',
      desc: content.replace(/\{|\}|"type"|"desc"|"layout_role"|"imageContentSummary"|"imageOcrText"|"suggestedModule"|:/g, '').trim(),
      layout_role: 'detail',
      imageContentSummary: '',
      imageOcrText: '',
      suggestedModule: ''
    }
  }
}

/**
 * 批量分类图片
 * @param {Array<{id: number|string, base64: string, mimeType?: string}>} images
 * @param {number} batchSize - 每批数量
 * @param {number} concurrency - 并行批数
 * @returns {Promise<Array<{id: number|string, type: string, desc: string}>>}
 */
export async function classifyImages(images, batchSize = 10, concurrency = 3) {
  const results = []

  // 分批
  const batches = []
  for (let i = 0; i < images.length; i += batchSize) {
    batches.push(images.slice(i, i + batchSize))
  }

  // 并行处理批次（最多 concurrency 路并行）
  async function processBatch(batch) {
    const batchResults = await Promise.all(
      batch.map(img =>
        classifyImage(img.base64, img.mimeType || 'image/jpeg')
          .then(result => ({ id: img.id, ...result }))
          .catch(err => ({
            id: img.id,
            type: '其他',
            desc: '',
            error: err.message
          }))
      )
    )
    results.push(...batchResults)
  }

  // 分批并行执行
  for (let i = 0; i < batches.length; i += concurrency) {
    const chunk = batches.slice(i, i + concurrency)
    await Promise.all(chunk.map(processBatch))
  }

  // 按原始 ID 排序
  results.sort((a, b) => {
    const ai = typeof a.id === 'number' ? a.id : String(a.id)
    const bi = typeof b.id === 'number' ? b.id : String(b.id)
    return ai < bi ? -1 : ai > bi ? 1 : 0
  })

  return results
}
