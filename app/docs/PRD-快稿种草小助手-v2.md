# 快稿种草小助手 — 产品需求文档 v3

> 2026-07-20 · v3 · 融合智能体演进终局设计 · 合入 Codex 审阅反馈
>
> **本文档是项目唯一权威需求来源。** 涵盖从当前工具到对话式智能体的完整演进路径。其他 docs/ 下的文件为分项设计细节，如有冲突以本文档为准。

---

## 目录

1. [产品概述](#一产品概述)
2. [当前状态审计](#二当前状态审计)
3. [产品形态与架构](#三产品形态与架构)
4. [三版生成引擎](#四三版生成引擎)
5. [学习系统](#五学习系统)
6. [语料体系](#六语料体系)
7. [类目与模块体系](#七类目与模块体系)
8. [数据飞轮](#八数据飞轮)
9. [功能清单](#九功能清单)
10. [实施路线图](#十实施路线图)
    - 10.1-10.2 第 1-2 周（PRD v2 执行计划）
    - 10.3 终局产品形态：对话式智能体
    - 10.4 两种交互模式（精编/粗编）
    - 10.5 智能体技术架构
    - 10.6 单版本学习系统
    - 10.7 三阶段演进路径
    - 10.8 关键决策记录
11. [逐项任务详情](#十一逐项任务详情)
12. [依赖关系与风险](#十二依赖关系与风险)
13. [附录](#十三附录)

---

## 一、产品概述

### 1.1 产品定位

快稿种草小助手是一个 AI 驱动的商品笔记内容生成工具。运营输入商品信息 + 上传图片，系统自动生成三版图文混排的种草笔记，支持逐模块采纳编辑、一键导出。

**核心定位**：从"AI 帮你写"到"AI 越来越像你写"——系统通过学习运营的采纳、编辑和导出行为，逐步适配个人风格。

### 1.2 目标用户

| 用户 | 使用频率 | 核心诉求 |
|------|:--:|------|
| 运营（主用户） | 每天 5-10 篇 | 快速生成高质量笔记，少改多出 |
| PM/研发 | 按需 | 看数据调 prompt，优化系统 |

### 1.3 发布方式

独立网址（自有服务器部署），后续对接一键发布到快船、群接龙等工作台。

### 1.4 产品演进路线

```
第一阶段（当前）          第二阶段                第三阶段
┌─────────────┐    ┌─────────────────┐    ┌───────────────────┐
│  AI 文案助手  │ → │  图文智能工作台   │ → │  用户私人内容工厂   │
│  帮你写文案   │    │  帮你写 + 配图    │    │  全链自动化         │
│  + 越用越像你 │    │  + 类目扩展       │    │  + 多租户个性化     │
└─────────────┘    └─────────────────┘    └───────────────────┘
```

---

## 二、当前状态审计

### 2.1 已完成 ✅

| 模块 | 内容 |
|------|------|
| 核心生成引擎 | AI 文案三版并行生成（V1 默认 + V2/V3 动态风格），流式输出 |
| 图片处理 | doubao-seed-2.0-lite vision API 全维度分析（type/desc/layout_role/imageContentSummary/imageOcrText/suggestedModule）|
| 三栏 UI | 左面板(320px) 商品配置 + 中栏(450px) 编辑定稿 + 右面板(flex-1) 三版预览 |
| 类目体系 | 15 个一级类目 + 三级查找链（三级精确 → 二级覆盖 → 一级默认 → 兜底），模块注册表（mandatory/recommended/optional）|
| 编辑功能 | contentEditable 中栏编辑、模块拖拽排序、快捷按钮（扩充/口语化/排版等）、对话框自由改写 |
| 文案风格 | 6 种纯风格（xiaohongshu/girlfriend/fun/minimalist/premium/senior）|
| 语料基础设施 | v2.1 schema 图文绑定语料结构、导出自动存入预审库（corpus-review/）、图片指纹去重 |
| DEFAULT_MODULE_ORDER | 价格已移到第 2 位（7/20 运营会议确认）|
| 正式语料 | **1 篇**（认养一头牛每日吨吨木姜子香茅酸奶，xiaohongshu 风格）|

### 2.2 方案设计已完成 📋

| 文档 | 定位 |
|------|------|
| [[产品规划与技术架构.md]] | 产品三阶段演进 + 技术决策 |
| [[类目驱动模块体系设计方案.md]] | 模块注册表 + 三级类目映射 + 三层查找链 |
| [[三引擎排序重构-个人学习系统方案.md]] | V1/V2/V3 各自取序 + 采纳快照 + 导出学习 |
| [[数据飞轮建设方案.md]] | Elo + 用户画像 + 三层飞轮（L1/L2/L3）|
| [[语料动态评分系统设计方案.md]] | 质量分 × 验证分 × 时效分，系统自动评分 |
| [[种子语料入库评分体系设计方案.md]] | 5 维度人工评分卡，运营筛选历史笔记用 |
| [[运营需求会议总结.md]] | 7/20 会议关键决议 |
| [[执行清单.md]] | PM 行动手册（三阶段）|
| [[运营沟通清单-2026-07-20.md]] | 运营沟通议程 |

### 2.3 未完成 ❌

| 模块                | 现状                                                   |
| ----------------- | ---------------------------------------------------- |
| 三引擎排序重构（6 Steps）  | 零代码，三版共用 `input.moduleOrder`                         |
| Elo 排名系统          | 未开发，V2/V3 风格写死（xiaohongshu/fun）                      |
| 物流售后 prompt       | aftercare 仍融入正文，未改为末尾统一段落                            |
| 信号采集管道            | 点踩只弹 toast，不写 localStorage；快照/埋点全未做                  |
| AI 提炼卖点           | 未开发，当前仅"AI 润色"单向交互                                   |
| 多规格动态表单           | 未开发，当前单一输入框                                          |
| 语料库搜索 API         | 未开发                                                  |
| 采纳快照 + 导出学习       | 未开发                                                  |
| 用户画像类目隔离          | 未开发                                                  |
| 第 1 篇语料新字段        | 缺失 moduleOrder/imageLayout/sourceImageId/corpusScore |
| import_corpus.cjs | 未适配 v2.1 schema（modules 数组、styleTag、category 对象）     |
| 一键发布              | 需与郭总讨论后决定                                            |

---

## 三、产品形态与架构

### 3.1 界面结构（三栏）

```
┌──────────────┬──────────────────┬─────────────────────┐
│  左面板(320)  │   中栏(450)       │   右面板(flex-1)     │
│              │                  │                     │
│ 图片上传+分析 │  编辑定稿区        │  V1 默认风格          │
│ 类目选择      │  (contentEditable)│  V2 Elo #1 风格(动态) │
│ 商品信息      │  支持拖拽排序       │  V3 Elo #2 风格(动态) │
│ 模块勾选      │  快捷按钮          │  逐模块采纳           │
│ 一键生成      │  导出/发布         │  点踩反馈            │
└──────────────┴──────────────────┴─────────────────────┘
```

关键规则：
- **左面板不提供排序功能**——三版生成引擎各自独立确定模块顺序
- **中栏是模块顺序的唯一真理**——运营拖拽调整后的最终顺序 = 学习系统的输入

### 3.2 技术架构

```
用户浏览器 (React + TypeScript + Vite + Tailwind)
       │
       ▼
Cloudflare Pages (静态前端托管)
       │ /api/*
       ▼
Render / Railway (Node.js Express)
       │
  ┌────┼────┬────────┬──────────┐
  ▼    ▼     ▼        ▼          ▼
DeepSeek  doubao  语料库    合规扫描  用户画像
(文本)   vision  (文件系统)  (关键词)  (localStorage/JSONL)
         (图片)
```

### 3.3 API 清单

| 端点 | 说明 | 状态 |
|------|------|:--:|
| `POST /api/generate/stream` | 流式生成文案 | ✅ |
| `POST /api/images/classify` | doubao 图片分类 | ✅ |
| `POST /api/images/match-corpus` | 图片指纹匹配 | ✅ |
| `GET /api/corpus/image-map` | 图片→模块映射 | ✅ |
| `POST /api/corpus/save-to-review` | 导出存预审库 | ✅ |
| `POST /api/extract` | 文件解析提取字段 | ✅ |
| `POST /api/chat/stream` | 对话框改写 | ✅ |
| `GET /api/corpus/search` | 语料搜索（动态评分排序）| 🔜 第 2 周 |
| `POST /api/corpus/reference` | 递增语料引用计数 | 🔜 第 2 周 |
| `POST /api/signals/report` | 学习信号上报 | 🔜 第 2 周 |

> 详情请查看 [[产品规划与技术架构.md]]

---

## 四、三版生成引擎

### 4.1 三版定位

| 版本 | 标签 | 风格来源 | 模块顺序来源 |
|------|------|------|------|
| V1 | 默认风格 | 固定位置，个人进化（初始=小红书，逐步融合 L2 画像参数）| **用户学习**（从该品类历史中栏定稿学出）|
| V2 | Elo #1 | Elo 排名第一的纯风格（冷启动：xiaohongshu）| **语料库参考**（同风格高分语料的 moduleOrder）|
| V3 | Elo #2 | Elo 排名第二的纯风格（冷启动：fun）| **语料库参考**（同风格高分语料）|

6 种纯风格平等参与 Elo 竞争：xiaohongshu / girlfriend / fun / minimalist / premium / senior。

### 4.2 生成流程（重构后）

```
用户点「一键生成」
  → 确定 V2/V3 风格：
      读 localStorage['flywheel_scores:{userId}'].style_elos
        → 存在且有效 → Elo 排名取 top 2
        → 不存在 → 用 DEFAULT_INPUT.versionStyles（冷启动兜底）
  → 取 input.selectedModules
  → 并行计算三个版本的 orderedKeys：
      V1 = userLearnedOrder(catLevel1, catLevel2, catLevel3)     // 同步
      V2 = await corpusReferenceOrder(catLevel1, catLevel2, catLevel3, v2Style)  // 异步
      V3 = await corpusReferenceOrder(catLevel1, catLevel2, catLevel3, v3Style)  // 异步
  → 各版按各自顺序过滤 selectedModules
  → 并行 streamGenerate × 3（各自用各自的 orderedKeys）
```

### 4.3 用户学习顺序 `userLearnedOrder()`

三层查找链（与 moduleRegistry 同构）：

```
① __catLevel1__catLevel2__catLevel3__ → 三级精确
② __catLevel1__catLevel2__            → 同二级下聚合
③ __catLevel1__                       → 同一级下聚合
④ DEFAULT_MODULE_ORDER[catLevel1] || DEFAULT_MODULE_ORDER['__default__']
```

- 聚合算法：按使用频次加权排序，未出现的模块按 DEFAULT_MODULE_ORDER 补末尾
- 独立阈值：≥ 10 次导出后完全独立，不再继承父级
- 存储：`localStorage['user_learned_order:{userId}']`

### 4.4 语料参考顺序 `corpusReferenceOrder()`

```
GET /api/corpus/search?catLevel1=&catLevel2=&catLevel3=&style=&top=3
  → 动态评分排序（质量分 × 验证分 × 时效分）
  → Top-3 加权随机选一篇
  → 取选中语料的 moduleOrder
  → 过滤掉不在 selectedModules 中的模块
  → 补充 selectedModules 中但语料没有的模块（按 DEFAULT_MODULE_ORDER）
  → 搜索无结果 → 静默回退 DEFAULT_MODULE_ORDER（不弹提示）
```

**语料为空时的行为**：API 返回空 → 前端兜底 `DEFAULT_MODULE_ORDER`。等语料入库后零代码改动即生效。

### 4.5 兜底顺序

`DEFAULT_MODULE_ORDER`（已在 `moduleRegistry.ts` 中定义）：

- **美食酒水**：hook → price → taste → origin → ingredient → trust → brand → scene → aftercare → tips → feedback → comparison → faq → cta
- **美妆洗护**：hook → beauty_effect → beauty_ingredient → usage → price → trust → brand → scene → aftercare → tips → feedback → comparison → faq → cta
- **其他类目**：hook → price → trust → brand → scene → aftercare → tips → feedback → comparison → faq → cta

> 详情请查看 [[三引擎排序重构-个人学习系统方案.md]]

---

## 五、学习系统

### 5.1 触发时机

所有学习在**导出时**触发（异步，不阻塞导出）。

### 5.2 五个学习维度

| 维度 | 内容 | 存储 | 阶段 |
|------|------|------|:--:|
| 模块顺序 | 中栏定稿的最终模块排列 | localStorage 按类目 | 第 1 周 |
| 图片排版 | 文字-图片顺序变化、图片数量增减 | localStorage | 第 1 周 |
| 编辑距离 | 采纳快照 vs 定稿的编辑率 | localStorage + corpus JSON | 第 1 周 |
| 风格偏好 | 采纳/点踩 → Elo 排名（L1 飞轮）| localStorage | 第 2 周 |
| 文风句式 | LLM 分析编辑 diff → 偏好参数（L2 飞轮）| localStorage | 后续 |

### 5.3 采纳快照机制

```typescript
interface AdoptionSnapshot {
  moduleKey: string
  aiContentHash: string        // AI 原文 hash，不存全文
  aiImageIds: string[]          // 图片 ID，不存 base64
  imagePositions: Record<string, 'before_text' | 'after_text' | 'interleave'>
  adoptedAt: number
  sourceVersion: 1 | 2 | 3
  sourceStyle: ContentStyle
}
```

**关键时序（连续采纳安全）**：

```
handleAdopt(moduleKey, content, images):
  1. 先读取当前 centerModules 状态
  2. 对该模块写快照（从当前 centerModules 中取 AI 原文 hash + 图片 ID）
  3. 将快照合并入 adoption_snapshot（用 moduleKey 索引，不覆盖其他模块）
  4. 再调用 setCenterModules 修改内容
```

清除时机：导出时读取对比后清除。

### 5.4 导出学习数据流

```
运营点「导出」
  → 对比采纳快照 vs 中栏定稿 → 计算编辑率
  → 写 user_learned_order:{userId}（模块顺序学习）
  → 写 img_layout_pref:{userId}（图片排版偏好）
  → POST /api/signals/report（fire-and-forget）
  → buildCorpusJSON 扩展（moduleOrder + imageLayout + sourceImageId + editRate）
  → 清除已使用的 adoption_snapshot
```

> 详情请查看 [[三引擎排序重构-个人学习系统方案.md]]

---

## 六、语料体系

### 6.1 语料结构（v2.1 schema 扩展版）

```json
{
  "version": "2.1",
  "schema": "corpus-图文绑定-v2",
  "productName": "...",
  "styleTag": "xiaohongshu",
  "editRate": 0.15,
  "moduleOrderOriginal": true,
  "referenceCount": 16,
  "corpusScore": null,
  "source": "预审库自动收集",
  "moduleOrder": ["hook","price","taste","trust","ingredient","origin","brand","scene","aftercare","tips","cta"],
  "imageLayout": {"hook":"image_last","taste":"interleave"},
  "category": {"level1":"美食酒水","level2":"酒水饮料","level3":"乳制品"},
  "imageCount": 87,
  "convertedAt": "2026-07-18T00:00:00.000Z",
  "modules": [{
    "moduleKey": "hook",
    "moduleName": "首屏钩子",
    "order": 1,
    "layout": {"overallPattern":"...","imageCount":17,"density":"high"},
    "segments": [{"text":"...","images":[{"sourceImageId":"abc123","imgId":1}]}],
    "imageGroups": {}
  }]
}
```

### 6.2 语料生命周期

```
运营导出 → 自动写入 corpus-review/ → 运营审核 → 移入 corpus/
  → import_corpus.cjs 入库 → RAG 索引更新
```

### 6.3 语料评分体系

两套评分分工明确：

| 评分体系 | 时机 | 评分方式 | 用途 |
|------|------|------|------|
| **入库评分卡** | 入库前 | 人工 5 维度打分（模块完整度 30% / 图文绑定 25% / 信息密度 25% / 风格特征 15% / 实战验证 5%）| 管"能不能进"——总分 ≥ 3.5 入库 |
| **动态评分** | 入库后 | 系统自动计算（质量分 × 验证分 × 时效分）| 管"优先用谁"——搜索 API 排序依据 |

### 6.4 动态评分公式

```
score = 质量分 × 验证分 × 时效分

质量分 = (1 - 编辑率) × 原创性系数
  原创性系数：moduleOrder ≠ DEFAULT_MODULE_ORDER → 1.0 / = → 0.7

验证分 = 1 + ln(1 + 引用计数)    ← 对数映射，防止赢者通吃

时效分 = 四段渐进衰减
  0-7天   → 1.00 - days × 0.03
  8-25天  → 0.79 - (days-7) × 0.015
  26-60天 → 0.52 - (days-25) × 0.006
  60天+   → 最低 0.15
```

### 6.5 选择策略

- **基础策略**：Top-3 加权随机（按分数占比分配概率）
- **探索概率**：90% Top-3 加权 + 5% 完全随机 + 5% 零引用语料
- **新语料加温**：前 5 次搜索验证分临时 +0.5
- **候选 ≤ 3 篇**：关闭探索概率
- **V2/V3 选不同语料**：V2 选中后 V3 从剩余候选选
- **候选 = 0**：兜底 DEFAULT_MODULE_ORDER
- **候选 = 1 且 V3 兜底**：V3 打乱 DEFAULT_MODULE_ORDER（随机交换 2 个模块）

### 6.6 冷启动策略

| 场景 | 行为 |
|------|------|
| 语料 0 篇 | API 返回空，前端兜底 DEFAULT_MODULE_ORDER |
| 语料 ≤ 3 篇 | 全部返回，加权随机 |
| 语料都没有引用记录 | 质量分 + 时效分排序（验证分全是 1.0）|
| 语料缺少新字段 | editRate → 默认 0.3，moduleOrderOriginal → 默认 false |
| 种子语料（source=curated）| 入库评分卡总分映射为初始引用分，冷启动期优先引用 |

> 详情请查看 [[语料动态评分系统设计方案.md]]
> 详情请查看 [[种子语料入库评分体系设计方案.md]]

---

## 七、类目与模块体系

### 7.1 三级类目结构

15 个一级类目，500+ 三级类目。编码格式：`"level1::level2::level3"`。

### 7.2 模块注册表

**通用模块（10 个，所有类目共享）**：hook, price, trust, brand, scene, aftercare, tips, cta, feedback, faq

**可选通用模块**：comparison（全网比价，按类目配置）

**美食酒水专属（3 个）**：taste, ingredient, origin

**美妆洗护专属（Phase 3）**：beauty_effect, beauty_ingredient, usage

### 7.3 模块配置规则

三层查找链：`三级精确 → 二级覆盖 → 一级默认 → __default__`

模块分为三档：
- **mandatory**：灰色不可取消（hook/price/cta）
- **recommended**：默认勾选，可取消
- **optional**：默认不勾选，doubao 识别到相关图片可触发自动勾选

### 7.4 物流售后特殊处理

aftercare 模块在所有类目中的处理方式：
- 不作为卖点融入 AI 生成的正文
- 以系统自动拼接的统一段落形式贴在笔记末尾
- 拼接内容：发货地 + 快递公司 + 发货时效 + 补邮费地区 + 不发货地区 + 售后规则
- 默认不勾选，不参与 AI 生成

> 详情请查看 [[类目驱动模块体系设计方案.md]]

---

## 八、数据飞轮

### 8.1 三层飞轮架构

```
V1 = 默认风格（固定位置，个人进化）
V2 = Elo #1 风格
V3 = Elo #2 风格
       │
       ▼
┌─────────────────────────┐
│       信号采集层          │
│  显式：采纳、点踩、导出    │
│  隐式：编辑距离、按钮、重生成│
└─────────────────────────┘
       │
  ┌────┴────┐
  ▼         ▼
L1 秒级         L2 分钟级         L3 天/周级
Elo 调权        LLM 画像分析      语料入库 RAG
V2/V3 排序      V1 参数注入       全局共享
localStorage    服务端             语料库
个人适配        个人适配           全局优化
```

### 8.2 Elo 评分规则

| 事件 | Elo 计算 |
|------|------|
| 采纳 V2/V3 版本 | 该版本战胜另一个版本 |
| 点踩 V2/V3 版本 | 该版本输给中性基准（1500）|
| 点踩模块 | 该模块所属风格 Elo -25（≈ 版本点踩力度）|
| 快捷按钮改写 + 导出 | 目标风格 +2K（改写意愿 > 被动接受）|
| V2/V3 都没采纳 + 1min 内重生成 | 两版都输给中性基准 |

**K 因子自适应**：< 5 条信号 → K=48；5-20 → K=24；> 20 → K=12。

**冷启动保护**：信号不足时回退静态默认值 `['xiaohongshu', 'girlfriend', 'fun']`。

**风格 Elo 跨类目共享**，模块事件按类目隔离。

### 8.3 中栏编辑距离 = 质量真分数

```
编辑率 = (定稿字数 - 快照字数) / 快照字数

< 20%     → ×1.5  几乎没改，信号放大
20%~50%   → ×1.0  正常
50%~80%   → ×0.3  改了大半，信号打折
> 80%     → ×(-0.5)  几乎重写，采纳变惩罚
```

### 8.4 时间衰减 + prompt 版本戳

旧信号每天衰减 10%（最低保留 30%）。prompt 版本跨越大版本（≥2）→ 旧信号归零。

### 8.5 信号采集管道（Phase 0）

| 锚点 | 触发 | 存储 |
|------|------|------|
| 点踩版本/模块 | 点击 | localStorage |
| 快捷按钮 | 点击 | localStorage |
| 对话框自由输入 | 非 chip 发送 | localStorage |
| 1 分钟内重生成 | handleGenerate | 时间戳 ref |
| 导出信号 | 导出 | POST /api/signals/report（append-only JSONL）|

> 详情请查看 [[数据飞轮建设方案.md]]

---

## 九、功能清单

### 9.1 核心功能（P0 — 第 1-2 周）

|  #  | 功能                            | 说明                                              |  工作量  |
| :-: | ----------------------------- | ----------------------------------------------- | :---: |
| F1  | 左面板去排序化                       | 移除拖拽/排序图标/默认排序按钮/初始化 useEffect                  | 0.5 天 |
| F2  | 物流售后统一末尾段落                    | aftercare 不融入正文，系统自动拼接                          | 0.5 天 |
| F3  | 三版独立排序                        | V1 用户学习 + V2/V3 语料参考，各自取序                       | 1-2 天 |
| F4  | 采纳快照 + 导出学习                   | 快照时序 + collectLearningData + buildCorpusJSON 扩展 | 1-2 天 |
| F5  | 用户画像类目隔离                      | 三层类目隔离存储，≥10 次导出独立                              | 0.5 天 |
| F6  | AI 提炼卖点                       | 供应商素材少时自动识别提炼，替代"AI 润色"                         | 2-3 天 |
| F7  | 多规格动态表单                       | 替代单一输入框，支持多规格/多价格                               | 2-3 天 |
| F8  | 语料库搜索 API + 动态评分              | 三层回退 + 实时动态评分排序                                 | 1-2 天 |
| F9  | Elo 排名基础设施                    | Elo 算法 + localStorage 读写 + 信号采集                 | 1-2 天 |
| F10 | 信号采集管道                        | 点踩持久化 + 按钮埋点 + 上报端点 + 快照                        | 1-2 天 |
| F11 | 第 1 篇语料补字段 + import_corpus 修复 | moduleOrder/imageLayout/sourceImageId + v2.1 适配 | 0.5 天 |

### ==9.2 待讨论/后续功能==

| # | 功能 | 说明 |
|:--:|------|------|
| D1 | 一键发布到快船/群接龙 | 需与郭总讨论后决定 |
| D2 | 独立网址部署 | 已有自有服务器，部署不复杂 |
| D3 | AI 图片生成 | V2.0 规划，首发版不集成 |
| D4 | 比价自动化 | 首发版人工截图过渡 |
| D5 | 美妆洗护类目扩展 | Phase 3 |
| D6 | PM 数据看板 | 数据飞轮 Phase 4 |

---

## 十、实施路线图

### 10.1 第 1 周：生成侧排序重构 + 新功能开发

```
Day 1（周一）
├── F1  左面板去排序化              0.5天
└── F2  物流售后 prompt 调整         0.5天

Day 2-4（周二~周四）
├── F6  AI 提炼卖点（方案+开发）      开始
├── F7  多规格动态表单（方案+开发）    开始
└── F3  三版独立排序                  1-2天
        ├── userLearnedOrder() V1 同步取序
        └── corpusReferenceOrder() V2/V3 异步取序
            └── 初期语料库为空 → 兜底 DEFAULT_MODULE_ORDER
            └── 语料入库后零改动生效

Day 4-5（周四~周五）
├── F4  采纳快照 + 导出学习           1-2天
├── F5  用户画像类目隔离              0.5天
└── F11 第1篇语料补字段 + import_corpus 修复  0.5天
```

**第 1 周里程碑**：三版各自独立排序，左面板去排序化，AI 提炼卖点 + 多规格表单可用，导出带动学习数据采集。**生成侧排序重构完成。**

### 10.2 第 2 周：学习系统 + 语料系统

```
├── F9  Elo 排名基础设施              1-2天
├── F10 信号采集管道                  1-2天
├── F8  语料库搜索 API + 动态评分      1-2天  ← 此时运营语料应已到位
└── 联调测试 + 上线
```

**第 2 周里程碑**：Elo 开始积累信号（只写不读），语料搜索 API 上线，信号采集管道就绪。**学习系统基础设施完成。**

### 10.3 终局产品形态：对话式智能体

当前产品是三栏表单工具。终局形态是**单栏对话式智能体**——用户丢素材 + 自然语言交互，Agent 自主完成从分析到定稿的全链路。

```
┌───────────────────────────────────────┐
│  💬 对话流（主视图）                     │
│  用户: [拖入 供应商文档 + 图片]           │
│  Agent: 识别到XX商品，还缺配料表。         │
│         风格用小红书？上次你乳制品用的闺蜜风  │
│  用户: 小红书，没有配料表先写             │
│  Agent: [流式输出完整笔记] 要调哪里告诉我   │
│  用户: taste写长点                      │
│  Agent: [改写 taste] 记住了 ✅           │
├───────────────────────────────────────┤
│ ✏️ 手动编辑（可展开抽屉，收起时隐藏）       │
├───────────────────────────────────────┤
│ 📎 上传  ✏️ 编辑  📥 导出  [精编▾]  ⚙️  │
└───────────────────────────────────────┘
```

**与当前架构的本质差异**：

| 维度 | 工具（当前） | 智能体（终局） |
|------|------|------|
| 界面 | 三栏表单 + 预览 | 单栏对话流 + 编辑抽屉 |
| 交互 | 填表 → 点按钮 → 等待 | 说需求 → 确认 → 迭代修改 |
| 版本数 | 三版并排竞争 | 单版，对话中调整 |
| 风格选择 | 三版竞争 → Elo 排名 | Agent 根据 Elo 记忆默认值，不确定时主动询问 |
| 模块顺序 | 三版各自取序 | 单版融合学习+语料+用户偏好 |
| 学习反馈 | 采纳快照 + 导出学习 | 对话中的每一次交互都是学习信号 |
| 编辑方式 | contentEditable 富文本 | 对话自然语言改写为主，手动抽屉为兜底 |

> 详情请查看 [[智能体演进终局设计.md]]

### 10.4 两种交互模式

#### 精编模式（默认）— 按模块组确认

按模块组分批生成，每组写完停下等确认。兼顾控制感和效率。

**模块组划分（按一级类目可配置，以美食酒水为例）**：

```
组1「开场+报价」：hook → price           （定基调，最关键）
组2「口感+品质」：taste → trust → ingredient → origin
组3「品牌+场景」：brand → scene
组4「物流+贴士」：aftercare → tips
组5「收尾」    ：faq → cta
```

用户可对组内单个模块提修改，不强制整组通过。修改后单独展示确认 → 重新呈现整组摘要 → 用户确认进入下一组。

#### 粗编模式（速写）— 仅关键模块停下

仅关键模块停下确认，其余全自动。关键模块**按一级类目可配置**：

```typescript
const COARSE_KEY_MODULES: Record<string, ModuleKey[]> = {
  '美食酒水':   ['hook', 'taste', 'price', 'cta'],
  '美妆洗护':   ['hook', 'beauty_effect', 'price', 'cta'],
  '__default__': ['hook', 'price', 'trust', 'cta'],
}
```

#### 重要区分：模式切换 vs 跳过确认

| 概念 | 触发方式 | 是否持久化 |
|------|------|:--:|
| **模式切换** | 底部工具栏手动选择 | ✅ 全局默认变更 |
| **跳过确认** | 精编中途说"剩下的直接写" | ❌ 仅当前笔记生效 |

#### 手动编辑抽屉

保留 contentEditable 富文本编辑器作为可展开底部抽屉。平时收起，运营想手动改时点击 ✏️ 展开。手动修改自动同步回对话上下文。双通道并存——运营自己选怎么改。

#### 默认值策略

- 新用户 → 默认精编模式
- 累计导出 ≥ 15 篇 且 编辑率 < 20% → Agent 主动建议切粗编
- 老用户按品类区分：新品类精编，写过 5 篇以上的品类粗编

### 10.5 智能体技术架构

#### Agent Loop

```
用户输入（文本/文件/图片）
  → 意图路由（一次轻量 LLM 调用，~200 tokens）
  → 上下文组装（会话历史 + 商品信息 + 图片数据 + 用户画像 + 语料参考 + 当前模式）
  → 工具调用（Agent 自主选择：analyze / generate / rewrite / search / export / ask / check_compliance）
  → 输出 + 学习（流式输出 + 记录信号 + 更新画像）
  → 回到用户输入（循环）
```

不需要 LangChain、MCP 等框架。Agent 的 system prompt 中声明可用工具，LLM 返回工具名+参数，后端执行后把结果塞回对话上下文。**核心编排逻辑 < 300 行。**

#### 工具调用保障

1. **Tool-call guard**：JSON 解析 + schema 校验。失败重试 ≤ 2 次，仍失败 → 降级为纯 LLM 回复
2. **Token 预算**：单 turn 8000 token 软上限，超限后压缩中间结果
3. **长对话截断**：conversationHistory > 6000 tokens → 保留最近 20 轮 + 摘要

#### Agent 工具集

```typescript
const AGENT_TOOLS = {
  // 感知：analyze_images (doubao vision), extract_document (/api/extract)
  // 决策：identify_category (LLM), suggest_modules (规则引擎), check_gaps (LLM)
  // 执行：generate_module (SSE流式), rewrite_module (SSE流式)
  // 校验：check_compliance (包装 preBannedCheck/postCheck)
  // 检索：search_corpus (/api/corpus/search)
  // 输出：export_note (buildCorpusJSON + save-to-review)
  // 交互：ask_user (Agent 主动询问)
}
```

> TODO 工具（实施时补充）：`update_product_info`（增量合并素材）、`arrange_images`（图文布局决策）

### 10.6 单版本学习系统

#### 学习信号（比三版本更丰富）

| 信号 | 学习什么 |
|------|------|
| "行" / "可以" / "太短了" / "别用姐妹们" | 模块质量、字数偏好、措辞偏好 |
| 同模块连续修改 ≥ 3 次 | 质量分 -0.5（系统偏差信号） |
| 对话中断（24h 未导出） | 决策权重 ×0.5；连续 3 次 → 默认风格 -1 |
| 模块交界处编辑率高 | 模块过渡偏好——需调整 prompt 衔接 |

#### 风格 Elo：从成对比较到模拟对局

单版本没有 V2 vs V3 的成对比较。Elo 算法不变，信号来源改为**导出频次模拟对局**：

```
三版本（阶段 1）：采纳 V2 → V2 战胜 V3 → Elo +K
单版本（阶段 3）：用户在品类 X 用 A 风格导出 7 次、B 风格 3 次
  → 导出时 A 战胜 B（频次高 = 偏好强）
  → 用户说"换个高端风" → 高端风战胜当前风格（虚拟对局）
```

#### 模块顺序学习

```typescript
function agentModuleOrder(catCode, style, userProfile): ModuleKey[] {
  // ① 用户明确指定 → ② 历史学习（≥10次独立）→ ③ 语料参考 → ④ DEFAULT_MODULE_ORDER
}
```

### 10.7 三阶段演进路径

```
现在（工具）     阶段 1（PRD v2）     阶段 2（半自动）      阶段 3（Agent）
    │                │                   │                   │
表单驱动          学习系统上线         + 品类识别           对话式 Agent
人做决策          三版各自排序         + 缺口分析           单版本
3 面板            Elo 积累信号        + 自检自修           精编/粗编双模式
                  信号采集管道        面板开始简化          编辑抽屉
                                                         全流程自主
                 预计 2 周            预计 2 周            飞轮跑通后 3-4 周
```

#### 阶段 1（PRD v2 · 预计 2 周）
- **启动条件**：无（立即开始）
- **界面**：三栏不变，三版并存
- **关键产出**：三版独立排序、Elo 信号积累（成对比较）、信号采集管道、AI 提炼卖点、多规格表单

#### 阶段 2（半自动化 · 预计 2 周）
- **启动条件**：阶段 1 核心功能（F3/F4/F8/F9）通过测试
- **界面**：左面板可折叠 + 顶部 Agent bar
- **关键产出**：品类识别（准确率 > 90%）、缺口分析、自检自修

#### 阶段 3（对话式 Agent · 预计 3-4 周）
- **启动条件**（五条全部满足）：

| 条件 | 阈值 |
|------|:--:|
| L1 Elo 累计信号 | ≥ 30 条 |
| 信号覆盖类目 | ≥ 3 个不同三级类目 |
| 编辑率稳定下降 | 连续 5 次导出 < 30% |
| 语料库规模 | ≥ 20 篇，跨 ≥ 4 个二级类目，覆盖 ≥ 3 种风格 |
| V1 排序接受度 | 连续 5 次导出保持中栏排序不变 |

- **回退策略**：保留 `[切回三面板]` 入口，稳定 30 天后移除

### 10.8 关键决策记录

| # | 决策 | 结论 |
|:--:|------|------|
| 1 | 阶段 1 版本数 | **三版不变。** 快速积累 Elo 信号，阶段 3 收拢为单版 |
| 2 | 精编/粗编 | **精编 = 按组确认。粗编 = 仅关键模块（按品类可配置）** |
| 3 | 手动编辑 | **保留为可展开抽屉。** 对话为主，手动为辅 |
| 4 | 阶段 3 启动 | **五条硬条件全部满足。** 不等飞轮跑通不启动 |
| 5 | 模式切换 vs 跳过确认 | **两个独立概念。** 模式切换=全局；跳过确认=单次 |
| 6 | 单版本 Elo | **导出频次模拟对局。** 算法不变，信号采集方式变 |
| 7 | 三面板回退 | 阶段 3 保留入口，30 天后移除 |

---

## 十一、逐项任务详情

### F1 · 左面板去排序化 `0.5天`

**文件**：`app/src/components/panels/LeftPanel.tsx`

**改动清单**：
1. 删除 `dragIndex` state + `handleDragStart/Over/End` 回调
2. 删除排序图标 `⋮⋮`（第 366 行）
3. 删除"默认排序"按钮（第 346 行）
4. 删除初始化 useEffect（L59-71，类目变化时自动写 moduleOrder 的逻辑）
5. 三级类目 Select `onValueChange` 中移除 `moduleOrder: newOrder` 写入（L301-308）
6. 模块卡片移除 `draggable`/`onDragStart`/`onDragOver`/`onDragEnd` + 拖拽样式（L352）
7. **保留不变**：
   - 模块勾选逻辑（mandatory 灰色不可取消、recommended 默认勾选可取消、optional 默认不勾选）
   - `input.moduleOrder` 字段保留在 ProductInput 类型中（后端兼容）
   - `DEFAULT_INPUT.moduleOrder` 初始值保留

**验证**：左面板无排序图标、无默认排序按钮、不可拖拽；切换类目不改变 moduleOrder。

---

### F2 · 物流售后 prompt 调整 `0.5天`

**文件**：`server/services/generator.js`、`app/src/App.tsx`

**改动清单**：
1. **generator.js `buildPrompt`**：移除 aftercare 模块的生成指令，不传 aftercare 给 AI
2. **App.tsx 导出逻辑**：新增 `buildAftercareParagraph(input)` 工具函数，自动拼接物流售后段落
3. **PRD 中已明确的拼接内容**：发货地 + 快递公司 + 发货时效 + 补邮费地区 + 不发货地区 + 售后规则
4. **模块推荐配置**：aftercare 默认不勾选（推荐但可取消）

**验证**：生成的三版文案中不含物流售后内容；导出文件末尾有系统自动拼接的物流售后段落。

---

### F3 · 三版独立排序 `1-2天`

**前置**：F1 完成

**文件**：`app/src/App.tsx`、`app/src/config/moduleRegistry.ts`

**改动清单**：

**moduleRegistry.ts 新增两个函数**：

```typescript
// V1 排序来源：用户历史学习（同步）
function userLearnedOrder(catLevel1, catLevel2, catLevel3): ModuleKey[]

// V2/V3 排序来源：语料库参考（异步）
async function corpusReferenceOrder(catLevel1, catLevel2, catLevel3, style): Promise<ModuleKey[]>
```

**App.tsx `handleGenerate` 重构**：

```
旧：三版统一用 input.moduleOrder.filter(selectedModules)
新：
  1. 确定 V2/V3 风格（Elo 排名 or DEFAULT_INPUT.versionStyles 兜底）
  2. 并行取序：
     V1 = userLearnedOrder(...)    // 同步，读 localStorage
     V2 = await corpusReferenceOrder(..., v2Style)  // 异步，fetch API
     V3 = await corpusReferenceOrder(..., v3Style)
  3. 各版过滤 selectedModules → 各自 orderedKeys
  4. 并行 streamGenerate × 3（各自用各自的 orderedKeys）
```

**corpusReferenceOrder 初期行为**：语料搜索 API 未上线 → 返回空 → 兜底 DEFAULT_MODULE_ORDER。等 F8 上线后零改动生效。

**验证**：V1/V2/V3 生成时使用各自独立的模块顺序；无学习数据时三版兜底到 DEFAULT_MODULE_ORDER。

---

### F4 · 采纳快照 + 导出学习 `1-2天`

**前置**：F3 完成

**文件**：`app/src/types/index.ts`、`app/src/App.tsx`

**改动清单**：

1. **types/index.ts**：新增 `AdoptionSnapshot` 接口
2. **handleAdopt/handleAdoptAll**：先读 centerModules → 写快照 → 再 setState（关键时序）
3. **导出时 `collectLearningData()`**：
   - 对比快照 vs 定稿 → 计算编辑率
   - 写 `user_learned_order:{userId}`（模块顺序学习）
   - 写 `img_layout_pref:{userId}`（图片排版偏好）
   - 清除已使用的 adoption_snapshot
   - POST /api/signals/report（fire-and-forget）
4. **buildCorpusJSON 扩展**：
   - 新增 `moduleOrder`（中栏定稿的最终模块排列）
   - 新增 `imageLayout`（图片-文字位置关系）
   - 新增 `sourceImageId`（图片来源追踪）
   - 新增 `editRate`、`moduleOrderOriginal`、`referenceCount`

**localStorage 新增 key**：

| Key | 内容 | 容量 |
|-----|------|:--:|
| `user_learned_order:{userId}` | 按类目模块顺序历史（最近 20 条）| ~5KB |
| `img_layout_pref:{userId}` | 图片排版偏好计数 | ~2KB |
| `adoption_snapshot:{userId}` | 采纳元数据快照（按 moduleKey 索引）| ~5KB |

**验证**：采纳后 localStorage 有 adoption_snapshot（多模块不覆盖）；导出后 localStorage 有 user_learned_order；第二次生成 V1 读上次学习的顺序。

---

### F5 · 用户画像类目隔离 `0.5天`

**文件**：`app/src/App.tsx`

**改动清单**：
- `userLearnedOrder()` 的三层查找链正确实现（与 moduleRegistry 同构）
- 独立阈值：≥ 10 次导出后完全独立，不再继承父级
- `flywheel_scores` 中的 module_events 按类目编码隔离

**验证**：同二级类目下不同三级类目数据正确聚合和独立。

---

### F6 · AI 提炼卖点 `2-3天`

**文件**：`app/src/components/panels/LeftPanel.tsx`、`app/server/index.js`

**改动清单**：

**方案设计（0.5 天）**：
- 触发时机：上传图片分析完成 + 文档解析完成后
- 提炼来源：imageOcrText + imageContentSummary + 文档解析文本 + 已有字段
- 输出格式：每行一条卖点，3-6 条
- 运营确认：弹窗展示提炼结果，可编辑/增删/确认

**后端（0.5 天）**：新增 `POST /api/extract/selling-points`
- 输入：商品名 + OCR 文字集合 + 文档文本 + 已有字段
- 输出：提炼后的卖点列表

**前端（1-1.5 天）**：
- LeftPanel 核心卖点区域重构为"AI 提炼卖点"交互
- 按钮文案从"AI 润色"改为"AI 提炼卖点"
- 提炼结果以勾选列表呈现，运营确认后填入 sellingPoints

**验证**：上传商品图片/文档 → 点 AI 提炼卖点 → 系统自动识别并列出候选卖点 → 运营勾选确认 → 填入表单。

---

### F7 · 多规格动态表单 `2-3天`

**文件**：`app/src/components/panels/LeftPanel.tsx`、`app/src/types/index.ts`、`server/services/generator.js`

**改动清单**：

**方案设计（0.5 天）**：
- 数据结构：`{ specs: { label: string, price: string }[] }`
- UI：可增删的动态表单行（规格名 + 价格），默认一行
- 向下兼容：单行模式 = 当前体验

**类型定义（0.5 天）**：
- `ProductInput` 新增 `specs: { label: string; price: string }[]`
- 旧字段 `netWeight`/`suggestedPrice` 标记 deprecated 但保留

**前端（1 天）**：
- LeftPanel 规格净含量 + 建议售价区域改为动态表单
- 支持添加行、删除行、编辑规格名和价格

**prompt 适配（0.5 天）**：
- generator.js 中 price 模块的 prompt 支持多规格渲染

**验证**：添加多行规格（如 200g×12瓶 ¥59.90、200g×6瓶 ¥35.90）→ 生成时 price 模块正确呈现多规格信息。

---

### F8 · 语料库搜索 API + 动态评分 `1-2天`

**前置**：运营交付种子语料 30-50 篇入库

**文件**：`app/server/index.js`

**改动清单**：

**`GET /api/corpus/search?catLevel1=&catLevel2=&catLevel3=&style=&top=3`**：
1. 扫描 `data/corpus-review/` 目录，按品类+风格过滤
2. 服务端三层回退（level3 → level2 → level1）
3. 实时计算动态评分（质量分 × 验证分 × 时效分），按总分降序
4. 旧语料（无 `moduleOrder`）跳过不报错
5. 缺少 `editRate`/`moduleOrderOriginal` → 使用默认值（0.3/false）

**`POST /api/corpus/reference`**：
- 采纳时调用，递增语料 referenceCount
- append-only 到 `reference_log/{date}.jsonl`
- 搜索时聚合所有 log 文件计算 referenceCount

**验证**：`curl` 能按品类+风格查到语料排序；无匹配时返回空数组不报错。

---

### F9 · Elo 排名基础设施 `1-2天`

**文件**：新建 `app/src/lib/elo.ts`、改 `app/src/App.tsx`

**改动清单**：

**新建 `elo.ts`**：
- `updateElo(winner, loser, K)` — Elo 计算公式
- `getStyleRanking(scores)` — 按 Elo 降序取 top 2
- `decayedScore(entry, currentVersion)` — 时间衰减 + prompt 版本戳
- 初始值：6 种风格均从 1500 起步

**localStorage 读写**：`flywheel_scores:{userId}` 的 style_elos 读写

**信号采集对接**：
- 点踩版本/模块 → 写 localStorage（替换当前 toast-only 行为）
- 采纳版本（仅 V2/V3）→ 写 Elo
- 快捷按钮改写风格 + 导出 → 目标风格 Elo 加分
- 1 分钟内重生成 → 三版 Elo 各扣分

**本期不接入生成管线**——Elo 数据只积累不消费。F3 已用 `DEFAULT_INPUT.versionStyles` 兜底，等信号 ≥ 5 条后在 L1 启动时切换。

**验证**：点踩后 localStorage 有记录；多次采纳同一风格后 Elo 分值变化。

---

### F10 · 信号采集管道 `1-2天`

**文件**：`app/src/App.tsx`、`app/server/index.js`

**改动清单**：

| 锚点 | 改动 | 代码量 |
|------|------|:--:|
| 点踩版本/模块 | `handleDislikeVersion`/`handleDislikeModule` 改为写 localStorage | ~20 行 |
| 快捷按钮埋点 | `handleChatSubmit` 记录按钮类型 + 品类 + 风格 | ~15 行 |
| 对话框自由输入 | 非 chip 触发 → 记录原文 + 模块 + 时间戳 | ~15 行 |
| 低质量标记 | `handleGenerate` 加 `lastGenerateTime` ref | ~10 行 |
| 上报端点 | `POST /api/signals/report` — append-only JSONL | ~15 行 |

**上报端点设计**：

```
POST /api/signals/report
Body: { userId, signals: { style_elos, module_events, button_usage, chat_log } }
  → data/signals/{userId}/{date}.jsonl  （append-only）
```

**验证**：操作后 localStorage 有对应记录；导出时静默上报不阻塞。

---

### F11 · 第 1 篇语料补字段 + import_corpus 修复 `0.5天`

**文件**：
- `data/corpus/美食酒水/酒水饮料/乳制品/认养一头牛每日吨吨木姜子香茅酸奶.json`
- `data/rag/import_corpus.cjs`

**改动清单**：

**语料 JSON 补字段**：
- `moduleOrder`：实际顺序 `["hook","price","taste","trust","ingredient","origin","brand","scene","aftercare","tips","cta"]`
- `imageLayout`：`{}`（当前图片未绑定模块）
- `sourceImageId`：每个 module 的 images 补充
- `corpusScore: null`

**import_corpus.cjs 修复**：
- `data.modules` 对象遍历 → `modules[]` 数组遍历（`mod.moduleKey` + `segments[].text`）
- `data.template` → `data.styleTag`
- `data.categoryLine` 字符串解析 → `data.category` 对象解析
- 兼容读取顶层 `moduleOrder` / `imageLayout` 字段

**验证**：运行 `import_corpus.cjs` 不报错，能正确解析 v2.1 JSON。

---

## 十二、依赖关系与风险

### 12.1 依赖图

```
第 0 层（无依赖，第 1 周并行开工）
├── F1  左面板去排序化           ← F3 的前置
├── F2  物流售后 prompt          ← 独立
├── F6  AI 提炼卖点               ← 独立
├── F7  多规格动态表单             ← 独立
└── F11 语料修复                  ← 独立

第 1 层（依赖 F1，第 1 周）
└── F3  三版独立排序

第 2 层（依赖 F3，第 1 周）
└── F4  采纳快照 + 导出学习

第 3 层（独立收尾，第 1 周）
└── F5  用户画像类目隔离

第 4 层（第 2 周）
├── F9  Elo 基础设施              ← 独立
├── F10 信号采集管道              ← 独立
└── F8  语料搜索 API             ← 需运营语料到位
```

### 12.2 关键风险

| 风险 | 影响 | 缓解措施 |
|------|------|------|
| 运营语料交付延迟 | F8 阻塞，V2/V3 只能兜底默认顺序 | F3 已设计兜底路径；第 1 周重点催运营 |
| L1 学习需要积累信号才能验证 | 上线后学习系统不立即可见效果 | 冷启动期 1-2 周是预期行为，已和运营对齐 |
| 当前仅 xiaohongshu 风格有语料 | 其他 5 种风格 V2/V3 只能兜底 | 运营导出后自动积累，属正常冷启动 |
| 当前匿名模式 localStorage 伪隔离 | 多运营共用浏览器时信号混淆 | 短期加设备标识或用户代号；长期多租户登录 |
| 语料评分中 实战验证 缺 B2B 数据 | 成交中位数 baseline 缺失 | 临时用绝对阈值 ≥ 50 单；退款率 5% 阈值待校准 |

### 12.3 运营侧并行任务

| 任务 | 负责人 | 预计耗时 | 交付物 |
|------|:--:|:--:|------|
| 种子语料收集 | 运营 | ~1 周 | 美食酒水各二级类目 3-5 篇优质笔记 |
| 商品信息字段可用性确认 | 运营+PM | 1 天 | 字段清单（✅/✏️/❌）|
| 品类模块顺序偏好表 | 运营 | 0.5 天 | 代表性三级类目的模块排列偏好 |
| 中栏编辑反馈访谈 | PM | 0.5 天 | 编辑率基线 + 功能缺口 |
| 一键发布方案讨论 | PM+郭总 | 待定 | 技术可行性与排期 |

---

## 十三、附录

### A. 文档索引

| 文档 | 定位 | 与本文档关系 |
|------|------|------|
| [[PRD-快稿种草小助手.md]] (v1) | 上一版 PRD | 本文档替代 |
| [[智能体演进终局设计.md]] | 智能体终局独立设计稿 | 已合入本文档 §10.3-10.8 |
| [[产品规划与技术架构.md]] | 产品演进 + 技术决策 | 互补，架构细节 |
| [[类目驱动模块体系设计方案.md]] | 模块注册表 + 类目映射 | 互补，模块细节 |
| [[三引擎排序重构-个人学习系统方案.md]] | 重构实施详细方案 | 互补，代码级实施细节 |
| [[数据飞轮建设方案.md]] | Elo + 画像 + 三层飞轮 | 互补，学习系统细节 |
| [[语料动态评分系统设计方案.md]] | 动态评分公式 | 互补，评分细节 |
| [[种子语料入库评分体系设计方案.md]] | 入库人工评分卡 | 互补，运营操作指南 |
| [[运营需求会议总结.md]] | 7/20 会议纪要 | 需求来源 |
| [[执行清单.md]] | PM 行动手册 | 需求来源 |
| [[运营沟通清单-2026-07-20.md]] | 运营沟通议程 | 工作文件 |
| [[讨论纪要-2026-07-18-宏观规划审查.md]] | 宏观审查纪要 | 历史记录 |

**文档优先级**：本文档（PRD v3）> 分项设计方案 > 会议纪要/沟通清单。如有冲突，以本文档为准。

### B. Codex 审阅记录

> 2026-07-20 · Codex (deepseek-v4-pro) 对智能体演进终局设计进行审阅，24 条意见。

**已合入 v3（5 项）**：

| 问题 | 修改位置 |
|------|:--:|
| 精编→粗编过渡语义模糊，区分"模式切换"和"跳过确认" | §10.4 |
| 粗编关键模块按品类硬编码 → COARSE_KEY_MODULES 可配置映射表 | §10.4 |
| 阶段 3 启动信号阈值 5 条过低 → 五条硬条件 | §10.7 |
| Elo 从成对比较适配单版本 → 导出频次模拟对局 | §10.6 |
| 缺 check_compliance 工具 → 加入 AGENT_TOOLS | §10.5 |

**TODO（实施时处理，7 项）**：tool-call guard 降级路径、token 预算管理、三面板回退入口、连改 ≥3 次负信号、对话放弃信号、模块连贯性学习、update_product_info / arrange_images 工具。

**搁置（3 项）**：多租户存储（单用户原型阶段不必要）、阶段 1→2 并行开发（单人无意义）、时间估算（已改"预计 N 周"非承诺 deadline）。

---

> **版本**：v3 · 2026-07-20
> **变更**：v2 → v3 合入智能体演进终局设计（§10.3-10.8）+ Codex 审阅反馈

> **版本**：v2 · 2026-07-20
> **变更**：融合三引擎排序重构任务规划 + 全部现有设计方案，新增逐项任务详情、依赖关系图、调整后实施路线图（AI 提炼卖点 + 多规格表单提前至第 1 周 Day 2，三版独立排序提前至第 1 周，Elo + 信号采集移至第 2 周）
