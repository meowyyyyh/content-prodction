// ============================================================
// 内容生产智能体 POC — Express 后端服务
// ============================================================

import express from 'express'
import cors from 'cors'
import { CONFIG } from './config/index.js'
import { buildPrompt, callLLM, parseModuleResults } from './services/generator.js'
import { preBannedCheck, postCheck } from './services/compliance.js'

const app = express()

// 中间件
app.use(cors())
app.use(express.json({ limit: '10mb' }))

// 生产环境：如果 dist 目录存在则托管前端静态文件
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.join(__dirname, '..', 'dist')
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get('*', (_req, res) => { res.sendFile(path.join(distPath, 'index.html')) })
}

// ============================================================
// POST /api/generate
// 全量生成（指定模块列表）
// ============================================================
app.post('/api/generate', async (req, res) => {
  const { product, modules: requestedModules, focus } = req.body

  if (!product || !product.productName) {
    return res.status(400).json({
      success: false,
      error: '缺少必填参数：product.productName',
    })
  }

  const moduleKeys = requestedModules || ['hook', 'price', 'taste', 'trust', 'aftercare', 'tips', 'cta']

  try {
    // Step 1: pre_banned 合规扫描
    const inputText = `${product.productName} ${product.sellingPoints || ''} ${product.coreIngredients || ''}`
    const preCheck = preBannedCheck(inputText)

    if (!preCheck.passed) {
      return res.json({
        success: false,
        blocked: true,
        preBannedHits: preCheck.hits,
        error: `生成被阻断：检测到 ${preCheck.hits.length} 条高危违规内容`,
      })
    }

    // Step 2: 构建 Prompt
    const { systemPrompt, userPrompt } = buildPrompt({
      product,
      modules: moduleKeys,
      focus: focus || 'taste',
    })

    // Step 3: 调用 LLM
    const rawText = await callLLM({ systemPrompt, userPrompt })

    // Step 4: 解析结果
    const parsedResults = parseModuleResults(rawText, moduleKeys)

    // Step 5: post_check 合规扫描（对每个模块的输出）
    const modules = moduleKeys.map(key => {
      const content = parsedResults[key] || ''
      const complianceResult = postCheck(content)

      return {
        moduleKey: key,
        content,
        complianceHits: complianceResult.hits,
        hasWarning: complianceResult.hits.length > 0,
      }
    })

    // 拼接全文
    const fullText = modules
      .filter(m => m.content)
      .map(m => `## ${m.moduleKey}\n\n${m.content}`)
      .join('\n\n---\n\n')

    res.json({
      success: true,
      data: {
        productName: product.productName,
        style: product.style || 'xiaohongshu',
        modules,
        fullText,
      },
    })
  } catch (error) {
    console.error('生成失败:', error)

    if (error.name === 'AbortError') {
      return res.json({
        success: false,
        error: '生成超时，请稍后重试',
      })
    }

    res.json({
      success: false,
      error: error.message || '生成服务异常',
    })
  }
})

// ============================================================
// POST /api/generate/stream
// 流式生成 — SSE 逐字输出
// ============================================================
app.post('/api/generate/stream', async (req, res) => {
  const { product, modules: requestedModules, focus, images, isDefault } = req.body

  if (!product || !product.productName) {
    return res.status(400).json({ success: false, error: '缺少必填参数' })
  }

  const moduleKeys = requestedModules || ['hook', 'price', 'taste', 'trust', 'aftercare', 'tips', 'cta']

  // pre_banned
  const inputText = `${product.productName} ${product.sellingPoints || ''} ${product.coreIngredients || ''}`
  const preCheck = preBannedCheck(inputText)
  if (!preCheck.passed) {
    return res.json({ success: false, blocked: true, preBannedHits: preCheck.hits })
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  try {
    const { systemPrompt, userPrompt } = buildPrompt({ product, modules: moduleKeys, focus: focus || 'taste', images: images || [], isDefault: isDefault || false })
    const { endpoint, apiKey, model, maxTokens, temperature } = CONFIG.llm
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], max_tokens: maxTokens, temperature, stream: true }),
    })

    if (!response.ok) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: `API ${response.status}` })}\n\n`)
      res.end()
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') {
            res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
            continue
          }
          try {
            const parsed = JSON.parse(data)
            const content = parsed.choices?.[0]?.delta?.content
            if (content) {
              res.write(`data: ${JSON.stringify({ type: 'text', content })}\n\n`)
            }
          } catch { /* skip malformed */ }
        }
      }
    }
  } catch (error) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`)
  }
  res.end()
})

// ============================================================
// POST /api/chat/stream
// AI 对话微调 — 流式输出
// ============================================================
app.post('/api/chat/stream', async (req, res) => {
  const { instruction, modules: moduleList, history, targetModule } = req.body
  if (!instruction || !moduleList) {
    return res.status(400).json({ success: false, error: '缺少参数' })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const isSingleModule = !!targetModule

  const ctxParts = moduleList.map((m) => {
    const text = m.content?.replace(/<br\s*\/?>/gi, '\n').replace(/<\/?(div|p|h[1-6]|li|tr|section)[^>]*>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim() || '(空)'
    return isSingleModule ? text : `【${m.label}】\n${text}`
  })

  // 动态生成模块 key 列表和边界规则
  const MODULE_BOUNDARIES = {
    hook: '只写开篇钩子，不写价格',
    price: '只写价格福利，不写口感',
    taste: '只写口感体验，不写物流',
    trust: '只写基础信任，不写储存',
    aftercare: '只写物流售后，不写召唤',
    tips: '只写储存贴士，不写价格',
    cta: '只写行动召唤，不写配料',
    ingredient: '只写成分科普',
    origin: '只写原料溯源',
    brand: '只写品牌背书',
    scene: '只写场景共情',
    feedback: '只写用户反馈',
    comparison: '用分行文字呈现各平台价格对比，🔹开头逐条列平台价，✅开头突出团购价，纯文字不用标记语言',
    faq: '只写常见问题',
  }
  const allKeys = moduleList.map(m => m.key)
  const outKeys = targetModule ? [targetModule] : allKeys
  const outputFormat = outKeys.map(k => `===${k}===\n`).join('\n')
  const boundaryRules = outKeys.map(k => `   - ===${k}=== ${MODULE_BOUNDARIES[k] || '只写本模块内容'}`).join('\n')
  console.log('[chat/stream] 收到模块:', allKeys.join(', '), '| targetModule:', targetModule, '| 输出模块:', outKeys.join(', '))

  const instructionGuide = `## 指令执行指南（根据用户调整指令选择对应策略）
- 用户说"增加emoji" → **绝对禁止修改任何文字、格式、排版**，只插入emoji。用户对文案100%满意
- 用户说"结构化排版" → 在句末、段落间、话题转换处新增换行，让文案层次分明、阅读舒适。不改任何文字和emoji，只新增换行
- 用户说"口语化改写" → 将书面语改成口语化表达，像在跟朋友聊天，保留原意和关键信息，不改模块结构
- 用户说"精简压缩" → 删除冗余修饰词和重复内容，保持核心卖点不变，缩短篇幅但信息不丢
- 用户说"文字扩充" → 将当前文案篇幅扩充到原来的约2倍。增加更多感官细节、场景描写、使用体验，丰富原有卖点的展开程度。不添加原文没有的新信息或数据，只扩充已有内容的描写深度
- 用户说"强化卖点" → 放大价格优势、品质亮点、差异化特征，用更有冲击力的表达，不改基本事实
- 用户说"改写为日常闺蜜风" → 按日常闺蜜风改写：取消所有emoji锚点（只留3-5个），改为微信聊天口吻（"我跟你说""你别说"），用长句口语连接词，随口提价格不加感叹号，结尾不催单（"你看着办"），不做编号分段，不发话题标签
- 用户说"改写为简约功能风" → 按简约功能风改写：删除所有emoji，删除所有感叹号，删除所有形容词（很/非常/特别/真的），每句一行不超过25字，价格只写一行数字，参数用列表格式，结尾"以上。"或"供参考。"，禁用感性表达
- 用户说"改写为趣味风" → 按趣味风改写：大量加反差emoji（可三两个叠放），用脱口秀式结构（悬念→反转→安利→留梗），允许夸张比喻和自嘲，价格当笑点素材，结尾必须留梗（"懂的都懂""我妈以为我在搞批发"）
- 用户说"改写为小红书种草风" → 按小红书种草风改写：每段开头放1-2个功能emoji做视觉锚点，用"姐妹们！！"或"挖到宝了！！"高能量开头，反复强调价格优势并计算单份价，段落短促有力（每段1-2句），段间空行分隔，结尾必须带紧迫感或互动引导（"手慢真的会后悔👇""下方直接参团！"），语气热情高能量像在闺蜜群里安利
- 用户说"改写为资深团长风" → 按资深团长风改写：像做了5年团购的老用户在群里发消息，开门见山不铺垫（"直接说""这款我跟了3个月"），价格用算账式逐项列出（原价→团购价→省多少），emoji极度克制（全文最多2-3个点缀），每段不超过2句大量留白，结尾不催促（"下方直接参团，需要的自己拍""自己看着办"），禁止"姐妹们""绝了""疯了""手慢无"等小红书式表达

- 用户说"改写为高端大气风" → 按高端大气风改写：全文最多1个emoji（✨🍃🥂三选一），一句一段每句不超15字，大量换行留白，完全不提价格和数字（用描述性语言替代），禁止感叹号，禁止竞品对比，结尾用余韵收束（"细细品味。""好东西，不必多说。"）`


  const systemPrompt = `你是一个文案微调助手。用户会给你${isSingleModule ? '一个模块' : '当前笔记的各个模块'}的内容和一条调整指令。请根据指令修改${isSingleModule ? '该模块' : '对应模块'}的文案，然后严格按照以下格式输出。

## 核心原则：只改用户指定的内容
${isSingleModule ? `**本次你只需要处理 ===${targetModule}=== 这一个模块。只输出这一个模块的文案，不要输出其他任何模块。**` : `- 分析用户的指令，判断用户想修改的是哪个/哪些模块
- **只修改目标模块**，其他模块必须原样输出，一个字都不要改
- 不确定时，优先保守：只改最相关的1-2个模块`}

${instructionGuide}

## 输出格式（必须严格遵守）
${isSingleModule ? `只输出以下一个模块的标记和文案，不要输出其他模块：` : '按以下顺序，每个模块的标记使用英文key，必须覆盖全部模块：'}
${outputFormat}

## 排版要求（最高优先级，违反将导致输出无效）
- 输入文案中的每一个换行都必须原样保留在输出中，严禁合并行、严禁删除空行
- 保留原文中用户已经调整过的排版结构（如编号、分段、换行、缩进）
- 不要在用户没有要求的情况下改变排版格式

## Emoji专用规则（当用户指令包含"增加emoji"时，此项为最高优先级，覆盖所有其他规则）
1. **绝对禁止修改原文任何一个字、一个标点、一个换行、一个格式** —— 用户对当前文案100%满意，唯一操作是插入emoji。输出必须和原文逐字一致，仅多了emoji
2. 大胆加emoji：第一次8-12个，之后每次递增（10-15→15-20...）。短文案模块（如首屏钩子只有2-3句话）更要密集加：每句话首尾各放1-2个，句末叠2-3个，一句话塞4-6个也没问题。宁滥勿缺！
3. 允许emoji三五个挨着放（如"太绝了😋🔥💯✨💥"），大胆叠，不设限
4. 选贴合语境的emoji：食材🍓🍫🧀🥛、表情😋😍✨🔥💯、氛围🌟🎉💫👀、强调💥👊🎯、手势👈👉👍🙌

## 模块边界规则（最高优先级，违反将导致输出无效）
1. 每个模块的文案必须完全独立，严禁将其他模块的卖点、价格、配料、物流等信息写入当前模块
2. ===xxx=== 标记是模块的唯一边界，标记独占一行，前后不能有其他文字
3. 每个模块只写自己职责范围内的内容：
${boundaryRules}

## 严格规则
1. **【最高优先级】文案中严禁出现任何模块标题，以下词组一个字都不许出现在输出中：** 首屏钩子、价格福利、口感体验、基础信任、物流售后、储存贴士、行动召唤、成分科普、原料溯源、品牌背书、场景共情、用户反馈、全网比价、常见问题。同时严禁输出任何方括号【】[]、空[]、分隔符---、格式标记===、占位符[文案]。文案直接从正文第一个字开始。
2. 仅修改文案内容，不改变模块结构、数量和名称
${isSingleModule ? `3. 只输出 ===${targetModule}=== 这一个模块，禁止输出其他模块` : '3. 每个模块都必须输出（没改的模块输出原文，一个字不改）'}
4. 模块标记独占一行，标记前后不要添加额外文字

## 拒答规则
如果用户指令与文案调整无关，直接输出：===SKIP===\n抱歉，我只能帮您调整文案内容。`

  const historyBlock = history && history.length > 0
    ? `## 对话历史\n${history.map(h => `${h.role === 'user' ? '用户' : 'AI'}：${h.content}`).join('\n')}\n\n`
    : ''

  const userPrompt = `${historyBlock}## 当前文案（用真实换行展示，输出时也用真实换行）\n${ctxParts.join('\n\n')}\n\n## 调整指令\n${instruction}\n\n${isSingleModule ? `请严格遵循「只改用户指定的内容」原则，只输出 ===${targetModule}=== 这一个模块的文案。` : '请严格遵循「只改用户指定的内容」原则，输出所有模块的完整文案。'}`

  const { endpoint, apiKey, model, temperature } = CONFIG.llm

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], max_tokens: 8192, temperature: 0.7, stream: true }),
    })

    if (!response.ok) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: `API ${response.status}` })}\n\n`)
      res.end(); return
    }

    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let fullResponse = ''
    while (true) {
      const { done, value } = await reader.read(); if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n'); buffer = lines.pop() || ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6); if (data === '[DONE]') { res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`); continue }
          try {
            const parsed = JSON.parse(data); const content = parsed.choices?.[0]?.delta?.content
            if (content) { fullResponse += content; res.write(`data: ${JSON.stringify({ type: 'text', content })}\n\n`) }
          } catch { /* skip */ }
        }
      }
    }
    console.log('[chat/stream] AI原始返回 (' + (isSingleModule ? '单模块' : '全模块') + '):', fullResponse.slice(0, 300))
  } catch (error) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`)
  }
  res.end()
})

// ============================================================
// POST /api/extract — AI提取商品信息
// ============================================================
app.post('/api/extract', async (req, res) => {
  const { text } = req.body; if (!text) return res.status(400).json({ success: false })
  const { endpoint, apiKey, model } = CONFIG.llm
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, body: JSON.stringify({ model, messages: [{ role: 'system', content: '你是一个商品信息提取器。从文本中提取商品关键信息，只返回一个JSON对象。key固定为：productName,subCategory(dairy/snack/fresh_fruit/grain_oil/other),netWeight,origin,suggestedPrice(纯数字),sellingPoints(每行\\n分隔),coreIngredients,shippingTimeliness(24h/48h/72h/7d/custom),courier,afterSalesRules,brandBackground,targetAudience,usageScene。缺失字段用空字符串。' }, { role: 'user', content: text }], max_tokens: 800, temperature: 0.1 }), })
    const data = await response.json(); const content = data.choices?.[0]?.message?.content || '{}'
    try { res.json({ success: true, data: JSON.parse(content) }) } catch { res.json({ success: false, error: 'JSON解析失败', raw: content.slice(0,200) }) }
  } catch (e) { res.json({ success: false, error: e.message }) }
})

// ============================================================
// POST /api/generate/module
// 单模块重写
// ============================================================
app.post('/api/generate/module', async (req, res) => {
  const { product, moduleKey } = req.body

  if (!product || !moduleKey) {
    return res.status(400).json({
      success: false,
      error: '缺少必填参数',
    })
  }

  try {
    const { systemPrompt, userPrompt } = buildPrompt({
      ...product,
      modules: [moduleKey],
    })

    const rawText = await callLLM({ systemPrompt, userPrompt })
    const parsed = parseModuleResults(rawText, [moduleKey])
    const content = parsed[moduleKey] || rawText

    // post_check
    const complianceResult = postCheck(content)

    res.json({
      success: true,
      data: {
        moduleKey,
        content,
        complianceHits: complianceResult.hits,
        hasWarning: complianceResult.hits.length > 0,
      },
    })
  } catch (error) {
    console.error('单模块生成失败:', error)
    res.json({
      success: false,
      error: error.message || '生成服务异常',
    })
  }
})

// ============================================================
// GET /api/health
// 健康检查
// ============================================================
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ============================================================
// POST /api/images/match-corpus
// 语料库图片指纹匹配 — 上传图 vs 语料库
// ============================================================
app.post('/api/images/match-corpus', async (_req, res) => {
  try {
    const { hashes } = _req.body
    if (!hashes || !Array.isArray(hashes)) return res.json({ success: true, data: {} })

    const indexPath = path.resolve(__dirname, '../../data/rag/corpus_hashes.json')
    if (!fs.existsSync(indexPath)) return res.json({ success: true, data: {} })

    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
    const { hammingDistance } = await import('./services/corpus-hash.js')

    const matches = {}
    for (const { id, hash } of hashes) {
      let bestMatch = null; let bestDist = 99
      for (const [fileName, corpusHash] of Object.entries(index.hashes || {})) {
        const dist = hammingDistance(hash, corpusHash)
        if (dist < bestDist && dist <= 10) { bestDist = dist; bestMatch = fileName }
      }
      if (bestMatch && index.meta?.[bestMatch]) {
        matches[id] = { ...index.meta[bestMatch], matchedFile: bestMatch, distance: bestDist }
      }
    }
    res.json({ success: true, data: { matches, total: Object.keys(matches).length } })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

// ============================================================
// POST /api/images/classify
// 图片分类 + 描述（doubao-seed-2.0-lite）
// ============================================================
app.post('/api/images/classify', async (req, res) => {
  try {
    const { images } = req.body
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ success: false, error: '请提供图片数组' })
    }

    const { classifyImages } = await import('./services/vision.js')
    const results = await classifyImages(images)

    // 统计分类结果
    const summary = {}
    results.forEach(r => {
      summary[r.type] = (summary[r.type] || 0) + 1
    })

    res.json({ success: true, data: { results, summary, total: results.length } })
  } catch (e) {
    console.error('[api/images/classify] Error:', e.message)
    res.status(500).json({ success: false, error: e.message })
  }
})

// ============================================================
// GET /api/corpus/image-map
// 从语料库 JSON 统计图片类型 → 模块映射（L3 飞轮驱动）
// ============================================================
app.get('/api/corpus/image-map', (_req, res) => {
  try {
    const corpusDir = path.resolve(__dirname, '../../data/corpus')
    if (!fs.existsSync(corpusDir)) return res.json({ success: true, data: {} })

    // 递归找所有 .json 语料文件
    const map = {}
    function scan(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const e of entries) {
        if (e.isDirectory() && !e.name.startsWith('.')) scan(path.resolve(dir, e.name))
        else if (e.name.endsWith('.json')) {
          try {
            const data = JSON.parse(fs.readFileSync(path.resolve(dir, e.name), 'utf-8'))
            if (data.images) {
              for (const img of data.images) {
                const type = img.primaryType || img.type?.[0]
                const module = img.module
                if (!type || !module) continue
                if (!map[type]) map[type] = {}
                map[type][module] = (map[type][module] || 0) + 1
              }
            }
          } catch { /* skip invalid JSON */ }
        }
      }
    }
    scan(corpusDir)

    // 中文模块名 → 英文 key
    const moduleKeyMap = {
      '首屏钩子':'hook','价格福利':'price','口感体验':'taste','基础信任':'trust',
      '物流售后':'aftercare','储存贴士':'tips','行动召唤':'cta','成分科普':'ingredient',
      '原料溯源':'origin','品牌背书':'brand','场景共情':'scene','用户反馈':'feedback',
      '全网比价':'comparison','常见问题':'faq',
    }
    // 按频次排序，转为英文 key
    const sorted = {}
    for (const [type, modules] of Object.entries(map)) {
      sorted[type] = Object.entries(modules)
        .sort((a, b) => b[1] - a[1])
        .map(([m]) => moduleKeyMap[m] || m)
    }
    res.json({ success: true, data: sorted })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

// ============================================================
// 启动服务
// ============================================================

// ============================================================
// POST /api/corpus/save-to-review
// 导出/发布时自动存入预审语料库
// ============================================================
app.post("/api/corpus/save-to-review", (req, res) => {
  try {
    const { corpus, images } = req.body
    if (!corpus || !corpus.productName || !corpus.category) {
      return res.status(400).json({ success: false, error: "缺少必填字段" })
    }
    const { level1, level2, level3 } = corpus.category
    const productName = corpus.productName.replace(/[/\\?%*:|"<>]/g, "-")
    const dir = path.resolve(__dirname, `../../data/corpus-review/${level1}/${level2}/${level3}/${productName}`)
    fs.mkdirSync(dir, { recursive: true })

    fs.writeFileSync(path.join(dir, `${productName}.json`), JSON.stringify(corpus, null, 2))

    if (images && images.length > 0) {
      const imgDir = path.join(dir, "images")
      fs.mkdirSync(imgDir, { recursive: true })
      images.forEach(img => {
        const buf = Buffer.from(img.base64, "base64")
        fs.writeFileSync(path.join(imgDir, img.fileName), buf)
      })
    }

    res.json({ success: true, path: path.relative(path.resolve(__dirname, "../.."), path.join(dir, `${productName}.json`)) })
  } catch (e) {
    console.error("[api/corpus/save-to-review] Error:", e.message)
    res.status(500).json({ success: false, error: e.message })
  }
})

app.listen(CONFIG.port, () => {

  console.log(`🚀 内容生产智能体后端服务已启动：http://localhost:${CONFIG.port}`)
  console.log(`   POST /api/generate        - 全量生成`)
  console.log(`   POST /api/generate/module - 单模块重写`)
  console.log(`   GET  /api/health          - 健康检查`)
})
