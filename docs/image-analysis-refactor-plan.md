# 商品图分析 — 流式独立分析改造方案 v2

> 初版经 Codex 审核，已纳入反馈。新增/修改项以 **[v2]** 标注。

## 一、现状

### 当前流程

```
拖入图片 → 前端暂存（pending） → 点击「立即分析」
  → 全部同时前端压缩（512px, q=0.8）
  → 全部标 classifying
  → 指纹哈希 → 语料库匹配
  → 未命中图片批量调 /api/images/classify
  → 后端 classifyImages(batchSize=10, concurrency=3)
  → 等待全部完成
  → 一次性更新所有状态
  → 弹窗确认
```

### 痛点

1. **全量/全无**：90 张图必须等全部跑完才能看到结果，中间无法取消
2. **一张超时拖慢整体**：批次内 `Promise.all`，最慢那张决定整批速度
3. **失败无重试**：网络抖动/豆包超时/JSON 截断 → 直接标 error，运营得手动重来
4. **512px 分辨率偏低**：配料表/营养成分等小字区域模糊 → OCR 不全 → JSON 解析失败
5. **无并发控制**：前端 `Promise.allSettled` 全量并发，90 张同时压图浏览器可能卡顿

---

## 二、改后方案

### 核心思路

**每张图独立流水线 + 前端并发槽位控制 + 自动重试(jitter) + AbortController 取消**

### 整体架构

```
┌──────────────────────────────────────────────────────────┐
│  前端并发槽位 (maxConcurrency = 5)                         │
│                                                          │
│  [图1] [图2] [图3] [图4] [图5] ← 同时跑                    │
│  [图6] [图7] ... 排队等待，完成一张顶上一张                  │
│                                                          │
│  每张独立生命周期：                                        │
│    pending → compressing → classifying → done             │
│                  ↑              ↓                         │
│                  └── 重试(≤5) ← ❌ (带随机 jitter)          │
│                                     ↓                     │
│                              5次全失败 → error             │
│                                                          │
│  取消：AbortController 统一控制所有 in-flight 请求         │
└──────────────────────────────────────────────────────────┘
```

### 单张图生命周期

```
pending → compressing → classifying (第1次) → ✅ done
              ↑                  ↓
              └────── 重试 ←── ❌ (可重试错误)
              (最多5次，指数退避 + jitter)
                                  ↓
                        5次全失败 → ❌ error
```

#### 重试策略 [v2 重写]

| 应重试 | 不重试 |
|--------|--------|
| 网络错误 / fetch 失败 | 400 Bad Request |
| HTTP 5xx（500/502/503/504） | 401 Unauthorized |
| **[v2]** HTTP 408 Request Timeout | 403 Forbidden |
| **[v2]** HTTP 429 Too Many Requests（解析 Retry-After） | 404 Not Found |
| 超时（AbortError 非取消触发 / timeout） | 413 Payload Too Large |
| JSON 解析失败（截断导致） | 422 Unprocessable Entity |
| **[v2]** 200 OK 但 body 为空或非 JSON | **[v2]** 取消触发的 AbortError |

**[v2] 重试间隔（指数退避 + 随机 jitter）：**
```
delay = baseDelay * (0.75 + Math.random() * 0.5)
baseDelay: 1s → 2s → 4s → 8s → 16s
实际范围示例: 0.75-1.25s → 1.5-2.5s → 3-5s → 6-10s → 12-20s
```

jitter 确保 5 个槽位不会在同一时刻重试，避免谐振。

---

## 三、图片压缩策略 [v2 修改]

### 当前

```js
maxW = 512
quality = 0.8
// 无文件大小限制
```

### [v2] 改后

```js
longestEdge = 1024     // [v2] 改为长边限制，适配竖构图
quality = 0.7          // 省带宽，视觉模型对 JPEG artifact 不敏感
maxFileSize = 10MB     // [v2] 从 15MB 收紧到 10MB
maxBase64Size = 500KB  // 压缩后 base64 上限
mimeType = 从压缩输出推导 // [v2] 不传原图格式，用实际压缩结果
```

### [v2] 压缩流程（迭代降级链）

```
原图 → 检测文件大小
  ├─ >10MB → toast "图片较大（X MB），处理可能稍慢"（不阻塞，继续处理）
  │           [v2] 改为 toast 而非弹窗
  │
  └─ → canvas 缩放到长边 1024px → JPEG q=0.7
       → 检查 base64 大小
         ├─ ≤500KB → 发送（压缩结果缓存到图片状态，重试复用）
         └─ >500KB → ↓ 降级链
                        q=0.6 → ≤500KB? ✅
                          ↓否
                        q=0.5 → ≤500KB? ✅
                          ↓否
                        resize 长边 768px + q=0.7 → ≤500KB? ✅
                          ↓否
                        768px + q=0.5 → 发送（最终兜底）
```

### 压缩参数对比

| 参数 | 当前 | [v2]改后 | 原因 |
|------|------|----------|------|
| 缩放基准 | 512px (maxWidth) | **1024px (长边)** | [v2] 长边适配竖构图；配料表小字需要更多像素 |
| quality | 0.8 | **0.7** | 视觉模型对 JPEG 压缩不敏感，省 30% 体积 |
| 原图上限 | 无 | **10MB** | [v2] 收紧，手机原图 2-6MB，10MB 已留余量 |
| 超过上限行为 | — | toast 提醒，不阻塞 | [v2] 不弹窗阻塞 |
| base64 上限 | 无 | **500KB**（迭代降级） | [v2] 单次降质 → 迭代链，保证最终落在限制内 |
| 输出格式 | 跟随原图 | **统一 JPEG** | GIF/PNG 转 JPEG，一致性更好 |
| MIME type | 原图格式 | **[v2] 从压缩输出推导** | 避免压缩后 PNG 却传 image/png |
| 压缩缓存 | 无 | **[v2] 缓存 base64+压缩结果** | 重试不复压，节省 CPU |

---

## 四、并发控制 [v2 补充]

```
并发槽位 = 5 张同时
请求间隔 = 200-300ms 错峰启动 [v2]

90 张的执行时间线：
[t=0]     图1启动
[t+0.2s]  图2启动
[t+0.4s]  图3启动
[t+0.6s]  图4启动
[t+0.8s]  图5启动
[t+3s]    图1 ✅ → 图6 顶上（间隔0.2s后）
...
约 90/5 × 6s(avg) ≈ 108s 完成 90 张
```

### [v2] 与后端并发的关系

- 前端 5 并发 → 后端单图端点同时收到 ≤5 个独立请求
- 后端侧不做额外并发控制，豆包实际并发 = 前端并发槽位数
- **需确认新 endpoint 能承受 5 QPS 并发**（实施前）

---

## 五、后端改动 [v2 补充]

### 新增单张端点

```js
// POST /api/images/classify/single
// [v2] 带超时包装，防止永不 resolve
app.post('/api/images/classify/single', async (req, res) => {
  const { base64, mimeType } = req.body
  const { classifyImage } = await import('./services/vision.js')
  
  // [v2] 60s 超时包装
  const result = await Promise.race([
    classifyImage(base64, mimeType),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Vision API timeout after 60s')), 60000)
    )
  ])
  
  res.json({ success: true, data: result })
})
```

---

## 六、UI 变化

| 元素 | 现在 | 改后 |
|------|------|------|
| 拖入后状态 | ⏳ "等待分析" | ⏳ "等待分析" |
| 按钮 | 「立即分析」 | 「立即分析」→ 运行中变「停止分析」(红色) **[v2] 绑 AbortController** |
| 进度提示 | 全局 "分析中 45/90 · 约 315s" | 每张图独立状态 |
| 成功 | 🟢 绿色边框 + 类型标签 | 🟢 绿色边框 + 类型标签 |
| 进行中 | 🔵 转圈 | 🔵 转圈 + "分析中" |
| 重试中 | 无 | 🟡 转圈 + 角标 `第3次` |
| 失败 | 🔴 "失败" 标签 | 🔴 "失败(5次)" 标签，hover 显示错误原因 |
| 等待中 | 无 | ⚪ 灰色蒙版 + "排队中" |
| 确认弹窗 | 有 | **去掉**，结果实时流入 classifiedImages |
| **[v2]** 大图提示 | 无 | toast "图片较大（X MB），处理可能稍慢" |
| **[v2]** 手动修正 | 弹窗里的下拉 | **[v2]** 每张完成图上有小编辑入口，可改 suggestedModule |

---

## 七、语料库匹配 [v2 明确]

**保留。** 不做改动。现有 `match-corpus` → 命中直接出结果 → 未命中走豆包 的流程保持不变。因为：
- 语料命中是毫秒级，豆包是秒级，保留可显著降低延迟
- 避免豆包调用量翻倍
- 新旧标签一致性

---

## 八、改动文件清单

| 文件 | 改动内容 |
|------|----------|
| `LeftPanel.tsx` | 重写 `handleImageClassify`：并发槽位、独立重试(含 jitter)、AbortController 取消、实时状态更新、迭代压缩链、压缩缓存、去确认弹窗 |
| `server/index.js` | 新增 `POST /api/images/classify/single` 端点（含 60s 超时包装） |
| `server/services/vision.js` | 不动或微调 |
| `server/config/index.js` | 不涉及（已换好新 endpoint） |
| `image-confirm-dialog.tsx` | 删除（如完全去掉确认弹窗）或保留（如有手动修正需求） |

---

## 九、风险与边界 [v2 补充]

| 场景 | 处理 |
|------|------|
| 90 张全部失败 | 每张独立，可以看到每张的失败原因 |
| 中途关闭浏览器 | 图片存前端 File 引用，刷新即丢失（和现在一样） |
| 豆包限流 429 | **[v2]** 解析 Retry-After 重试，5 次后仍 429 标 error |
| 网络断开 | 5 次重试 + jitter。5 次后标 error |
| 用户点击停止 | **[v2]** AbortController.abort() 取消所有 in-flight 请求 |
| 再次点击开始 | 只处理 status=pending 的图，done/error 保持不动 |
| 低配电脑 | 并发 5 + 1024px 压缩，内存可控 |
| **[v2]** 豆包无响应 | 后端 60s 超时 → 前端触发重试 |
| **[v2]** in-flight 污染 | 取消时 AbortController 确保旧请求结果不写入状态 |
| **[v2]** MIME 不一致 | canvas 压缩输出统一 JPEG，mimeType 从结果推导 |
| **[v2]** 5 槽位同时 503 | jitter 错开重试时间，避免谐振 |

---

## 十、后续迭代（不在本次范围）

| 项目 | 优先级 |
|------|--------|
| **[v2]** localStorage 进度持久化 | 低 |
| **[v2]** 连续 N 张失败 → 断路器暂停 | 低 |
| **[v2]** 可观测性埋点（压缩耗时、API 耗时、重试次数） | 低 |
| **[v2]** "清空分析结果"按钮 | 低 |
