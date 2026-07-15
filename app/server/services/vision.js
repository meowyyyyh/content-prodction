// ============================================================
// 视觉模型服务 — doubao-seed-2.0-lite
// 图片分类 + 一句话描述
// ============================================================

import { CONFIG } from '../config/index.js'

const { endpoint, apiKey, model, temperature, maxTokens, timeout } = CONFIG.vision

const CLASSIFY_PROMPT = `请判断这张图片属于以下哪种类型，并给出一句简短描述。

类型选项：产品图、配料表、场景图、品牌图、包装图、其他

- 产品图 = 展示商品本身的照片（含产品特写、多角度展示）
- 配料表 = 配料表或营养成分表的截图
- 场景图 = 商品在生活场景中使用的照片（办公桌、餐桌、户外等）
- 品牌图 = 品牌logo、门店、工厂、证书、代言人
- 包装图 = 外包装、礼盒、快递箱
- 其他 = 以上都不是

请严格按以下JSON格式返回，不要输出其他内容：
{"type":"产品图","desc":"白色酸奶瓶，绿色标签，木姜子+香茅口味"}`

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
    max_tokens: maxTokens,
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
      desc: result.desc || ''
    }
  } catch {
    // 兜底：尝试从文本中提取 type
    const typeMatch = content.match(/产品图|配料表|场景图|品牌图|包装图|其他/)
    return {
      type: typeMatch ? typeMatch[0] : '其他',
      desc: content.replace(/\{|\}|"type"|"desc"|:/g, '').trim()
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
