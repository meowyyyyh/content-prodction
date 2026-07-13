# 从工具到 Agent — 实现路径

> **前置说明：关于"护城河"**
>
> 这个 Agent 路线图的设计原则是：**先让用户用起来，再谈不可替代性。**
>
> 纯技术层面的护城河（自研模型、独家算法）在现阶段既不现实也没必要。真正的壁垒来自三样东西的叠加：
>
> 1. **用户在你的工作流里越陷越深**——从"写文案"到"写+配图+审核+发布"，每一步都在系统里完成，换工具的迁移成本越来越高
> 2. **数据飞轮越转越快**——每次用户修改、每次采纳、每次评分，都在让系统更懂这个品牌的口味，对手没有你的历史数据
> 3. **合规坑踩得越多越值钱**——哪个品类有什么违禁词、哪个平台有什么规则，这些经验是时间堆出来的
>
> 以下的所有技术方案选择，都围绕一个目标：**最短时间跑通闭环，让数据飞轮先转起来。**

## 当前架构

```
用户
  │
  ├─ 填表单（手动）
  ├─ 选风格（手动）
  ├─ 点生成
  │     │
  │     ▼
  │  DeepSeek API  ←── prompt（写死的）
  │     │
  │     ▼
  │  生成文案 → 人修改 → 发布
  │
  └─ 快捷指令（手动点）
```

**本质**：一个带有 UI 的 API 调用器。

---

## Agent 目标架构

```
用户：帮我写一篇酸奶笔记，图片已经上传了

Agent：
  │
  ├─ ① 分析商品（文字提取 + 视觉分析图片）
  ├─ ② 检索语料库（找乳品高分笔记）
  ├─ ③ 决定风格（品类→风格映射 + 用户偏好）
  ├─ ④ 生成文案（DeepSeek）
  ├─ ⑤ 自检（合规 + 字数 + 标题污染）
  └─ ⑥ 输出 + 记住偏好
```

---

## 四阶段实现路径

### 阶段 1：多工具（POC 优先）

**思路**：先做乳品一个品类簇，跑通全流程，再复制扩展。

| 工具 | 能力 | 状态 | POC 计划 |
|------|------|:--:|------|
| 文本生成 | DeepSeek 写文案 | ✅ | — |
| 文件解析 | Word/Excel→提取商品信息 | ✅ | — |
| 视觉分析 | GLM-4V 看图→分类+描述 | 🔜 | 接入 + 乳品 5 图测试 |
| 语料检索 | RAG 检索高分笔记 | 🔜 | 乳品 5 篇先入库 |
| 合规扫描 | 违禁词检测 | ✅ | — |

**POC 验证闭环**：

```
5 篇乳品语料 + 1 个视觉模型（GLM-4V（待定））
                    ↓
        生成一篇带图文混排的乳品笔记
                    ↓
              运营看效果：行不行？
```

**文件结构**：

```
server/services/
  ├── generator.js     ✅ 文本生成
  ├── vision.js        🔜 视觉分析
  ├── compliance.js    ✅ 合规扫描
  ├── rag.js           🔜 语料检索
  └── orchestrator.js  🔜 编排器（阶段 2）
```

---

### 阶段 2：自主决策

**从"人选择"到"Agent 选择"。**

| 决策点 | 现在（人决定） | Agent（自己决定） |
|------|------|------|
| 风格 | 人点快捷指令 | 品类→风格映射 + 用户历史 |
| 字数 | 看效果判断 | 品类默认 + 用户偏好 |
| emoji 密度 | 人点"增加"/"去除" | 风格规则自动匹配 |
| 图片位置 | 人拖拽 | 视觉分析→标签→模块映射 |
| 是否检索语料 | 人不说就不做 | 自动检索同类目 |

**实现**：纯规则引擎，不调 AI。

```js
// orchestrator.js — Agent 的"大脑"
async function decideStrategy(product, user) {
  const category = product.category           // 乳品
  const history = await getUserHistory(user)  // 用户历史偏好
  const similarProducts = await ragSearch(product)  // 语料检索
  
  return {
    style:    inferStyle(category, history),       // 品类→风格映射表
    length:   inferLength(category, history),       // 品类默认 + 用户偏好
    emoji:    inferEmoji(category, history),        // 风格规则
    images:   await analyzeImages(product.images),  // GLM-4V
    reference: similarProducts.slice(0, 3),        // 参考笔记
  }
}
```

---

### 阶段 3：记忆 + 学习

**从"每次都是第一次"到"越用越懂你"。**

**本质是规则驱动，不是 AI 自己悟的。** 系统记录运营的修改模式 → 统计分析 → 下次自动应用规则。可控、可预测、不会跑偏。

```
运营每次手动改 taste 模块 +30% 字数
    ↓
系统记录：用户偏好 taste 详细描述
    ↓
下次生成时自动把 taste 的字数要求 ×1.3
    ↓
运营不用再手动改了
```

```
用户                               Agent 记住
  │                                   │
  ├─ 每次都手动删"姐妹们"            → 用户不喜欢小红书腔
  ├─ 每次都改 taste 模块的字数         → 用户偏好口感细节 ×1.5
  ├─ 每次都把图片放文末                → 用户不喜欢图中插文
  └─ 偏好"资深用户直推风"             → 默认风格锁定
```

**用户画像结构**：

```json
{
  "id": "user_001",
  "preferences": {
    "defaultStyle": "girlfriend",
    "lengthPreference": "detailed",
    "emojiLevel": "medium"
  },
  "editPatterns": {
    "frequentlyDeletedWords": ["姐妹们", "手慢无"],
    "moduleEdits": { "taste": "+30%", "hook": "-20%" }
  },
  "history": {
    "totalGenerations": 87,
    "adoptedRate": 0.72
  }
}
```

**存储方案**：先 localStorage（POC），多用户时上 SQLite。

---

### 阶段 4：自检 + 自修

**从"人检查"到"Agent 检查"。**

```
生成完 → Agent 自己跑一遍：

□ 合规扫描：有违禁词吗？→ 有 → 自动替换
□ 字数检查：达标了吗？→ taste 少 15 字 → 补 15 字
□ 标题检查：首行有 [常见问题] 吗？→ 有 → 删掉
□ emoji 检查：超风格上限了吗？→ 超了 → 删 2 个
□ 图片检查：有图但没插入吗？→ 有 → 按规则插入

全部通过 → 输出
```

**实现**：纯规则引擎。

```js
async function selfCheck(modules, rules) {
  const issues = []
  for (const [key, content] of Object.entries(modules)) {
    if (wordCount(content) < rules[key].minWords)
      issues.push({ module: key, type: 'too_short', fix: extendContent })
    if (hasBannedWords(content))
      issues.push({ module: key, type: 'compliance', fix: replaceBanned })
  }
  return autoFix(issues, modules)
}
```

---

## 技术依赖关系

```
阶段 1（多工具）
  ├── 视觉模型：GLM-4V（待定）（免费）
  └── 语料检索：DeepSeek embedding + 内存向量
        │
        ▼
阶段 2（自主决策）
  └── 规则引擎：品类→风格映射表（纯 JS）
        │
        ▼
阶段 3（记忆学习）
  └── 用户画像：localStorage + 统计（纯 JS）
        │
        ▼
阶段 4（自检自修）
  └── 检查管道：规则列表 + 自动修复（纯 JS）
```

---

## 投入产出 + 并行策略

| 阶段 | 新增能力 | 投入 | MVP 并行 |
|:--:|------|:--:|:--:|
| MVP | 图文混排 + 语料 + 埋点 | 先跑通 | ← 当前 |
| 1 | 视觉分析 + 语料检索 | MVP 核心 | — |
| 2 | 自主决策 | 3-5 天 | 运营收集其余 13 簇语料 |
| 3 | 用户记忆 | 5-7 天 | 同上，并行推进 |
| 4 | 自检自修 | 2-3 天 | 同上，并行推进 |

**核心洞察**：阶段 2-4 都不需要新模型，全部用规则引擎实现。真正的"Agent 感"来自决策逻辑，不是模型大小。

**MVP 通过后，研发和运营两条线并行**：运营按模板收集语料（他们的任务），你开发 Agent 能力（你的任务），互不阻塞。

---

## 多品类扩展

当前只做食品保健 + 水果生鲜（14 模块）。扩展到其他一级类目时，每个类目有自己的模块结构，但前端框架、后端架构、Agent 逻辑全部复用：

| 阶段 | 一级类目 | 模块数 | 状态 |
|:--:|------|:--:|:--:|
| 食品 POC | 食品保健 | 14 | ✅ |
| 食品完整版 | 食品保健 + 水果生鲜 | 14 | 🔜 |
| 扩展 1 | 美容个护 | ~12 | 📋 |
| 扩展 2 | 服饰箱包 | ~10 | 📋 |
| 扩展 3 | 数码电器 | ~8 | 📋 |
| ... | 其余 | 逐个 | 📋 |

POC 先从乳品一个品类簇开始，跑通后同品类内扩展只需补语料（不改代码），跨品类扩展需新增模块结构（架构复用）。
