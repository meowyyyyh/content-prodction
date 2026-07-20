# 语料标注 Schema v2.0

> 定义语料库图文绑定标注的 JSON 数据格式，支持 AI 结构克隆图文排版。
> 版本：2.0 · 发布日期：2026-07-17

---

## 目录

1. [核心变化](#核心变化)
2. [根级字段](#根级字段)
3. [category（类目）](#category类目)
4. [modules（模块列表）](#modules模块列表)
5. [module.layout（模块级排版元信息）](#modulelayout模块级排版元信息)
6. [segments（图文段落序列）](#segments图文段落序列)
7. [imageGroups（图组）](#imagegroups图组)
8. [images（图片清单）](#images图片清单)
9. [完整 JSON 示例](#完整-json-示例)
10. [和 v1 的兼容性](#和-v1-的兼容性)

---

## 核心变化

| 变化 | 说明 |
|------|------|
| `version` / `schema` | 新增，支持版本迭代和未来迁移 |
| `styleTag` | 新增，标注所属文案风格（xiaohongshu / girlfriend / senior / minimalist / fun / premium） |
| `imageContentSummary` | **关键新增**。记录图片中已包含的文字/数字/视觉信息，帮助 AI 避免图文冗余 |
| `module.layout.overallPattern` | 新增，描述模块整体排版模式 |
| `module.layout.density` | 新增，图密度等级 |
| 品类路径 | 改用 app 标准三级类目（level1 / level2 / level3），废弃旧的自定义品类 |

---

## 根级字段

```json
{
  "version": "2.0",
  "schema": "corpus-图文绑定-v2",
  "productName": "认养一头牛 每日吨吨木姜子香茅益生菌酸奶",
  "sourceNote": "来源: 认养一头牛 每日吨吨木姜子香茅益生菌酸奶"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `version` | string | 是 | 标注格式版本号，当前 `"2.0"` |
| `schema` | string | 是 | Schema 标识，固定 `"corpus-图文绑定-v2"` |
| `productName` | string | 是 | 商品名称 |
| `sourceNote` | string | 否 | 来源说明，如 "来源: XXX" |

---

## category（类目）

使用 app 标准三级类目结构，与 `src/data/categories.ts` 一致。

```json
{
  "category": {
    "level1": "美食酒水",
    "level2": "酒水饮料",
    "level3": "乳制品"
  }
}
```

| 字段 | 说明 |
|------|------|
| `level1` | 一级类目，如 "美食酒水"、"数码家电" 等 |
| `level2` | 二级类目，如 "酒水饮料"、"休闲美食" 等 |
| `level3` | 三级类目（最细粒度），如 "乳制品"、"饼干冻干" 等 |

> 完整的类目数据见 `src/data/categories.ts`。标注工具应提供类目选择器，确保与 app 类目一致。

---

## modules（模块列表）

```json
{
  "modules": [
    {
      "moduleKey": "hook",
      "moduleName": "首屏钩子",
      "order": 1,
      "layout": { ... },
      "segments": [ ... ],
      "imageGroups": { ... }
    }
  ]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `moduleKey` | string | 是 | 模块标识，与 app 中的 ModuleKey 对应（hook / price / taste / trust / aftercare / tips / cta / ingredient / origin / brand / scene / feedback / comparison / faq） |
| `moduleName` | string | 是 | 模块中文名称 |
| `order` | number | 是 | 模块在笔记中的顺序（从 1 开始） |
| `layout` | object | 是 | 模块级排版元信息 |
| `segments` | array | 是 | 图文段落序列（保留原始文案的段落划分和图片插入位置） |
| `imageGroups` | object | 否 | 图组（描述大图区的排版意图，如模块开头/结尾的图墙） |

---

## module.layout（模块级排版元信息）

```json
{
  "layout": {
    "overallPattern": "images_interspersed",
    "imageCount": 14,
    "textSegmentCount": 4,
    "density": "high"
  }
}
```

### overallPattern（整体排版模式）

| 枚举值 | 含义 | 典型场景 |
|--------|------|----------|
| `images_only` | 纯图模块，无文案 | 品牌背书、原料溯源中的大片图墙 |
| `image_before_text` | 图在文前 | 基础信任（配料表截图在前，解析在后） |
| `image_after_text` | 图在文后 | 首屏钩子（文案在前，产品图在后） |
| `images_interspersed` | 图文穿插 | 口感体验（图文交替出现，节奏感强） |
| `image_header_only` | 仅模块开头有图 | 成本科普（开头科普图，后面纯文字） |
| `image_footer_only` | 仅模块结尾有图 | 品牌背书（一句文案 → 27 张品牌图堆叠） |
| `text_only` | 纯文字无图 | 价格福利、物流售后、储存贴士 |
| `mixed` | 混合模式（不适用以上单一模式） | 复杂模块 |

### density（图密度）

| 枚举值 | 含义 | 参考标准 |
|--------|------|----------|
| `high` | 高密度 | 每段文字配 ≥2 张图，或图片占据 > 60% 面积 |
| `medium` | 中密度 | 每段文字配 1 张图，或图片占 30%-60% |
| `low` | 低密度 | 整个模块 1-3 张图，或图片占 < 30% |
| `none` | 无图 | 纯文字模块 |

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `overallPattern` | string | 是 | 整体排版模式 |
| `imageCount` | number | 是 | 该模块总图片数 |
| `textSegmentCount` | number | 是 | 该模块文字段落数 |
| `density` | string | 是 | 图密度等级 |

---

## segments（图文段落序列）

segments 保留文案的原始段落划分，并精确标记每段配图情况。

```json
{
  "segments": [
    {
      "text": "🍋三重味觉一口惊艳，酸奶也能喝出前中后调～",
      "textType": "taste_intro",
      "images": [],
      "binding": "no_image"
    },
    {
      "text": "😎第一口是清新香茅的明亮开场，清爽草香气，瞬间打开味蕾～",
      "textType": "taste_first_sip",
      "images": [
        {
          "imgId": 18,
          "group": "stack",
          "role": "瓶身特写",
          "position": "before_text",
          "relationship": "图片展示产品外观 → 文字描述开瓶第一印象"
        }
      ],
      "binding": "image_before_text"
    }
  ]
}
```

### textType（文本语义类型）

用于标注该段文案的"角色"，帮助 AI 理解不同位置的文本功能。建议的语义类型（可根据具体模块扩展）：

| moduleKey | 建议 textType 枚举 |
|-----------|-------------------|
| hook | `hook_opening`（钩子开场）、`hook_benefit`（利益点）、`hook_price`（价格信息） |
| taste | `taste_intro`（味觉总述）、`taste_first_sip`（第一口）、`taste_second`（第二口）、`taste_third`（第三口/余韵）、`taste_summary`（总结） |
| trust | `trust_ingredient`（配料清单）、`trust_claim`（无添加承诺）、`trust_data`（数据支撑） |
| scene | `scene_scenario`（单个场景）、`scene_summary`（场景总结） |
| brand | `brand_intro`（品牌介绍）、`brand_cert`（认证/数据） |
| ingredient | `ingredient_qa`（提问引入）、`ingredient_explain`（科普解释）、`ingredient_data`（具体数据） |

### position（图片相对文案位置）

| 枚举值 | 含义 |
|--------|------|
| `before_text` | 图片在对应文案之前 |
| `after_text` | 图片在对应文案之后 |
| `around_text` | 图片环绕/包裹文案 |
| `no_image` | 无配图 |

### binding（图文绑定类型）

| 枚举值 | 含义 |
|--------|------|
| `image_before_text` | 先图后文 |
| `image_after_text` | 先文后图 |
| `no_image` | 无相关图片 |
| `image_embedded` | 图片嵌入文字中（图文混排） |

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `text` | string | 是 | 文案内容（保留原文、emoji、换行） |
| `textType` | string | 否 | 语义类型标记（建议填写，有助于 AI 学习） |
| `images` | array | 是 | 该段文案的配图列表，无图为空数组 `[]` |
| `images[].imgId` | number | 否 | 图片 ID，关联到 images 数组 |
| `images[].group` | string | 否 | 排版方式：`stack` / `pair` / `grid` |
| `images[].role` | string | 否 | 图片角色描述 |
| `images[].position` | string | 否 | 图对文的位置 |
| `images[].relationship` | string | 否 | 图文关系注释（"图片 X → 文字 Y"） |
| `binding` | string | 是 | 绑定类型 |

---

## imageGroups（图组）

用于在模块级别描述大图区的排版意图，与 segments 级别的图信息互补。segments 描述"逐段的精确图位"，imageGroups 描述"整体的排版意图"。

```json
{
  "imageGroups": {
    "header": {
      "imgIds": [18, 19, 20],
      "group": "stack",
      "desc": "开篇视觉冲击：瓶身展示+使用场景"
    },
    "footer": {
      "imgIds": [26, 27, 28, 29, 30, 31],
      "group": "stack",
      "desc": "收尾视觉：包装细节+饮用场景"
    }
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `header` | object or null | 否 | 模块开头的大图区。无则为 `null` |
| `header.imgIds` | number[] | 是 | 该图组包含的图片 ID 列表 |
| `header.group` | string | 是 | 排版方式：`stack` / `pair` / `grid` |
| `header.desc` | string | 否 | 图组意图描述 |
| `footer` | object or null | 否 | 模块结尾的大图区。无则为 `null` |
| `footer.imgIds` | number[] | 是 | 同 header |
| `footer.group` | string | 是 | 同 header |
| `footer.desc` | string | 否 | 同 header |

> **注意**：segments 中的 images 字段描述"逐段的精确图位"，imageGroups 描述"整体的排版意图"。两者可共存：segments 精确到每段，imageGroups 归纳大图区。

---

## images（图片清单）

```json
{
  "images": [
    {
      "id": 1,
      "file": "images/image001.png",
      "desc": "产品封面图，含产品+价格+卖点标签",
      "type": ["封面图", "产品图"],
      "primaryType": "封面图",
      "module": "首屏钩子",
      "layout_role": "hero",
      "imageContentSummary": "图中包含文字信息：'79.9元'、'12瓶'、'送3瓶原味款'、'单瓶低至5.3元'、'9种活性益生菌'、'A2生牛乳'、'清洁配方'。视觉上以产品瓶身为主体，绿色标签突出'木姜子香茅'风味名称。"
    }
  ]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | number | 是 | 图片编号，自 1 开始递增 |
| `file` | string | 是 | 图片文件路径（相对于语料目录） |
| `desc` | string | 是 | 一句话描述（vision 自动生成 + 人工确认） |
| `type` | string[] | 是 | 图片类型列表（封面图/产品图/配料表/场景图/品牌图/包装图/其他） |
| `primaryType` | string | 是 | 主要类型 |
| `module` | string | 是 | 归属模块中文名 |
| `layout_role` | string | 否 | 布局角色：`hero` / `detail` / `scene` / `info` / `step` |
| `imageContentSummary` | string | **强烈建议** | 图片内容摘要。记录图中展示的文字、数字、视觉信息。vision 自动提取 + 标注者确认/修改 |

### imageContentSummary 的填写规范

**核心原则**：写下"如果 AI 看不到这张图本身，它就无法知道的东西"。

| 类别 | 应该写的内容 | 示例 |
|------|-------------|------|
| 文字信息 | 图中包含的所有关键文字、价格数字、规格、卖点标签 | "图中展示'79.9元 12瓶 送3瓶'，品牌名'认养一头牛'" |
| 数据标识 | 图表中的数字、百分比、营养成分数值 | "配料表显示：生牛乳含量≥88%，9种活性益生菌" |
| 视觉特征 | 图片的主要视觉元素（不要写"一张图上有…"） | "白色酸奶瓶，绿色标签，瓶身正面展示产品名称和风味" |
| 不重复的信息 | 不要写可从 type/desc 推断的内容 | 已有 type="产品图" + desc="产品封面" 时，不需要再写"这是一张产品图" |

**标注示例**：

```
好的 imageContentSummary：
"图中包含文字信息：'79.9元'、'12瓶'、'送3瓶'、'单瓶低至5.3元'。
视觉上以产品瓶身为主体，绿色标签突出'木姜子香茅'风味名称。
卖点标签展示：'9种活性益生菌 A2生牛乳 清洁配方'"

不好的 imageContentSummary：
"这是一张封面图，展示了产品外观。"（太笼统，没有具体信息）
"产品图"（和 type 字段重复）
```

---

## 完整 JSON 示例

```json
{
  "version": "2.0",
  "schema": "corpus-图文绑定-v2",
  "productName": "认养一头牛 每日吨吨木姜子香茅益生菌酸奶",
  "sourceNote": "来源: 认养一头牛 每日吨吨木姜子香茅益生菌酸奶",
  "category": {
    "level1": "美食酒水",
    "level2": "酒水饮料",
    "level3": "乳制品"
  },
  "styleTag": "xiaohongshu",
  "modules": [
    {
      "moduleKey": "taste",
      "moduleName": "口感体验",
      "order": 3,
      "layout": {
        "overallPattern": "images_interspersed",
        "imageCount": 14,
        "textSegmentCount": 4,
        "density": "high"
      },
      "segments": [
        {
          "text": "🍋三重味觉一口惊艳，酸奶也能喝出前中后调～",
          "textType": "taste_intro",
          "images": [],
          "binding": "no_image"
        },
        {
          "text": "😎第一口是清新香茅的明亮开场，清爽草香气，瞬间打开味蕾～",
          "textType": "taste_first_sip",
          "images": [
            {
              "imgId": 18,
              "group": "stack",
              "role": "瓶身特写：木姜子香茅酸奶正面展示",
              "position": "before_text",
              "relationship": "图片展示产品外观 → 文字描述开瓶的第一印象"
            }
          ],
          "binding": "image_before_text"
        },
        {
          "text": "😍第二口是木姜子的清爽柠檬香，伴随淡淡辛香，带给舌尖上的惊喜感～",
          "textType": "taste_second",
          "images": [
            {
              "imgId": 19,
              "group": "pair",
              "role": "倒出瞬间的拉丝效果",
              "position": "before_text",
              "relationship": "左图倒出瞬间拉丝 + 右图浓稠质地 → 文字描述口感和质地"
            },
            {
              "imgId": 20,
              "group": "pair",
              "role": "勺子舀起的浓稠质地",
              "position": "before_text",
              "relationship": "左图倒出瞬间拉丝 + 右图浓稠质地 → 文字描述口感和质地"
            }
          ],
          "binding": "image_before_text"
        },
        {
          "text": "😋最后是醇厚生牛乳的醇香，奶香细腻柔和，质地顺滑浓稠～🥛一瓶喝出风味曲线，猎奇但不怪，越喝越上头！",
          "textType": "taste_third",
          "images": [
            {
              "imgId": 21,
              "group": "stack",
              "role": "多角度产品特写：不同光线/背景下展示酸奶质感",
              "position": "before_text",
              "relationship": "多角度产品图 → 文字描述风味变化和整体体验"
            }
          ],
          "binding": "image_before_text"
        }
      ],
      "imageGroups": {
        "header": {
          "imgIds": [18, 19, 20],
          "group": "stack",
          "desc": "开篇视觉冲击：瓶身展示+使用场景"
        },
        "footer": {
          "imgIds": [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31],
          "group": "stack",
          "desc": "收尾视觉：多角度产品特写+包装细节+饮用场景"
        }
      }
    }
  ],
  "images": [
    {
      "id": 18,
      "file": "images/image019.jpg",
      "desc": "产品实拍图，木姜子香茅酸奶瓶身展示",
      "type": ["产品图"],
      "primaryType": "产品图",
      "module": "口感体验",
      "layout_role": "hero",
      "imageContentSummary": "白色酸奶瓶身正面展示，瓶身贴有绿色标签，标注'木姜子香茅'风味名称和'认养一头牛每日吨吨'品牌名。背景为浅色木质桌面，自然光照射。"
    },
    {
      "id": 19,
      "file": "images/image020.jpg",
      "desc": "口感/体验展示 第2张",
      "type": ["产品图"],
      "primaryType": "产品图",
      "module": "口感体验",
      "layout_role": "detail",
      "imageContentSummary": "酸奶倾倒瞬间的拉丝效果，质地浓稠呈乳白色，能看到液体缓缓流下的质感层次。"
    }
  ],
  "imageCount": 87,
  "source": "语料库手动收集",
  "convertedAt": "2026-07-17T00:00:00.000Z"
}
```

---

## 和 v1 的兼容性

| 差异点 | v1 | v2 |
|--------|----|----|
| 版本标识 | 无 | `version: "2.0"` + `schema: "corpus-图文绑定-v2"` |
| 类目 | 自定义四级（食品保健 > 咖啡/麦片/冲饮 > 常温乳制品 > 调制乳/风味牛奶） | app 标准三级（level1/level2/level3） |
| 风格标记 | 写在 markdown 文案中 | 使用 `styleTag` 字段 |
| 图片字段 | 无 `imageContentSummary` | 新增 `imageContentSummary` |
| 模块排版 | 仅 `layout.header` 和 `layout.footer` | 新增 `layout.overallPattern`、`layout.density` |
| 文本语义 | 无 | 新增 `textType`、`binding` 语义标记 |
