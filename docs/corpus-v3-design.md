# 语料库 v3：让 AI 真正学会排版与文风

> 状态：方案已定稿（Codex 审核通过，反馈已纳入） | 2026-07-22
> 输出位置：`docs/` 文件夹

---

## 一、现状诊断

### 当前信息维度覆盖率

```
v2.2 已覆盖    ████████████░░░░░░░░  40%
v3 应覆盖      █████████████████████  95%
```

### 核心断层

| 断层 | 位置 | 问题 |
|------|------|------|
| **语料 JSON → RAG 索引** | `import_corpus.cjs` | v2 完整 JSON 被压成 500 字纯文本切片，结构全丢 |
| **风格特征只用不存** | `generator.js` | `analyzeCorpusFactors()` 实时计算后丢弃，无法累积学习 |
| **图文关系弱** | `buildCorpusJSON()` | 只有粗粒度 `position: "before_text"`，没有精确位置/语义关联 |
| **排版模式粗** | `buildCorpusJSON()` | 只有 4 种 pattern，没有具体节奏序列（文-图-文-图-文） |
| **图间关系缺失** | 不存在 | 叙事序列、递进/对比/细节放大等关系完全不记录 |

---

## 二、设计决策（已确认）

| # | 问题 | 决策 |
|---|------|------|
| 1 | 文档位置 | 所有方案文档放 `docs/` 下 |
| 2 | imageRelations 标注 | **AI 自动推断**，导出时加一次 LLM 调用分析图间关系，运营不参与 |
| 3 | audienceContext | **保留**，用于匹配用户在左侧填的「适用人群」。检索时优先匹配同受众语料 |
| 4 | perModule 风格画像 | **每模块独立**。hook/taste/trust/brand 等模块写法差异大，各自独立画像 |
| 5 | v2 语料迁移 | **写迁移脚本**（选项 A），v2 JSON 自动升级到 v3，补不全的字段留空 |

---

## 三、Token 预算与引用策略

### 3.1 128K 上下文实际分配

128K tokens ≈ 中文 60K-80K 字。但不是全给语料用：

```
┌─────────────────────────────────────────────┐
│ 系统指令 (global prompt + 合规规则)    ~5K   │
│ 商品信息 (product input)               ~2K   │
│ 图片描述 (vision results × N张)      ~3-8K  │
│ 风格模板 (小红书/默认)                 ~3K   │
│ ★ 语料参考                           15-30K  │
│ LLM 输出 (生成的文案)                ~5-10K  │
│ 缓冲余量                              ~20K   │
│ 对话历史 (多轮时)                     ~30K   │
└─────────────────────────────────────────────┘
```

语料参考预算：**15K-30K tokens ≈ 1万-2万中文字**。

### 3.2 v2 vs v3 的引用效率

| | v2 方式 | v3 方式 |
|------|---------|---------|
| 引用内容 | 3条 × 500字纯文本/模块 | 聚合画像 + 排版蓝图 + 1-2条精简化范例 |
| 每模块预算 | ~1500字 | hook/taste/trust ≈ 600字（精选范例），其余模块只用聚合画像 ≈ 0字 |
| 11模块总计 | ~16,500字 ≈ 25K tokens | ~12-18K tokens |
| 信息密度 | 低（纯文本，需要 LLM 自己悟风格） | 高（结构化参数 + 排版序列 + 范例，可直接执行） |
| 跨模块信息 | 无（每个模块独立检索，看不到全貌） | 有（全局风格画像 + 排版蓝图覆盖所有模块） |

**v3 用更少的 token 传递了更多的可执行信息。**

### 3.3 分层注入策略

生成时按优先级从上往下塞，塞满 token 预算为止：

```
第1层（必塞）：聚合后的全局风格画像           ~2K tokens
  → AI 知道"怎么写"

第2层（必塞）：排版蓝图 + 图片密度曲线        ~1K tokens
  → AI 知道"图怎么排"

第3层（必塞）：每个模块的 perModule 风格参数   ~3-5K tokens
  → AI 知道"hook和trust写法不同"

第4层（优选）：同品类同模块 TOP 1 范例        ~3-5K tokens
  → 只给 2-3 个核心模块（hook/taste/trust）各1条精简范例

第5层（有余量）：同品类同模块 TOP 2 范例      ~3-5K tokens
  → 更多参考

第6层（有余量）：图间关系 + 跨模块衔接参考     ~2-3K tokens
  → 图怎么串联

第7层（有余量）：受众上下文                    ~0.5K tokens
  → 语调微调（匹配用户填的适用人群）
```

### 3.4 受众匹配检索逻辑

用户在左侧配置区填写了【适用人群】（如"宝妈"），语料检索时：

```
检索优先级：
1. 品类匹配 + 模块匹配 + 受众匹配 → 精准命中，权重最高
   例：乳制品/hook/宝妈 → 完美匹配
2. 品类匹配 + 模块匹配 + 受众未标注 → 次优，能用但不够精准
   例：乳制品/hook/未标注 → 写法可能偏通用
3. 品类匹配 + 模块匹配 + 受众不匹配 → 降权
   例：乳制品/hook/大学生 → 语气和诉求点可能不同
4. 跨品类 + 模块匹配 + 受众匹配 → 借鉴结构，不借鉴内容
   例：速食/hook/宝妈 → 模块结构可参考，具体内容不可参考

匹配结果在 prompt 中标注：
  "以下风格参数来自3篇同品类语料（其中2篇受众匹配：宝妈）"
  → LLM 知道该更信任哪些参考
```

---

## 四、v3 Schema 设计

### 设计原则

1. **存算分离**：语料 JSON 是完整档案（存），RAG 索引是检索优化视图（算）
2. **一次计算，永久存储**：风格特征在导出时算好存入 JSON，不再每次生成时重复计算
3. **粒度递进**：每个维度至少三层粒度（粗→中→细），LLM 按需取用
4. **向下兼容**：v2 JSON 可通过迁移脚本无损升级到 v3

### v3 JSON 顶层结构

```
corpus JSON (v3)
├── styleProfile          [NEW] 全局 + 每模块风格画像
├── layoutBlueprint       [NEW] 排版蓝图：图文穿插序列、密度曲线
├── modules               [ENHANCED] 每模块的 layout + writingProfile + segments
├── images                [ENHANCED] 每张图的 contentAnalysis + narrativeRole + contextInDocument
├── imageRelations        [NEW] 图间关系：叙事序列/对比/证据链/跨模块桥接
├── crossModuleLinks      [NEW] 模块衔接关系
├── audienceContext       [NEW] 受众/平台/场景
└── feedbackSignals       [NEW] 反馈数据（预留）
```

---

### 4.1 全局风格画像 `styleProfile`

> 解决：AI 不知道"怎么写"

导出时一次性计算，永久存储。每次生成时直接读取，不再重复统计。

```json
{
  "styleProfile": {
    "sampleInfo": {
      "totalChars": 8500,
      "totalModules": 11,
      "totalImages": 90,
      "totalParagraphs": 48
    },

    "globalPatterns": {
      "pacing": "fast",
      "pacingDesc": "快节奏（模块短小、图片密集、段落不超过4句）",

      "paragraphBreathing": "medium",
      "breathingDesc": "段落间有空行但不多，视觉上有节奏但不松散",

      "moduleTransitionStyle": "natural_flow",
      "transitionDesc": "自然过渡，不用分隔线或序号，上一模块最后一句自然引出下一模块",

      "readerEngagement": [
        { "technique": "问句互动", "frequency": "high", "example": "很多人问：喝什么酸奶好消化❓" },
        { "technique": "场景共情", "frequency": "high", "example": "每天坐8小时+外卖不断？你的肠道可能需要..." },
        { "technique": "数据说服", "frequency": "medium", "example": "出厂益生菌含量≥5.0×10⁹CFU/100g" }
      ],

      "trustBuilding": [
        { "technique": "配料表展示", "frequency": "high" },
        { "technique": "证书/认证背书", "frequency": "medium" },
        { "technique": "用户评价引用", "frequency": "low" }
      ],

      "overallTone": {
        "primaryTone": "亲切活泼",
        "secondaryTone": "专业可信",
        "personaDesc": "像一个懂产品、会聊天、不端着的朋友在推荐好东西"
      },

      "callToActionPattern": {
        "position": "module_end",
        "techniques": ["价格锚点", "限时紧迫", "赠品加码"],
        "example": "💥新品上市❗重磅加码❗￥79.9元🉐12瓶🎁再送3瓶！"
      }
    },

    "perModule": {
      "hook": {
        "charRange": { "min": 250, "max": 600, "avg": 380 },

        "emojiProfile": {
          "density": 0.8,
          "densityDesc": "每100字约0.8个emoji",
          "positionPreference": { "lineStart": 0.7, "inline": 0.3, "lineEnd": 0.0 },
          "topEmojis": ["🌱", "🥛", "💚", "🔥", "✨", "💥", "🐄"],
          "usagePattern": "行首emoji作为视觉分隔符，引导阅读节奏"
        },

        "sentenceProfile": {
          "avgLength": 22,
          "shortRatio": 0.4,
          "shortDesc": "40%句子≤15字，用于制造节奏感和冲击力",
          "longRatio": 0.15,
          "longDesc": "15%句子≥40字，用于详细说明",
          "rhythmPattern": "短-短-长-短-长"
        },

        "punctuationProfile": {
          "exclamationPerParagraph": 1.2,
          "questionPerParagraph": 0.1,
          "ellipsisUsage": "rare",
          "bulletUsage": "frequent"
        },

        "openingPatterns": [
          { "type": "emoji_claim", "frequency": 0.5, "example": "🌱云贵山野入瓶！…" },
          { "type": "question_hook", "frequency": 0.2, "example": "很多人问：喝什么酸奶好消化❓" },
          { "type": "scene_paint", "frequency": 0.2, "example": "夏天一定要冰镇一下…" },
          { "type": "direct_claim", "frequency": 0.1, "example": "一口喝下9种活性益生菌…" }
        ],

        "closingPatterns": [
          { "type": "price_cta", "frequency": 0.5 },
          { "type": "benefit_summary", "frequency": 0.3 },
          { "type": "scene_loopback", "frequency": 0.2 }
        ],

        "transitionWords": ["而且", "更关键的是", "重点是", "说白了就是", "你想想"],

        "keyPhrasePatterns": [
          { "pattern": "数字+感官词+产品名", "example": "三重味觉一口惊艳" },
          { "pattern": "emoji+卖点+感叹", "example": "✅干净配料表，0香精无额外添加剂" }
        ],

        "numberFormatting": {
          "pricePattern": "￥XX元",
          "specPattern": "200g*12瓶",
          "percentagePattern": "≥88%"
        }
      }
      // ... 每个模块独立画像（hook/price/taste/trust/ingredient/origin/brand/scene/aftercare/tips/cta）
    },

    "crossModulePatterns": {
      "styleVariance": {
        "hook": { "tone": "活泼有力", "emojiDensity": "high" },
        "price": { "tone": "直接冲击", "emojiDensity": "high" },
        "trust": { "tone": "专业可信", "emojiDensity": "medium" },
        "ingredient": { "tone": "科普亲切", "emojiDensity": "medium" },
        "scene": { "tone": "温暖共情", "emojiDensity": "low" },
        "brand": { "tone": "权威有力", "emojiDensity": "low" }
      },
      "moduleConnectionPatterns": [
        { "from": "hook", "to": "price", "pattern": "卖点铺垫→价格引爆" },
        { "from": "taste", "to": "trust", "pattern": "感官体验→信任背书" }
      ]
    }
  }
}
```

---

### 4.2 排版蓝图 `layoutBlueprint`

> 解决：AI 不知道"图怎么放"

```json
{
  "layoutBlueprint": {
    "overallStructure": {
      "moduleCount": 11,
      "moduleOrder": ["hook","price","taste","trust","ingredient","origin","brand","scene","aftercare","tips","cta"],
      "totalImages": 90,
      "totalTextChars": 8500,
      "imageToTextRatio": 1.06,
      "ratioDesc": "每100字配约1张图，图文均衡型",

      "imageDensityCurve": "front_heavy",
      "curveDesc": "前3个模块（hook/price/taste）集中了60%的图片，中段密度下降，末尾（cta/aftercare）几乎无图",

      "documentPacing": {
        "segment1_open": { "modules": ["hook","price"], "style": "密集轰炸", "imagesPer100chars": 2.5 },
        "segment2_body": { "modules": ["taste","trust","ingredient","origin"], "style": "图文交替", "imagesPer100chars": 1.0 },
        "segment3_close": { "modules": ["brand","scene","aftercare","tips","cta"], "style": "文主图辅", "imagesPer100chars": 0.3 }
      }
    },

    "moduleLayouts": {
      "hook": {
        "typicalPattern": "images_interspersed",
        "patternSequence": ["text", "images", "text", "images", "text"],
        "patternDesc": "文→图堆→文→图对→文 的三段式节奏",
        "typicalImageCount": { "min": 8, "max": 18, "avg": 13 },
        "typicalSegmentCount": { "min": 2, "max": 4, "avg": 3 },
        "imageDistribution": [5, 4, 4],
        "imageGroupingPerSegment": [
          { "groupType": "stack", "count": 5, "desc": "产品多角度堆叠展示" },
          { "groupType": "pair", "count": 2, "desc": "卖点对比" },
          { "groupType": "grid", "count": 4, "desc": "使用场景网格" }
        ]
      },
      "trust": {
        "typicalPattern": "image_before_text",
        "patternSequence": ["images", "text"],
        "typicalImageCount": { "min": 2, "max": 6, "avg": 4 },
        "typicalSegmentCount": { "min": 2, "max": 3, "avg": 2.5 },
        "imageDistribution": [3, 1],
        "imageGroupingPerSegment": [
          { "groupType": "stack", "count": 3, "desc": "配料表+营养成分+认证标识" }
        ]
      }
    }
  }
}
```

---

### 4.3 增强模块结构 `modules`

> 在 v2 基础上新增 `writingProfile` 和增强 `layout`

```json
{
  "modules": [
    {
      "moduleKey": "hook",
      "moduleName": "首屏钩子",
      "order": 1,

      "layout": {
        "overallPattern": "images_interspersed",
        "patternSequence": ["text", "images", "text", "images", "text"],
        "imageCount": 15,
        "textSegmentCount": 3,
        "density": "high",
        "imageDistribution": [5, 5, 5],
        "imageGroupingPerSegment": ["stack", "pair", "grid"]
      },

      "writingProfile": {
        "charCount": 380,
        "sentenceCount": 12,
        "avgSentenceLen": 22,
        "emojiCount": 3,
        "emojiList": ["🌱", "🐄", "💥"],
        "openingType": "emoji_claim",
        "openingFirstSentence": "🌱云贵山野入瓶！木姜子香茅酸奶，给你舌尖上的云贵之旅~",
        "closingType": "price_cta",
        "closingLastSentence": "单瓶低至5.3元❗即可体验正宗云贵风味❗❗❗",
        "keyPhrases": ["云贵山野入瓶", "三重味觉", "单瓶低至5.3元"],
        "structureType": "卖点递进式",
        "structureDesc": "开篇钩子→卖点罗列(✅格式)→价格引爆→价值总结"
      },

      "segments": [
        {
          "index": 0,
          "text": "完整段落文本...",
          "textType": "hook_intro",
          "charCount": 120,
          "sentenceCount": 4,
          "function": "场景引入+产品锚定",

          "images": [
            {
              "imgId": 1,
              "group": "stack",
              "groupPosition": 0,
              "role": "产品封面图",
              "position": "before_text",
              "positionPrecision": "segment_0_before_text",
              "relationship": "品牌：认养一头牛...",
              "illustratesWhat": "展示产品外观+核心卖点标签，让读者3秒内建立产品认知",
              "textPhrasesSupported": ["木姜子香茅风味", "9种活性益生菌", "A2生牛乳"]
            }
          ],
          "binding": "image_before_text",
          "bindingStrength": "strong",
          "bindingDesc": "图片直接展示文字中提到的产品外观和卖点，图文高度对应"
        }
      ],

      "imageGroups": {
        "group1_stack": {
          "imgIds": [1, 2, 3, 4, 5],
          "groupType": "stack",
          "layoutHint": "vertical_scroll",
          "narrativeFunction": "产品多角度全方位展示"
        }
      }
    }
  ]
}
```

---

### 4.4 增强图片结构 `images`

> 解决：AI 不知道"这张图是什么、为什么放这里、和上下文什么关系"

```json
{
  "images": [
    {
      "id": 1,
      "file": "images/image001.png",
      "module": "hook",
      "suggestedModule": "hook",
      "desc": "产品封面图，含产品+价格+卖点标签",
      "layout_role": "hero",

      "contentAnalysis": {
        "summary": "品牌：认养一头牛；商品名称：每日吨吨木姜子香茅味风味发酵乳；规格：200g；卖点：9种活性益生菌，A2β-酪蛋白生牛乳发酵",
        "ocrText": "完整的OCR文字内容...",
        "extractedEntities": {
          "brand": "认养一头牛",
          "productName": "每日吨吨木姜子香茅味风味发酵乳",
          "prices": ["￥79.9", "5.3元"],
          "specs": ["200g", "12瓶", "15瓶"],
          "numbers": ["9", "200g", "79.9", "5.3", "12", "15"],
          "claims": ["9种活性益生菌", "A2β-酪蛋白生牛乳发酵", "干净配料表"]
        },
        "visualElements": ["白色瓶身", "绿色瓶盖", "数字9标识", "木姜子果实图案"],
        "textDensity": "high",
        "dominantColors": ["#FFFFFF", "#2D8C4A", "#F5E6D3"],
        "colorMood": "清新自然",
        "composition": "product_centered"
      },

      "narrativeRole": {
        "isKeyVisual": true,
        "importanceInDoc": "critical",
        "storyPosition": "opening_hook",
        "emotionalFunction": "curiosity_appeal",
        "emotionalDesc": "通过云贵山野+木姜子香茅的新奇组合激发好奇心",
        "informationLevel": "overview"
      },

      "contextInDocument": {
        "precedingModule": null,
        "followingModule": "price",
        "siblingImagesInModule": [2,3,4,5,6,7,8,9,10,11,12,13,14,15],
        "positionInModule": 0,
        "positionDesc": "模块第一张图，开门见山展示产品",
        "associatedTextSegment": 0,
        "associatedTextPhrases": ["云贵山野入瓶", "木姜子香茅酸奶", "9种活性益生菌", "A2生牛乳"],
        "whyThisImageHere": "作为首屏第一张图，建立产品第一印象，让读者3秒内知道这是什么产品"
      }
    }
  ]
}
```

---

### 4.5 图间关系图 `imageRelations` **[全新]**

> 解决：AI 不知道"图与图之间是什么关系、为什么这样排序"
> 标注方式：导出时由 LLM **按模块分组**自动推断（非全量一次调用）
> **[Codex 修订]**：90 张图全量一次推给 LLM 会导致 O(n²) 组合爆炸 + prompt 超 15K tokens。改为按模块分组，每模块单独调 LLM，跨模块桥接用简单规则兜底。

```json
{
  "imageRelations": [
    {
      "id": "rel_001",
      "type": "narrative_sequence",
      "typeDesc": "叙事序列",
      "images": [1, 2, 3, 4, 5],
      "module": "hook",
      "description": "产品外观从全景→中景→特写的递进展示",
      "flowDirection": "远→近→特写",
      "visualRhythm": "全景建立认知→中景展示特征→特写强化卖点",
      "relationMatrix": {
        "1_to_2": { "relation": "angle_change", "desc": "同一产品不同角度" },
        "2_to_3": { "relation": "zoom_in", "desc": "从外观到瓶身细节" },
        "3_to_4": { "relation": "context_add", "desc": "从单品到场景搭配" },
        "4_to_5": { "relation": "detail_focus", "desc": "聚焦卖点标签" }
      }
    },
    {
      "id": "rel_002",
      "type": "comparison",
      "images": [12, 13],
      "module": "hook",
      "description": "A2β-酪蛋白 vs A1β-酪蛋白分子结构对比",
      "comparisonAxis": "A2 vs A1 分子大小",
      "winnerSide": "A2（更小分子，更好吸收）"
    },
    {
      "id": "rel_003",
      "type": "evidence_chain",
      "images": [30, 31, 32, 33],
      "module": "trust",
      "description": "配料表→营养成分→配料详情→益生菌列表，逐层深入",
      "flowDirection": "概览→细节→证据"
    }
  ],

  "relationTypeDefinitions": {
    "narrative_sequence": "叙事递进：图片按故事线排列",
    "comparison": "对比：两张或多张图形成对比关系",
    "detail_zoom": "细节放大：后图是前图某部分的放大",
    "evidence_chain": "证据链：多图组成逻辑推理链",
    "cross_module_bridge": "跨模块桥接：不同模块的图片之间形成呼应",
    "atmosphere_stack": "氛围堆叠：多张同风格图叠加营造氛围",
    "before_after": "前后对比：使用前vs使用后",
    "problem_solution": "问题→解决方案"
  }
}
```

#### imageRelations 推断策略 [Codex 修订]

**问题**：90 张图全量一次推给 LLM → prompt 超过 15K tokens + O(n²) 组合爆炸，单次调用无法处理。

**修订方案 — 按模块分组 + 规则兜底：**

```
每个模块独立调用 1 次 LLM（3-15 张图/模块）
  → 输入：该模块的所有图片 desc + summary + extractedEntities
  → 输出：该模块内的关系图（narrative_sequence / comparison / detail_zoom / evidence_chain）
  → 每模块 prompt 控制在 2-3K tokens

跨模块桥接（cross_module_bridge）：
  → 不用 LLM，用简单规则：
    两个相邻模块的图片有共同 extractedEntities.brand → 自动标记 bridge
    描述中包含彼此的关键词 → 自动标记 bridge

降级策略：
  LLM 可用 → 全量按模块推断
  LLM 不可用/超时/报错 → 降级为启发式规则：
    同模块连续图 = narrative_sequence
    同模块2张图 = comparison
    标记 inferred: "heuristic"
  confidence 字段标注推断可信度
```

**导出延迟处理**：
- 按模块分组推断后，11 个模块 × 每次 2-3 秒 = 22-33 秒
- 导出时同步启动推断，超时 30 秒后剩余模块降级为启发式规则
- 迁移脚本（Phase 3）统一用启发式规则，不调 LLM

---

### 4.6 模块间关联 `crossModuleLinks` **[全新]**

> 解决：AI 不知道"模块之间怎么衔接、哪些模块有呼应"

```json
{
  "crossModuleLinks": [
    {
      "fromModule": "hook",
      "toModule": "price",
      "linkType": "escalation",
      "desc": "首屏建立产品认知和欲望 → 价格模块用数字引爆购买冲动",
      "textBridging": "hook 末尾'单瓶低至5.3元' 自然过渡到 price 模块"
    },
    {
      "fromModule": "taste",
      "toModule": "trust",
      "linkType": "deepening",
      "desc": "感官体验建立好感 → 配料/成分建立理性信任"
    },
    {
      "fromModule": "ingredient",
      "toModule": "brand",
      "linkType": "authority_chain",
      "desc": "成分科普建立认知 → 品牌背书建立权威"
    }
  ]
}
```

---

### 4.7 受众与场景 `audienceContext` **[全新]**

> 解决：AI 不知道"这篇文案是写给谁看的、在什么平台发"
> 与用户在左侧填写的【适用人群】联动检索

```json
{
  "audienceContext": {
    "primaryAudience": {
      "demographic": "25-35岁女性",
      "psychographic": "关注健康、追求性价比、喜欢尝新、有品质要求但预算敏感",
      "painPoints": ["肠道健康焦虑", "酸奶选择困难", "担心添加剂", "价格敏感"],
      "readingScenario": "刷小红书/朋友圈时快速浏览，3秒内决定是否继续看"
    },
    "platform": {
      "name": "小红书",
      "contentFormat": "图文笔记",
      "typicalReadingTime": "30-60秒",
      "scrollingBehavior": "快速滑动，靠首图+标题决定停留"
    },
    "campaignContext": {
      "type": "新品上市",
      "season": "夏季",
      "urgency": "新品首发限时优惠",
      "competitorContext": "普通酸奶品牌，差异化：云贵风味+A2奶源+9种益生菌"
    }
  }
}
```

---

### 4.8 反馈信号 `feedbackSignals` **[预留]**

```json
{
  "feedbackSignals": {
    "status": "none",
    "note": "暂无反馈数据，上线后可接入小红书/抖音数据回传"
  }
}
```

---

### 4.9 模块专属字段 [Codex 修订]

> 不同模块需要不同的统计维度，不能用同一套字段模板。当前 perModule 所有模块用同一个字段结构，但 taste 模块需要感官词、trust 模块需要证据类型——这些是模块的灵魂。

| 模块 | 专属字段 | 说明 |
|------|---------|------|
| **taste** | `sensoryDescriptors` | 高频感官词词汇表，如"丝滑""浓郁""清爽""Q弹""绵密" |
| **trust** | `evidenceTypes` | 配料表展示 / 证书引用 / 检测报告 / 用户评价 的使用频率 |
| **cta** | `urgencyTactics` | 限时 / 限量 / 赠品加码 / 价格锚点 的使用频率 |
| **hook** | `hookTypes` | emoji开场 / 问句钩子 / 场景引入 / 直接断言 的分布 |
| **scene** | `scenarioTypes` | 办公下午茶 / 朋友聚会 / 户外野餐 / 独自享用 的分布 |
| **brand** | `authoritySources` | SGS认证 / 央视溯源 / 专家背书 / 数据引用 的分布 |

RAG 索引聚合时：同类模块合并专属字段，不同类模块忽略。

### 4.10 `modules` 与 `styleProfile` 字段分工 [Codex 修订]

> 两者有大量重叠（字数、句子统计、emoji），需明确职责边界。

```
modules[].writingProfile  → 原始数据源（单条语料的实际测量值）
styleProfile.perModule    → 聚合检索视图（多条语料合并后的指导参数）

RAG 检索只读 styleProfile，modules 仅用于范例展示。
import_corpus.cjs 负责从 modules 提取并聚合到 styleProfile。
```

### 4.11 受众标签归一化 [Codex 修订]

> 用户填"宝妈"/"有娃女性"/"带孩子妈妈"→ 应映射到同一标签才能精准匹配。

```
归一化层（import_corpus.cjs 实现）：

语料端：
  audienceContext.primaryAudience.demographic
    → LLM 或规则映射到预定义标签
    → 标签池：宝妈 / 学生 / 上班族 / 银发族 / 健身人群 / 母婴 / 养生 / 减脂 / 高端消费 / 性价比

用户端：
  用户填写"适用人群"自由文本
    → 生成时同样归一化到标签池
    → 再与语料标签匹配
```

### 4.12 受众微调指令 [Codex 修订]

> 不塞原始 JSON 字段，而是预生成一段自然语言指令给 LLM，效果远好于标签。

```
原始 audienceContext → 转为自然语言指令：

"这篇文案的目标读者是关注健康但价格敏感的 25-35 岁女性。
 在写作时：强调性价比、配料干净、适合日常消费。
 避免使用'贵妇级''高端享受'等脱离她们消费场景的表达。
 用'每天轻松喝''健康不贵'等平实但有温度的语言。"
```

在 `generator.js` 生成时，从 audienceContext 预生成此指令，控制在 ~0.5K tokens。

### 4.13 语料时效性衰减 [Codex 修订]

> 半年前写的语料和昨天写的，参考价值不同。小红书文风、emoji 趋势在变。

RAG 索引每个 entry 加 `createdAt` 字段。检索时按时间衰减加权：

| 时间 | 权重 |
|------|------|
| ≤3 个月 | 1.0 |
| 3-6 个月 | 0.7 |
| 6-12 个月 | 0.4 |
| \>12 个月 | 0.2 |

`styleProfile` 聚合时用加权平均而非简单平均。

### 4.14 精简化范例裁剪规则 [Codex 修订]

> 第 4 层"精简范例"需要明确的裁剪规则。

```
裁剪规则（import_corpus.cjs 实现）：
  保留：开头 2 句 + 中间 1 个完整段落 + 结尾 1 句
  目标：≤300 字
  确保不丢：句式节奏、开篇方式、emoji 用法、段落结构

如果模块文本 < 300 字 → 保留全文
如果模块文本 > 300 字 → 按规则裁剪 + 标注 "（共X字，已精简）"
```

### 4.15 图片质量维度 [Codex 修订]

> 高质图适合做大图主视觉，低质图适合小尺寸嵌入。排版蓝图应据此决策。

```json
{
  "imageQuality": {
    "sharpness": "high",
    "lighting": "studio",
    "professionalism": "professional",
    "level": "premium",
    "suggestedUsage": "hero_image",
    "suggestedUsageDesc": "适合做大图主视觉"
  }
}
```

Vision 模型分析时顺便输出质量评价。`layoutBlueprint` 据此决定每张图的推荐展示尺寸。

### 4.16 模块排序理由 [Codex 修订]

> 记录了模块顺序但没有记录"为什么这样排"——这个决策理由对 AI 有价值。

```json
{
  "orderRationale": {
    "hook_first": "3秒内抓住注意力，建立产品第一印象",
    "price_after_hook": "欲望建立后立刻用价格引爆购买冲动",
    "trust_after_taste": "感官好感建立后，用配料+成分建立理性信任"
  }
}
```

存入 `crossModuleLinks`。

---

## 五、RAG 索引升级

### 当前 v1 索引

```json
// corpus_index.json — 现在
{
  "corpus_list": [{
    "id": "乳制品-hook-xxx",
    "content": "前500字纯文本...",    // ← 只有这个
    "module_id": "hook",
    "style_tag": "xiaohongshu"
  }]
}
```

### 升级为 v3 索引

```json
// corpus_index.json — v3
{
  "version": "3.0",
  "totalProducts": 5,
  "totalModules": 55,

  "entries": {
    "乳制品": {
      "categoryMeta": {
        "totalProducts": 3,
        "totalModules": 33,
        "updatedAt": "2026-07-22",
        "aggregatedStyleProfile": { /* 聚合后的品类级风格画像 */ },
        "aggregatedLayoutBlueprint": { /* 聚合后的品类级排版蓝图 */ }
      },
      "modules": {
        "hook": {
          "aggregatedStyle": { /* 该品类下 hook 模块的聚合风格 */ },
          "aggregatedLayout": { /* 该品类下 hook 模块的聚合排版 */ },
          "samples": [
            {
              "productName": "认养一头牛每日吨吨",
              "styleSnapshot": { /* 单条语料的风格快照 */ },
              "layoutSnapshot": { /* 单条语料的排版快照 */ },
              "textPreview": "前300字范例...",
              "imageCount": 15,
              "segmentCount": 3,
              "patternSequence": ["text","images","text","images","text"],
              "audience": { "demographic": "25-35岁女性", "tags": ["健康", "性价比"] }
            }
          ]
        }
      }
    }
  },

  "globalProfile": {
    "styleDefaults": { /* 跨品类冷启动兜底参数 */ },
    "layoutDefaults": { /* 跨品类冷启动兜底排版 */ }
  }
}
```

---

## 六、生成链路改动

### 6.1 generator.js 的 buildPrompt() 改动

```
当前流程:
  retrieveCorpus(category, moduleKey)
    → 拿 3 条纯文本
    → analyzeCorpusFactors() 实时统计
    → 注入 prompt
  问题: 每次重新统计，结果不稳定，信息密度低

v3 流程:
  loadV3Index()
    → 读品类级 aggregatedStyleProfile（预计算，多条语料聚合）
    → 读品类级 aggregatedLayoutBlueprint（预计算）
    → 匹配受众（如果用户填了适用人群）
    → 选取 TOP 1-2 精简范例
    → 分层注入 prompt（按 token 预算从上往下塞）
  优势: 一次计算永久存储，聚合结果稳定，信息密度高
```

### 6.2 Prompt 注入结构

```
## 语料风格画像（3篇同品类语料聚合，其中2篇受众匹配：宝妈）
- 字数范围：250-600字，平均380字
- Emoji密度：每100字0.8个，偏好行首
- 句式节奏：短-短-长-短-长，短句率40%
- 开头方式：emoji+卖点声明(50%) / 问句钩子(20%) / 场景引入(20%) / 直接断言(10%)
- 语气：亲切活泼为主，像一个懂产品的朋友在聊天

## 排版蓝图（同品类参考）
- 整体节奏：前重后轻，前3模块占60%图片
- hook模块：文→5图堆→文→2图对→文（三段式）
- trust模块：3图堆→文，无穿插
- 图间叙事：首屏5图为远→近→特写递进

## 最佳范例（同品类·同模块·同受众）
### hook 模块
[精简范例 300字]
排版序列：文→图堆(5张)→文→图对(2张)→文

请严格遵循以上参数写作。各模块的字数、emoji密度、句式节奏、开头方式需与画像一致。
```

---

## 七、改动文件清单

| 文件 | 改动 | 类型 |
|------|------|------|
| `app/src/App.tsx` `buildCorpusJSON()` | 重写，输出 v3 schema（8 section），增加 styleProfile 计算、layoutBlueprint 提取、imageRelations LLM推断调用、audienceContext 组装 | 重写 |
| `data/rag/import_corpus.cjs` | 重写，扫描 v3 JSON → 结构化 RAG 索引 + 同品类聚合 + 跨品类全局画像 | 重写 |
| `app/server/services/generator.js` | 改 `loadCorpus()`/`retrieveCorpus()`/`buildPrompt()`：读 v3 索引 → 受众匹配 → 分层注入 prompt | 改造 |
| `data/rag/corpus_index.json` | 结构升级为 v3 索引格式 | 重建 |
| `scripts/migrate-v2-to-v3.cjs` | **[新增]** v2 JSON → v3 JSON 迁移脚本 | 新增 |
| `docs/corpus-v3-design.md` | **[新增]** 本方案文档最终版 | 新增 |

| 文件 | 不改 |
|------|------|
| `server/index.js` `/api/corpus/save-to-review` | 存储逻辑不变 |
| `server/services/corpus-hash.js` + `/api/images/match-corpus` | 图片匹配逻辑不变 |
| `server/services/vision.js` | 不变 |
| `app/src/components/panels/LeftPanel.tsx` | 不变 |

---

## 八、实施步骤

### Phase 1：Schema 定稿（当前）
- 本方案经内部讨论 + Codex 审核后定稿
- 确认所有字段和优先级

### Phase 2：导出侧 `buildCorpusJSON()` 重写
- 实现 v3 JSON 组装（8 section → 16 subsection）
- 实现 `styleProfile` 一次性计算（复用现有 `analyzeCorpusFactors()` 逻辑，改为导出时调用）
- 实现 perModule 专属字段提取（sensoryDescriptors / evidenceTypes / urgencyTactics 等）
- 实现 `layoutBlueprint` 提取
- 实现 `imageRelations` LLM **按模块分组**推断：
  - 每模块独立调用 LLM（3-15 张图/模块），prompt 控制在 2-3K tokens
  - 跨模块桥接用简单规则（同 brand = bridge）
  - 超时 30 秒后剩余模块降级为启发式规则，标记 `inferred: "heuristic"`
- 实现 `audienceContext` 组装（从用户输入提取 + 预生成受众微调指令）
- 实现受众标签归一化（自由文本 → 预定义标签池）
- 保持与 v2 的向后兼容读取

### Phase 3：迁移脚本 `migrate-v2-to-v3.cjs`
- 扫描 `data/corpus/` 下所有 v2 JSON
- 自动计算 styleProfile（能算的算，算不了的空着）
- 自动提取 layoutBlueprint
- imageRelations 用简单规则兜底（同模块连续图=sequence），标注 `inferred: "heuristic"` 表示非 LLM 推断
- 输出 v3 JSON 覆盖原文件

### Phase 4：入库侧 `import_corpus.cjs` 重写
- 扫描 v3 JSON → 结构化 RAG 索引
- 同品类聚合（多条语料的 styleProfile 合并，时间加权平均）
- 跨品类全局画像（冷启动兜底）
- 受众标签索引 + 归一化映射
- `modules` → `styleProfile` 字段分工：前者原始数据，后者聚合视图
- 精简化范例自动裁剪（开头2句 + 中间1段 + 结尾1句，≤300字）
- 每个 entry 加 `createdAt` 时间戳

### Phase 5：消费侧 `generator.js` 改造
- 读 v3 索引（`loadV3Index()`）
- 受众匹配检索（如果用户填了适用人群）
- 分层注入 prompt（按 token 预算从上往下塞）
- 回退兼容：无 v3 索引时用旧 `retrieveCorpus()` 逻辑

### Phase 6：测试验证
- 准备 3 个固定测试 case（不同品类、不同模块数）
- 用新旧两套 prompt 各生成一次
- 从四个维度打分对比：风格一致性、信息准确性、排版合理度、emoji 使用自然度
- 确保新方案不退化
- 确认 token 预算不超

---

## 九、风险与边界

| 场景 | 处理 |
|------|------|
| imageRelations LLM 推断失败 | 降级为简单规则（同模块连续图 = sequence），标记 `inferred: "heuristic"` |
| 语料不足（某品类只有 1 条） | 聚合画像退化为单条快照，标注 `sampleSize: 1, confidence: "low"` |
| 语料为空（新品类冷启动） | 使用 `globalProfile` 跨品类兜底参数 + 标注"无同品类语料参考" |
| v3 索引不存在 | 回退到旧 `retrieveCorpus()` 逻辑 |
| token 预算紧张（长商品信息 + 多图） | 自动裁剪第4层以下的引用，保证第1-3层必塞 |
| 受众不匹配 | 降权但不丢弃，标注 `audienceMatch: "partial"` |
| 导出时 LLM 推断超时 | 超时 30s 后剩余模块降级为启发式规则，不阻塞导出 |
| 标签归一化失败 | 降级为原始自由文本模糊匹配 |

---

## 十、Codex 审核反馈与修订记录

> 审核人：硅基打工人 - 小co 🤖 | 审核时间：2026-07-22
> 整体评价：方向正确，`styleProfile` 维度设计扎实。优先修 2 个 🔴 问题后即可推进。

### 🔴 高优先级（已修订）

| # | 问题 | 修订 |
|---|------|------|
| 1 | imageRelations 全量 LLM 调用不可行（90 张图 O(n²) 爆炸） | 改为按模块分组推断，每模块 2-3K tokens，跨模块桥接用简单规则。见 §4.5 |
| 2 | 导出时额外 LLM 调用延迟 22-33 秒 | 加超时降级（30s），超时剩余模块降级为启发式规则。见 §4.5 |

### 🟡 中优先级（已修订）

| # | 问题 | 修订 |
|---|------|------|
| 3 | perModule 所有模块用同一套字段模板，taste 没有感官词、trust 没有证据类型 | 新增模块专属字段。见 §4.9 |
| 4 | `modules` 和 `styleProfile` 字段重叠，未明确分工 | 明确前者为原始数据源、后者为聚合视图。见 §4.10 |
| 5 | 受众标签缺归一化，"宝妈"/"有娃女性"匹配不上 | 新增标签归一化层，自由文本→预定义标签池。见 §4.11 |
| 6 | 精简化范例裁剪规则未定义 | 明确规则：开头2句+中间1段+结尾1句，≤300字。见 §4.14 |
| 7 | 语料时效性衰减缺失，半年前和昨天的同等对待 | 新增时间衰减权重，加权平均聚合。见 §4.13 |
| 8 | 受众上下文只用标签效果有限 | 改为预生成自然语言微调指令。见 §4.12 |

### 🟢 低优先级（已修订）

| # | 问题 | 修订 |
|---|------|------|
| 9 | 模块排序缺少决策理由 | 新增 `orderRationale` 字段。见 §4.16 |
| 10 | 图片质量维度缺失 | 新增 `imageQuality` 字段。见 §4.15 |
| 11 | 测试 Phase 缺少判定标准 | Phase 6 增加四维度打分对比。见 §八 |

### 暂不纳入（后续迭代）

| # | 建议 | 原因 |
|---|------|------|
| - | 用户编辑轨迹 `editingTrajectory` | 需要捕获生成初版 vs 最终版 diff，实施复杂，放 Phase 2+ |
| - | `feedbackSignals` 实际接入 | 等上线后有真实数据再接入 |
