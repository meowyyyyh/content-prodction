# 图片排版智能化方案：去掉 type 标签 + 语料反馈循环

> 版本：1.1 · 日期：2026-07-21 · 状态：Codex 已评审，待实施
>
> v1.1 变更：采纳 Codex 评审意见 — 新增 layout_role 兜底路由、buildCorpusJSON 段落拆分、suggestedModule 校验、风险表更新、工时修正

---

## 1. 背景与问题

### 1.1 现状

视觉模型（doubao-seed-2-0-mini）分析上传图片后返回以下字段：

| 字段 | 作用 | 问题 |
|------|------|------|
| `type` | 图片类型：封面图/产品图/配料表/场景图/品牌图/包装图/其他 | **食品类目专属**，跨类目无意义（数码家电没有"配料表"） |
| `suggestedModule` | 建议归属模块（hook/price/taste/...） | **未被用作主路由**，闲置（前端 `handleConfirmImages` 已部分使用，但 generator.js 和 buildCorpusJSON 未使用） |
| `layout_role` | 布局角色：hero/detail/scene/info/step | 已用于生成排版提示，但未被用作兜底路由 |
| `desc` / `imageContentSummary` / `imageOcrText` | 图片描述和文字信息 | 正常使用 |

`type` 在代码中的两处路由映射（generator.js + App.tsx）均为食品向硬编码：

```javascript
{ '封面图': ['hook'], '产品图': ['taste'], '配料表': ['trust', 'ingredient'],
  '场景图': ['scene'], '品牌图': ['brand'], '包装图': ['hook'], '其他': [] }
```

`type="其他"` 的图片直接丢失（映射到空数组）。

### 1.2 核心痛点

1. **运营上传大量图片（50-90张）**，没有时间逐张纠正 vision 的分类错误
2. **type 标签体系是食品类目定制的**，15 个类目无法通用
3. **模块内排版节奏全靠 AI 临场发挥**，无法达到手工标注语料的段落级精度
4. **语料库已存储了段落级图文排版数据**，但检索时只返回模块级，未充分利用
5. **`buildCorpusJSON` 只生成单段模块**（所有图+文压平为一个 segment），导出的语料天然缺少段落级结构，学习飞轮在段落层面断链

### 1.3 目标

运营扔 N 张图 → 自动分配到正确模块 → 模块内自动排出"什么时候配文字、什么时候几张图放一起、什么时候 pair、什么时候 stack"的节奏 → **效果接近手工标注语料** → 无需人工纠正 → 导出存语料 → 下次更准。

---

## 2. 方案总览

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  单趟 vision  │ → │   AI 生成     │ → │  运营编辑确认  │ → │  导出存语料    │
│  suggested   │    │  双层兜底路由  │    │  （基本不用改） │    │  按段落拆分    │
│  Module      │    │  1.suggested  │    │              │    │  多segment    │
│  layout_role │    │  2.layout_role│    │              │    │  存入语料库    │
└─────────────┘    └──────────────┘    └──────────────┘    └──────┬───────┘
                                                                 │
     ┌───────────────────────────────────────────────────────────┘
     ▼
┌──────────────┐
│  下次生成     │ ← 检索同类目历史笔记的段落级图文排版模式
│  排版更准     │
└──────────────┘
```

### 运营每天 12 条笔记 = 12 个高质量语料

- 一个月 250+ 语料（按 20 个工作日）
- 每条语料按段落拆分存储，自动捕获排版结构
- 同类目语料越多，段落级排版模式越精准

---

## 3. Phase 1：去掉 type，改用 suggestedModule + layout_role 双层路由（1 天）

### 3.1 核心设计：双层兜底路由

```
图片到达
  │
  ├─ 第1层：suggestedModule 有效且在已选模块列表中？
  │         → YES：直接路由到该模块
  │         → NO： 进入第2层
  │
  └─ 第2层：layout_role → module 映射（跨类目通用，不依赖 vision 返回具体模块名）
            hero   → 取已选模块中的首屏类模块（hook）
            detail → 取已选模块中的产品体验类模块（taste / texture / usage_experience）
            scene  → scene
            info   → trust / ingredient / ingredient_analysis
            step   → tutorial / usage_demo / install_guide
            → 找不到对应模块？兜底到已选模块列表中第一个非纯文字模块
```

关键改进：**不再兜底到 `tips`**。`layout_role` 提供的语义信息比 `tips` 精准得多，且跨全部 15 个类目通用。

### 3.2 改动清单

| 文件 | 改动内容 |
|------|----------|
| `app/server/services/vision.js` | 从 CLASSIFY_PROMPT 输出中**删除 `type` 字段**；保留 `suggestedModule`、`layout_role`、`desc`、`imageContentSummary`、`imageOcrText` |
| `app/server/services/generator.js` | 删除 `imageModuleMap`；实现双层兜底路由函数 `resolveImageModule(img, selectedModules)`；图片排版指令按新路由聚合 |
| `app/src/App.tsx` | 删除 `DEFAULT_TYPE_MAP`；`assignImages()` 使用相同双层路由逻辑；`buildCorpusJSON()` 不再写入 `type`/`primaryType` |
| `app/src/types/index.ts` | `ClassifiedImage` 接口：`type` 标记为 deprecated 或删除 |
| `app/src/components/ui/image-confirm-dialog.tsx` | 如有 `IMAGE_TYPE_OPTIONS` 下拉，改为 suggestedModule 编辑（或随 type 删除一并移除） |

### 3.3 详细改动

#### 3.3.1 vision.js — 删除 type 输出

```diff
- 1. type（图片类型）：封面图 / 产品图 / 配料表 / 场景图 / 品牌图 / 包装图 / 其他
-   定义—— ……

+ 不再输出 type 字段。图片路由由 suggestedModule（第1层）+ layout_role（第2层兜底）完成。

- {"type":"产品图","desc":"...","layout_role":"hero","imageContentSummary":"...","imageOcrText":"...","suggestedModule":"taste"}

+ {"desc":"...","layout_role":"hero","imageContentSummary":"...","imageOcrText":"...","suggestedModule":"taste"}
```

同时更新 classifyImage() 的兜底解析（L130-139），删除 type 提取逻辑，新增字段给默认值。

#### 3.3.2 generator.js — 双层兜底路由

新增 `resolveImageModule()` 函数（同时用于 generator.js 和 App.tsx）：

```javascript
/**
 * 双层兜底：suggestedModule → layout_role → 第一个非纯文字模块
 * @param {object} img — vision 返回的图片对象
 * @param {string[]} selectedModules — 当前已选模块列表
 * @returns {string} 目标模块 key
 */
function resolveImageModule(img, selectedModules) {
  // 第1层：suggestedModule
  const sug = img.suggestedModule
  if (sug && selectedModules.includes(sug)) return sug

  // 第2层：layout_role → module
  const role = img.layout_role || 'detail'
  const ROLE_MODULE_MAP = {
    hero:   ['hook'],
    detail: ['taste', 'texture', 'usage_experience', 'wear_experience', 'design_detail'],
    scene:  ['scene', 'home_styling', 'kitchen_styling'],
    info:   ['trust', 'ingredient', 'ingredient_analysis', 'specs', 'tech_specs'],
    step:   ['tutorial', 'usage_demo', 'install_guide', 'assembly_guide'],
  }
  const candidates = ROLE_MODULE_MAP[role] || []
  for (const c of candidates) {
    if (selectedModules.includes(c)) return c
  }

  // 兜底：第一个非纯文字模块
  const TEXT_ONLY_MODULES = new Set(['aftercare', 'tips', 'cta', 'faq', 'feedback', 'price', 'rights_list', 'plan_compare', 'validity_rules', 'support_policy'])
  for (const m of selectedModules) {
    if (!TEXT_ONLY_MODULES.has(m)) return m
  }

  // 终极兜底
  return selectedModules[0] || 'tips'
}
```

生成时的图片→模块聚合（替换原 L234-249）：

```diff
- const imageModuleMap = { '封面图': ['hook'], '产品图': ['taste'], ... }
  if (images && images.length > 0) {
    const moduleImages = {}
    for (const img of images) {
-     const targets = imageModuleMap[img.type] || ['tips']
+     const target = resolveImageModule(img, modules)
+     const targets = [target]
      for (const mod of targets) {
        if (modules.includes(mod)) {
          if (!moduleImages[mod]) moduleImages[mod] = []
          moduleImages[mod].push(img)
        }
      }
    }
    // … 后续排版指令注入不变
  }
```

#### 3.3.3 App.tsx — 导出时图片分配

`assignImages()` 使用相同的 `resolveImageModule()`：

```diff
- const DEFAULT_TYPE_MAP = { '产品图': ['taste'], '封面图': ['hook'], … }
- function assignImages(images, typeMap) { … }
+ function assignImages(images, selectedModules) {
+   const map = new Map()
+   for (const img of images) {
+     const target = resolveImageModule(img, selectedModules)
+     if (!map.has(target)) map.set(target, [])
+     map.get(target).push(img)
+   }
+   return map
+ }
```

`buildCorpusJSON()` 中 images 数组不再写入 type/primaryType：

```diff
  {
    id, file: `images/${fileName}`,
-   type: [img.type], primaryType: img.type, module: '',
+   module: img.suggestedModule || '',
    desc, layout_role, imageContentSummary, imageOcrText, suggestedModule
  }
```

---

## 4. Phase 2：增强语料检索 + buildCorpusJSON 段落拆分（2-3 天）

### 4.1 核心思路

**两件事同时做**：检索端返回段落级模式，写入端产出多 segment 语料。

```
                 ┌──────────────────────────┐
                 │     buildCorpusJSON       │
                 │  按 \n\n 拆分文本为段落     │
                 │  图片按顺序分配到各段        │
                 │  产生 3-5 个 segments      │
                 └──────────┬───────────────┘
                            │ 导出
                            ▼
                 ┌──────────────────────────┐
                 │     语料库 (v2.2)          │
                 │  segments[] 有真正的多段落  │
                 └──────────┬───────────────┘
                            │ 下次生成检索
                            ▼
                 ┌──────────────────────────┐
                 │  retrieveCorpusSegment    │
                 │  Patterns()               │
                 │  返回段落级排版模式         │
                 └──────────┬───────────────┘
                            │ 注入 prompt
                            ▼
                 ┌──────────────────────────┐
                 │         AI 生成            │
                 │  严格按段落模式排版          │
                 └──────────────────────────┘
```

### 4.2 改动文件

| 文件 | 改动内容 |
|------|----------|
| `app/server/services/generator.js` | `loadV2CorpusIndex()`：新增段落模式索引；新增 `retrieveCorpusSegmentPatterns()`；`buildPrompt()`：注入段落级排版参考；导出 `resolveImageModule` 供前端复用 |
| `app/src/App.tsx` | `buildCorpusJSON()`：按 `\n\n` 拆分文本为多段；图片按顺序分配到各段；每段独立一个 segment |

### 4.3 buildCorpusJSON 段落拆分

**当前（单段）**：

```javascript
// 所有文本和图片压平到一个 segment
const segment = {
  text, textType: `${key}_main`,
  images: segImages,  // 全部图片
  binding: segImages.length > 0 ? 'image_before_text' : 'no_image'
}
```

**改进后（多段）**：

```javascript
// 按双换行拆分文本段落
const paragraphs = text.split(/\n{2,}/).filter(p => p.trim())
// 将图片均匀分配到各段（按段落权重分配）
const segImages = distributeImages(imgs, paragraphs)

const segments = paragraphs.map((para, i) => {
  const pImages = segImages[i] || []
  return {
    text: para,
    textType: i === 0 ? `${key}_intro` : i === paragraphs.length - 1 ? `${key}_summary` : `${key}_detail`,
    images: pImages.map(img => ({
      imgId: classifiedImages.findIndex(ci => ci.id === img.id) + 1,
      group: pImages.length === 2 ? 'pair' : 'stack',
      role: img.desc || `图${i + 1}`,
      position: 'before_text',
      relationship: img.imageContentSummary || ''
    })),
    binding: pImages.length > 0 ? 'image_before_text' : 'no_image'
  }
})
```

**图片分配策略**：按段落长度比例分配图片。如果 AI 在文本中提到了图片编号（如"图18展示了…"），则将该图片分配到对应段落。

### 4.4 索引增强

在 `loadV2CorpusIndex()` 中新增段落模式索引：

```javascript
// 新增：段落级排版模式索引
v2CorpusIndex.segmentPatterns = []

for (const mod of data.modules) {
  // … 现有 module 级索引 …

  // 新增：提取段落级模式（仅多 segment 的模块）
  if (mod.segments && mod.segments.length > 1) {
    v2CorpusIndex.segmentPatterns.push({
      categoryLevel3: level3,
      moduleKey: mod.moduleKey,
      segmentCount: mod.segments.length,
      imageCount: mod.layout?.imageCount || 0,
      segments: mod.segments.map(seg => ({
        hasText: (seg.text || '').trim().length > 0,
        imageCount: (seg.images || []).length,
        groupMode: seg.images?.length > 0
          ? [...new Set(seg.images.map(i => i.group).filter(Boolean))]
          : [],
        binding: seg.binding,
        textType: seg.textType || ''
      }))
    })
  }
}
```

### 4.5 检索函数

```javascript
function retrieveCorpusSegmentPatterns(categoryLevel3, moduleKey, topK = 5) {
  const index = loadV2CorpusIndex()
  if (!index || !index.segmentPatterns) return null

  const matches = index.segmentPatterns
    .filter(p => p.categoryLevel3 === categoryLevel3 && p.moduleKey === moduleKey)

  if (matches.length === 0) return null

  // 聚类：按段落数+图片数分组，统计频率
  const clusters = {}
  for (const m of matches) {
    const key = `${m.segmentCount}段_${m.imageCount}图`
    if (!clusters[key]) clusters[key] = { count: 0, pattern: m }
    clusters[key].count++
  }

  return Object.values(clusters)
    .sort((a, b) => b.count - a.count)
    .slice(0, topK)
    .map(c => c.pattern)
}
```

### 4.6 Prompt 注入

在 `buildPrompt()` 的 V2 语料区块中，用段落级模式增强提示：

```
## 图文排版参考（语料驱动 — 段落级）

以下是从「乳制品」类目优秀笔记中提取的精确图文排版模式。
请严格参考每段的图片数量和排列方式，不要自己随意发挥。

### taste 模块（5篇参考）

模式1（出现3次）— 4段文字，14张图：
  - 段1（总述）：纯文字，无图
  - 段2（第一口感）：2张图，pair排列，放在文字前
  - 段3（第二口感）：5张图，stack排列，放在文字前
  - 段4（余韵/总结）：6张图，stack排列，放在文字前

模式2（出现1次）— 3段文字，8张图：
  - 段1：1张 hero 大图，放在文字后
  - 段2：纯文字
  - 段3：纯文字

请优先采用模式1（出现频率最高）。如果当前商品图片数量与模式不匹配，
选择段数和图量最接近的模式进行调整。
```

冷启动（同类目无语料）时使用默认规则：`layout_role` = hero → 放模块开头全宽，detail → 2-4张分组配文字描述旁，scene → 独立段落配场景描述，info → 小图嵌入相关段落，step → 横向连排。

---

## 5. 学习飞轮：为什么越用越准

### 5.1 三层学习

```
┌─────────────────────────────────────────────┐
│  Layer 3: 语料反馈循环（Phase 2 增强）        │
│  buildCorpusJSON 按段落拆分 → 多 segment 入语料 │
│  → 下次检索返回段落级模式 → AI 精确模仿         │
│  冷启动: layout_role 默认规则                  │
│  30天后: 精确到每段几张图、pair还是stack        │
├─────────────────────────────────────────────┤
│  Layer 2: suggestedModule + layout_role      │
│  双层兜底路由，跨15个类目通用                    │
│  即使无任何语料，也能给出合理的初始排版           │
├─────────────────────────────────────────────┤
│  Layer 1: AI 自身判断                         │
│  读图 desc + 文案内容 → 精确匹配图文关系          │
│  "描述拉丝效果 → 旁边放倒出瞬间的图"              │
└─────────────────────────────────────────────┘
```

### 5.2 具体学习路径：以乳制品 taste 模块为例

| 时间 | 语料数 | 语料状态 | 检索返回 | AI 排版效果 |
|------|--------|----------|----------|-------------|
| Day 1 | 0 | 无历史 | 无数据 | 靠 layout_role 默认规则：detail图堆模块开头 |
| Day 5 | ~5 | 每个 taste 模块 3-4 段 | 1-2种模式，低频 | AI 参考段落结构输出：段1无图、段2配2图pair… 运营少量调整 |
| Day 15 | ~15 | 15个多段语料 | 3-4种模式，频次明确 | AI 严格按高频模式排版，运营基本不用改 |
| Day 30 | ~30 | 30个多段语料 | 5+种模式 | AI 能区分不同产品类型的排版差异，运营无感 |

> **注意**：Day 1 导出的语料仅有 module-level 价值（imageCount/density/overallPattern）。从 Day 2 开始，`buildCorpusJSON` 按段落拆分，后续导出的语料逐步积累段落级结构。一周后语料库中已有相当数量的多段语料可用。

### 5.3 跨类目扩展

每个类目独立积累语料。双层兜底路由确保即使新类目零语料，冷启动排版也不会太差：

- 美食酒水（已有语料）：Day 1 即受益于段落级模式
- 美妆洗护（新增）：Day 1 靠 layout_role 默认规则 + suggestedModule，积累 2 周后段落级模式追上
- 数码家电（新增）：vision 的 suggestedModule 返回 taste → 校验发现数码家电无 taste → layout_role=detail → 路由到 usage_experience。全程无需人工干预

---

## 6. 语料 Schema 变更（v2.1 → v2.2）

### 6.1 images[] 字段变更

| 字段 | v2.1 | v2.2 | 说明 |
|------|------|------|------|
| `type` | string[], 必填 | **废弃** | 新语料不再写入；旧语料保留不删 |
| `primaryType` | string, 必填 | **废弃** | 同上 |
| `module` | string, 必填 | string, 必填 | 保持，值为 suggestedModule 的目标模块 |
| `suggestedModule` | 无 | **新增**, string | vision 返回的原始建议值 |
| 其他字段 | — | 不变 | desc、layout_role、imageContentSummary、imageOcrText 保持 |

### 6.2 modules[].segments 变化

| 变化 | v2.1 | v2.2 |
|------|------|------|
| 自动导出 | 1 个 segment，全部图+文压平 | **N 个 segment**，按 `\n\n` 拆分，图片按比例分配 |
| 手工标注 | N 个 segment | 不变，保持原有精度 |

### 6.3 向后兼容

- `loadV2CorpusIndex()` 扫描时检查 segments 数量，单段和多段语料均可正常索引
- `import_corpus.cjs` 读取时不依赖 type 字段（当前就不依赖），无需改动
- 旧语料的 `type` 字段保留不删

---

## 7. 风险与对策

| 风险 | 严重程度 | 对策 |
|------|----------|------|
| suggestedModule 错误 → 图片路由到错模块 | **高** | 双层兜底：suggestedModule 不在已选模块列表 → `layout_role` 映射接管 |
| auto-segmentation 质量不稳定（\n\n 拆分可能不合理） | **中** | 段落级语料是"增量优化"而非"唯一依赖"；AI 仍会结合图片 desc 做最终判断；运营导出时看到排版结果即为确认 |
| mini 模型 suggestedModule 准确率不足 | **中** | 双层兜底减轻影响；同类目语料积累后排版模式学习不依赖单张路由精度 |
| 语料冷启动（新类目零语料） | **低** | layout_role 默认规则跨类目通用，冷启动效果合理 |
| suggestedModule 值不存在于当前类目模块列表 | **中** | 第1层兜底自动捕获（不在列表中 → 走 layout_role）；vision prompt 可选值保持通用 |
| auto-segmentation 图片分配不精准 | **低** | 图片分配按段落长度权重；后续 AI 生成时可自行微调 |
| 导出语料嵌入 vision 错误 → 下次检索强化错误 | **中** | 错误分散在多次导出中（每篇笔记独立），不会集中放大；模块级统计聚类天然抗噪 |

---

## 8. 测试计划

### 8.1 单元测试

| 测试对象 | 测试内容 |
|----------|----------|
| `resolveImageModule()` | 各层兜底逻辑：suggestedModule 命中/缺失/错误 → layout_role 命中/缺失 → 兜底模块 |
| `distributeImages()` | 图片均匀分配到段落；边界情况（0图、1段、图多于段） |
| vision parse fallback | 模型返回畸变 JSON 时各字段正确给默认值 |

### 8.2 集成测试

| 场景 | 测试内容 |
|------|----------|
| 食品类目 90 张图 | suggestedModule 正常时路由正确；产生多 segment 语料 |
| 数码家电类目 20 张图 | suggestedModule 无效时 layout_role 接管；不产生 type 字段 |
| 新类目（无语料） | 冷启动靠 layout_role 默认规则，生成结果合理 |
| 导出→再生成 | 导出的语料在下次生成中被检索到，排版模式被引用 |

---

## 9. 实施计划

| 阶段 | 内容 | 工时 | 依赖 |
|------|------|------|------|
| Phase 1a | vision.js + generator.js 改动（双层路由 + 去 type） | 0.5 天 | 无 |
| Phase 1b | App.tsx 改动（assignImages + buildCorpusJSON type 移除）+ 类型更新 | 0.5 天 | Phase 1a |
| Phase 2a | buildCorpusJSON 段落拆分 | 1 天 | Phase 1 |
| Phase 2b | 语料检索段落级增强 + prompt 注入 | 1 天 | Phase 2a |
| 测试 | 单元测试 + 多类目集成测试 | 0.5-1 天 | Phase 1+2 |
| **合计** | | **3.5-4 天** | |

---

## 10. 附录：改动文件清单

```
app/server/services/vision.js                     # 删除 type 输出，更新兜底解析
app/server/services/generator.js                   # 新增 resolveImageModule()；删除 imageModuleMap；
                                                   #   增强 loadV2CorpusIndex() 段落索引；
                                                   #   新增 retrieveCorpusSegmentPatterns()；
                                                   #   buildPrompt() 注入段落级排版参考
app/src/App.tsx                                    # 删除 DEFAULT_TYPE_MAP；
                                                   #   assignImages() 使用双层路由；
                                                   #   buildCorpusJSON() 段落拆分 + 删除 type 字段
app/src/types/index.ts                             # ClassifiedImage: type 标记 deprecated
app/src/components/ui/image-confirm-dialog.tsx      # 如有 IMAGE_TYPE_OPTIONS 下拉，删除或切换为 suggestedModule
data/rag/import_corpus.cjs                         # 确认不依赖 type（无需改动，验证即可）
app/docs/语料标注-schema-v2.md                     # 更新至 v2.2，标注 type/primaryType 废弃
```

---

## 11. Codex 评审记录（2026-07-21）

**结论**：有条件认可。

**关键发现**：
1. `buildCorpusJSON` 只生成单 segment——段落级学习飞轮断链 → v1.1 新增段落拆分
2. `tips` 兜底太弱 → v1.1 改为 layout_role 双层路由
3. suggestedModule 值空间（13个）vs 实际模块（60+）不匹配 → v1.1 新增校验逻辑

**工时修正**：原估算 0.5 + 1-2 = 2-3 天 → 修正为 1 + 2-3 = 3.5-4 天
