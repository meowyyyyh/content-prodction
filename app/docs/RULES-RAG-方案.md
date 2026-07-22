# RULES RAG — 禁止项 & 商品规则检索系统方案

> 2026-07-21 · 替代 Phase B 中所有禁止项和商品规则的手写工作

---

## 一、要解决的问题

Phase A 的 123 个 prompt 只定义了"写什么 + 多少字"。Phase B 原本计划手写：
- **禁止项**：每个模块不能写什么（如医药不能说"治愈"、美妆不能承诺"7天变白"）
- **商品规则**：每个品类必须写什么（如食品必须有配料表、3C 必须有认证编号）

这两个维度的数据天然是**离散规则**，不适合嵌入 prompt 模板，更适合独立 RAG 检索。

---

## 二、方案概览

```
┌─────────────────────────────────────────────────┐
│              data/rules/category_rules.json       │
│  按"类目 × 模块"组织的禁止项 + 商品规则列表       │
└──────────────────┬──────────────────────────────┘
                   │ generator.js 启动时加载（< 50KB）
                   ▼
┌─────────────────────────────────────────────────┐
│  function retrieveRules(catLevel1, moduleKey)    │
│  ① 精确匹配：catLevel1 + moduleKey               │
│  ② 三级回退：catLevel1 → __default__             │
│  ③ 返回：禁止项列表 + 商品规则列表               │
└──────────────────┬──────────────────────────────┘
                   │ 注入 system prompt
                   ▼
┌─────────────────────────────────────────────────┐
│  ## 禁止项与商品规则（RAG 自动注入）              │
│  - 本模块禁止：……                                │
│  - 本模块必须包含：……                            │
│  违反以上规则将导致输出作废                       │
└─────────────────────────────────────────────────┘
```

---

## 三、数据结构

### 3.1 category_rules.json

```json
{
  "__universal__": {
    "hook": {
      "forbidden": ["禁止使用'手慢无''抢疯了''再不买就没了'等虚假紧迫感"],
      "required": []
    },
    "price": {
      "forbidden": ["禁止说'最低价''抄底价'等绝对化用语"],
      "required": ["必须计算单份单价（总价÷数量=单份价）"]
    },
    "cta": {
      "forbidden": ["禁止提及评论区、外部链接、加微信等跳转引导"],
      "required": ["必须引导用户在页面下方直接购买"]
    }
  },
  "医药健康": {
    "*": {
      "forbidden": [
        "禁止使用'治愈''根治''奇效''亲测''推荐''神奇'",
        "禁止任何形式的用户评价、使用体验、使用场景渲染",
        "禁止对比竞品药物、引用患者案例",
        "禁止使用小红书种草口吻，全篇采用客观说明书风格"
      ],
      "required": [
        "全文末尾必须追加：本品为OTC药品，请按说明书使用或在药师指导下购买和使用"
      ]
    },
    "price": {
      "forbidden": [
        "禁止价格比较、限时优惠、库存紧张、团购促销等营销表达",
        "禁止使用'优惠''特价''促销''限时'等价格诱导词"
      ],
      "required": ["只客观罗列规格对应的价格"]
    },
    "cta": {
      "forbidden": ["禁止使用'下方直接购买''立即下单'等行动召唤"],
      "required": ["引导语改为'如需购买请咨询药师'或'遵医嘱使用'"]
    },
    "product_info": {
      "required": ["必须包含批准文号（国药准字H/Z/S……）"]
    },
    "precautions": {
      "forbidden": ["禁止弱化或省略任何风险信息"],
      "required": [
        "禁忌人群必须作为首段强制列出",
        "必须列出不良反应（常见/偶见/罕见）"
      ]
    }
  },
  "美妆洗护": {
    "before_after": {
      "forbidden": [
        "禁止量化功效承诺（'7天变白''皱纹消失''斑点全无'等）",
        "禁止使用具体时间+效果的数字承诺"
      ],
      "required": ["只能使用定性描述（'肌肤更水润''肤色更透亮'等缓和措辞）"]
    },
    "trust": {
      "required": ["如有备案号/批准文号必须列出", "如有第三方检测报告必须引用"]
    }
  },
  "美食酒水": {
    "trust": {
      "required": ["必须列出配料表关键信息", "主料占比必须给具体数字"]
    },
    "origin": {
      "forbidden": ["禁止编造产地故事", "禁止使用'千年传承''古法秘制'等不可考表述"]
    }
  },
  "母婴亲子": {
    "safety": {
      "forbidden": ["禁止说'绝对安全''100%无毒'"],
      "required": ["必须列出具体安全认证标准编号（3C/国标/欧盟CE等）"]
    },
    "parenting_knowledge": {
      "forbidden": ["禁止编造育儿建议", "禁止暗示可替代医生诊断"],
      "required": ["引用权威来源（WHO/儿科学会指南等，如有）"]
    }
  },
  "数码家电": {
    "specs": {
      "forbidden": ["禁止堆砌参数而不解释对体验的影响"],
      "required": ["如有3C认证编号必须列出", "如有能效等级必须标注"]
    }
  }
}
```

### 3.2 特殊 key：`"*"` 

`"*"` 表示该规则对该类目的**所有模块**生效。用于类目级别的全局禁用词和强制声明。

查找优先级：`catLevel1.moduleKey.forbidden` **∪** `catLevel1["*"].forbidden` **∪** `__universal__.moduleKey.forbidden`

### 3.3 查找逻辑

```
retrieveRules(catLevel1, moduleKey):
  
  forbidden = []
  required  = []
  
  // ① catLevel1 + moduleKey 精确规则
  if rules[catLevel1]?.[moduleKey]:
    forbidden += rules[catLevel1][moduleKey].forbidden
    required  += rules[catLevel1][moduleKey].required
  
  // ② catLevel1 + "*" 类目全局规则
  if rules[catLevel1]?.["*"]:
    forbidden += rules[catLevel1]["*"].forbidden
    required  += rules[catLevel1]["*"].required
  
  // ③ __universal__ + moduleKey 通用兜底
  if rules.__universal__?.[moduleKey]:
    forbidden += rules.__universal__[moduleKey].forbidden
    required  += rules.__universal__[moduleKey].required
  
  return { forbidden, required }
```

---

## 四、System Prompt 注入格式

检索结果注入到每个模块的 prompt 后：

```
## 模块：xxx
**内容要素：** ……
**字数要求：** ……

⚠️ 本模块禁止：
- xxxxx
- xxxxx

✅ 本模块必须：
- xxxxx
```

如果是类目全局规则（`*`），注入到 system prompt 顶部（所有模块共享），与医药 COMPLIANCE_INJECTION 同理。

---

## 五、与现有系统的关系

| 现有系统 | RULES RAG | 关系 |
|------|------|------|
| `MODULE_CONTENT_REQS` | rules JSON | **互补**：prompt 管"写什么"，rules 管"不能写什么+必须写什么" |
| `MEDICAL_COMPLIANCE_INJECTION` | rules JSON 的 `医药健康["*"]` | **替代**：医药合规规则从硬编码改为 JSON 配置 |
| `corpus_index.json` (语料RAG) | `category_rules.json` | **并列**：两个独立 RAG，generator.js 各加载各的 |

---

## 六、COMPLIANCE_INJECTION 整合

当前 `MEDICAL_COMPLIANCE_INJECTION` 已在 `modules.js` 中定义并在 `generator.js` 中硬编码注入（Batch 2 实施）。RULES RAG 上线后：

1. 医药合规规则全部移到 `category_rules.json` 的 `医药健康["*"]`
2. `generator.js` 中删除 `MEDICAL_COMPLIANCE_INJECTION` 导入
3. 改为 `retrieveRules('医药健康', '*')` 自动注入

好处：运营后续调整医药合规规则 → 改 JSON → 即时生效，不用动代码。

---

## 七、涉及文件

| # | 文件 | 操作 | 说明 |
|:--:|------|:--:|------|
| 1 | `data/rules/category_rules.json` | **新建** | 所有禁止项 + 商品规则 |
| 2 | `app/server/services/generator.js` | 改 | 加载 rules JSON + `retrieveRules()` + 注入 system prompt |
| 3 | `app/server/prompts/modules.js` | 改 | 删除 `MEDICAL_COMPLIANCE_INJECTION` 硬编码（规则已在 JSON 中） |
| 4 | `app/docs/RULES-RAG-方案.md` | **新建** | 即本文档 |

---

## 八、实施步骤

### Step 0：复活旧 MODULE_PROMPTS 禁止项（~0.5h）⚠️ 新增

`modules.js` 中 `MODULE_PROMPTS`（deprecated）有 13 个模块的精调禁止规则，处于"存在但无效"状态。先提取到 `category_rules.json` 的 `美食酒水` 条目下，零成本复活：

| 模块 | 可提取的禁止项 |
|------|------|
| `hook` | 禁止"姐妹们""绝了""宝藏""神仙"空洞堆砌；禁止感叹号超过3个；禁止开头就喊"冲" |
| `taste` | 禁止"好喝""好吃""不错"等空洞概括；禁止没有层次的单段描述；禁止每句都用emoji |
| `ingredient` | 禁止暗示医疗功效；禁止编造成分数据；禁止只说菌种名不解释作用 |
| `origin` | 禁止编造产地故事；禁止"千年传承""古法秘制"等不可考表述 |
| `brand` | 禁止编造认证和奖项；禁止"专家推荐""央视推荐"（除非输入明确提供）；禁止"驰名商标" |
| 其余 8 个 | 各有 2-4 条（详见 `MODULE_PROMPTS` 各模块"禁止"段） |

### Step 1：建立 rules JSON（~1h）

- Step 0 的提取结果作为 `美食酒水` 种子数据
- 从 `COMPLIANCE_INJECTION` 整合医药规则
- 写 `__universal__` 通用规则（hook/price/cta 的基础禁词）
- 按优先级覆盖：P0（美食+美妆）+ P1（母婴+医药+服饰）+ P2（数码+虚拟）

### Step 2：generator.js 接入（~0.5h）

```js
import { readFileSync, existsSync } from 'fs'

let rulesData = null
function loadRules() {
  if (rulesData) return rulesData
  const path = resolve(__dirname, '../../../data/rules/category_rules.json')
  if (!existsSync(path)) return null
  rulesData = JSON.parse(readFileSync(path, 'utf-8'))
  return rulesData
}

function retrieveRules(catLevel1, moduleKey) {
  const rules = loadRules()
  if (!rules) return { forbidden: [], required: [] }
  
  const forbidden = []
  const required = []
  
  // ① 精确匹配
  const exact = rules[catLevel1]?.[moduleKey]
  if (exact) {
    forbidden.push(...(exact.forbidden || []))
    required.push(...(exact.required || []))
  }
  
  // ② 类目全局
  const global = rules[catLevel1]?.['*']
  if (global) {
    forbidden.push(...(global.forbidden || []))
    required.push(...(global.required || []))
  }
  
  // ③ 通用兜底
  const fallback = rules.__universal__?.[moduleKey]
  if (fallback) {
    forbidden.push(...(fallback.forbidden || []))
    required.push(...(fallback.required || []))
  }
  
  return { forbidden, required }
}
```

### Step 3：模块 prompt 注入（~0.5h）

**类目全局规则（`*`）→ system prompt 顶部**（所有模块共享，避免在每个模块中重复注入）：

```js
// 在 systemPrompt 构建时注入类目全局规则
const globalRules = retrieveRules(catLevel1, '*')
if (globalRules.forbidden.length > 0 || globalRules.required.length > 0) {
  const globalBlock = ['## ⚠️ 类目全局规则（所有模块共同遵守）']
  if (globalRules.required.length > 0)
    globalBlock.push('✅ 必须：\n' + globalRules.required.map(r => '- ' + r).join('\n'))
  if (globalRules.forbidden.length > 0)
    globalBlock.push('❌ 禁止：\n' + globalRules.forbidden.map(r => '- ' + r).join('\n'))
  systemParts.unshift(globalBlock.join('\n'))
}
```

**模块精确规则 + 通用兜底 → 注入对应模块 prompt 末尾**：

```js
const modulePrompts = modules.map(key => {
  const prompt = catPrompts?.[key] || MODULE_CONTENT_REQS.__universal__?.[key] || ''
  if (!prompt) return ''
  
  // 只取模块精确匹配规则（不含 "*" 全局规则，已在 system prompt 顶部注入）
  const rules = retrieveModuleRules(catLevel1, key) // 不含 "*" 回退
  let extra = ''
  if (rules.required.length > 0) {
    extra += '\n✅ 本模块必须：\n' + rules.required.map(r => '- ' + r).join('\n')
  }
  if (rules.forbidden.length > 0) {
    extra += '\n❌ 本模块禁止：\n' + rules.forbidden.map(r => '- ' + r).join('\n')
  }
  return prompt + extra
}).filter(Boolean)
```

### Step 4：JSON 防御 & 校验（~0.5h）

**loadRules 加 try-catch 兜底**（防止 JSON 语法错误导致整个生成崩溃）：

```js
try {
  rulesData = JSON.parse(readFileSync(path, 'utf-8'))
} catch (e) {
  console.error('[RULES RAG] JSON 解析失败，回退到空规则集:', e.message)
  rulesData = { __universal__: {} }
}
```

**校验脚本 `data/rules/validate-rules.mjs`**（运营改完 JSON 后跑一次）：

- 检查所有 `catLevel1` key 是否匹配 `categories.ts` 中的合法类目名
- 检查所有 `moduleKey` 是否在 `ModuleKey` 联合类型中
- 检查 `forbidden`/`required` 是否为字符串数组
- 有错误直接报具体位置，不静默

### Step 5：清理旧代码（~0.25h）

- 删除 `modules.js` 中 `MEDICAL_COMPLIANCE_INJECTION` 的导出
- 删除 `generator.js` 中 `MEDICAL_COMPLIANCE_INJECTION` 的导入和注入逻辑（改为 RAG 自动处理）

---

## 九、运营使用方式

1. 打开 `data/rules/category_rules.json`
2. 找到对应类目和模块（或新增 key）
3. 在 `forbidden` 或 `required` 数组中追加规则
4. 重启 server 或热加载 → 即时生效

**不需要改任何 prompt 代码，不需要懂 JavaScript。**

---

## 十、与 Phase B 的关系

| Phase B 内容 | RULES RAG 之前 | RULES RAG 之后 |
|------|:--:|:--:|
| 禁止项 | 手写 123 个 prompt | ✅ JSON 配置，零手写 |
| 商品规则 | 手写 123 个 prompt | ✅ JSON 配置，零手写 |
| 句式模板 | 手写 P0+P1（~51 个） | 不变，仍需手写 |

**Phase B 手写量：10h → 4h（只写句式模板）**

---

## 十一、内容要素 vs 禁止项的职责边界

实施时必须遵守的判据：**"如果不写，文案质量下降但不违规 → 放内容要素（prompt）；如果不写，文案违规或误导 → 放禁止项/必须项（rules JSON）。"**

| 示例 | 判据 | 归属 |
|------|------|:--:|
| "写口感三层变化" | 不写只是写得差 | 内容要素 |
| "禁止暗示医疗功效" | 写了可能违法 | 禁止项 |
| "必须列出配料表关键信息" | 不写违反食品安全宣传规范 | 必须项 |
| "主料占比必须给具体数字" | 不写属于虚假宣传风险 | 必须项 |
| "用emoji做分段锚点" | 不写只是风格差异 | 内容要素 |

实施时需过一遍现有 123 个 prompt，将符合"违规/误导"判据的内容要素迁移到 rules JSON。

---

## 十二、前端复用潜力

`category_rules.json` 中的 `forbidden` 数组可直接用于前端编辑器的实时合规检查——用户在 contentEditable 中输入文案时，高亮命中禁词的文本。不需要额外维护第二套规则，一处配置两处生效。

---

## 十三、与语料 RAG 的区分

| | 语料 RAG（corpus_index.json） | RULES RAG（category_rules.json） |
|------|------|------|
| 数据来源 | 运营导出语料 | 运营手动配置 |
| 内容 | 历史高分笔记全文 | 禁止词 + 必须写项 |
| 更新频率 | 每次导出后更新 | 运营随时修改 |
| 检索方式 | 相似度匹配 | 精确匹配 + 回退 |
| 注入位置 | system prompt 语料参考区 | 全局→system顶部，模块→prompt末尾 |
| 文件大小 | ~MB 级（语料多） | ~10KB（纯规则） |

---

## 十四、审阅记录

> 2026-07-21 · 小co 审核，6 条意见全部采纳

| # | 反馈 | 处理 |
|:--:|------|------|
| 1 | MEDICAL_COMPLIANCE_INJECTION 已在代码中，非"未实施" | 文档措辞改为"整合"，非"迁移" |
| 2 | `*` 全局规则应注入 system prompt 顶部，不应每个模块重复 | Step 3 代码修正：全局→顶部一次，精确→模块末尾 |
| 3 | 旧 MODULE_PROMPTS 禁止项被浪费，应提取复活 | 新增 Step 0：提取 13 个模块的禁止项到 JSON |
| 4 | loadRules 无 try-catch 防御 | Step 4 加 try-catch + validate-rules.mjs |
| 5 | 内容要素 vs 禁止项职责边界缺判据 | 新增 §十一：不写=质量差→prompt，不写=违规→rules |
| 6 | JSON 可复用为前端实时合规检查 | 新增 §十二 备注 future use |
