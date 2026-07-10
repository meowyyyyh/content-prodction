# 快稿种草小助手 — 最终架构

## 整体架构

```
                        用户浏览器
                   https://kuaigao.xxx.com
                            │
                            ▼
                   Cloudflare Pages
                    静态前端托管
                    国内访问友好
                            │ /api/*
                            ▼
                   Render / Railway
                   Express 后端
                            │
          ┌────────┬────────┼────────┬────────┐
          ▼        ▼        ▼        ▼        ▼
      DeepSeek  GLM-4V   语料库   合规扫描  用户画像
      (文本)   (视觉)   (RAG)   (关键词)  (localStorage/SQLite)
                            │
                            ▼
                    编排器 (Orchestrator)
                    纯 JS 规则引擎
                    不调 AI 做决策
```

---

## 核心模块

### 1. 编排器（Orchestrator）— Agent 的大脑

```
用户：帮我写一篇酸奶笔记，图片已上传

Orchestrator：
  │
  ├─ Step 1: 分析输入
  │    ├─ 品类识别：酸奶 → 乳品簇
  │    └─ 图片分析：3 张图 → 标签 + 描述（GLM-4V）
  │
  ├─ Step 2: 检索参考
  │    └─ 语料库检索：找到 3 篇乳品高分笔记（RAG）
  │
  ├─ Step 3: 决策
  │    ├─ 风格：用户偏好 闺蜜风 → 用闺蜜风模板
  │    ├─ 长度：用户历史偏好详细 → 不压缩
  │    └─ 图片位置：口感图→taste顶部，场景图→scene底部
  │
  ├─ Step 4: 生成
  │    └─ 组装 prompt → DeepSeek → 14 模块文案
  │
  ├─ Step 5: 自检
  │    ├─ 合规扫描、字数检查、标题污染、emoji 密度
  │    └─ 有问题 → 自动修复
  │
  └─ Step 6: 输出 + 记住偏好
```

**实现**：一个函数，用规则引擎，不调 AI 做决策。

### 2. 工具层

| 工具 | 模型/方式 | 作用 | 费用 |
|------|------|------|:--:|
| 文本生成 | DeepSeek | 写 14 模块文案 | 按量 |
| 视觉分析 | GLM-4V（待定） | 看图→分类+描述 | 免费 |
| 语料检索 | DeepSeek embedding | 搜高分笔记 | 按量 |
| 合规扫描 | 关键词匹配 | 违禁词检测 | 免费 |

### 3. 语料库

```
server/data/corpus/
  ├── dairy/          ← 乳品簇（POC 先做这个）
  │     ├── 001.json
  │     └── ...
  ├── snacks/         ← 零食簇
  ├── bakery/         ← 烘焙簇
  └── ...（13 个簇）

每篇格式：
{
  "id": "dairy-001",
  "cluster": "乳品",
  "content": { "hook": "...", "price": "...", ... },
  "images": [
    { "file": "img.jpg", "module": "taste", "order": 1, "desc": "拉丝特写" }
  ],
  "metrics": { "likes": 2300 },
  "tags": ["酸奶", "益生菌"]
}
```

### 4. 用户画像

```json
{
  "id": "user_001",
  "preferences": {
    "defaultStyle": "girlfriend",
    "lengthPreference": "detailed"
  },
  "editPatterns": {
    "frequentlyDeletedWords": ["姐妹们"],
    "moduleEdits": { "taste": "+30%" }
  },
  "history": {
    "totalGenerations": 87,
    "adoptedRate": 0.72
  }
}
```

---

## 文件结构

```
content-production/
  │
  ├── app/                          # 前端
  │     ├── src/
  │     │   ├── components/panels/
  │     │   │   ├── LeftPanel.tsx    # 商品配置 + 文件上传
  │     │   │   ├── CenterPanel.tsx  # 编辑区 + 快捷指令
  │     │   │   └── RightPanel.tsx   # 版本对比 + 采纳
  │     │   └── App.tsx
  │     └── vercel.json             # Vercel 部署（备用）
  │
  ├── server/                       # 后端
  │     ├── index.js                # Express 入口
  │     ├── config/index.js         # API keys, 端口
  │     ├── services/
  │     │   ├── generator.js        # DeepSeek 文本生成
  │     │   ├── vision.js           # GLM-4V 视觉分析（新增）
  │     │   ├── rag.js              # 语料检索（新增）
  │     │   ├── compliance.js       # 合规扫描
  │     │   ├── orchestrator.js     # Agent 编排器（新增）
  │     │   └── profile.js          # 用户画像（新增）
  │     ├── prompts/
  │     │   ├── global.js           # 全局系统指令
  │     │   ├── styles.js           # 5 套风格模板
  │     │   └── modules.js          # 14 模块 prompt
  │     └── data/
  │           ├── corpus/           # 语料库
  │           ├── profiles/         # 用户画像
  │           └── vectors/          # 向量索引
  │
  └── docs/                         # 会议文档
        ├── meeting-agenda-*.md
        ├── meeting-deep-dive-*.md
        ├── agent-roadmap.md
        ├── corpus-building-guide.md
        └── final-architecture.md
```

---

## 数据流（一次完整生成）

```
用户：填商品 + 上传 3 张图
     │ POST /api/generate
     ▼
orchestrator：接收任务
     │
     ├──→ vision.js      分析图片 → 标签 + 描述
     ├──→ rag.js         检索乳品语料 → 3 篇参考
     ├──→ profile.js     读取用户偏好
     │
     ├──→ orchestrator   综合决策：风格、长度、图片位置
     │
     ├──→ generator.js   组装 prompt → DeepSeek → 14 模块
     │
     ├──→ compliance.js  扫描违禁词
     ├──→ orchestrator   自检：合规、字数、标题、emoji
     │
     ├──→ profile.js     更新画像
     │
     └──→ 返回前端       14 模块 + 图片 + 元数据
```

---

## 部署

| 层 | 平台 | 费用 |
|------|------|:--:|
| 前端 | Cloudflare Pages | 免费 |
| 后端 | Render | 免费层 |
| 文本 AI | DeepSeek API | 按量 |
| 视觉 AI | GLM-4V（待定） | 免费 |

---

## 从 POC 到最终版本

| | POC（现在） | 2.0（做完视觉） | Final（Agent） |
|------|------|------|------|
| 生成 | 填表单→生成 | +上传图 | Agent 自动编排 |
| 风格 | 手动选 | 手动选 | Agent 推断 |
| 语料 | 无 | 乳品 5 篇 | 13 簇完整 |
| 图片 | 手动插 | 规则插入 | Agent 决策 |
| 记忆 | 无 | 无 | 画像+学习 |
| 自检 | 无 | 无 | 自动检查修正 |
