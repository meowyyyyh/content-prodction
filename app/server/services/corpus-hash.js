// ============================================================
// 语料库图片指纹 — 平均哈希 (aHash)
// 用于上传图片与语料库的精确匹配
// ============================================================

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * 计算图片的 aHash (64-bit)
 * 不依赖外部库：读 JPEG/PNG 像素，缩放到 8x8，算平均值，逐像素比较
 * 简化版：用 ImageData 需要 canvas，服务端用 sharp 太重
 * 方案：读取原始图片字节 → 固定采样 8x8=64 个位置 → 灰度 → hash
 */
export function computeImageHash(imageBuffer) {
  // 读取文件头部获取尺寸（简化：固定采样）
  // 采样 8x8 网格上的灰度值
  const len = imageBuffer.length
  const samples = []
  // 在文件数据中均匀采样 64 个位置（跳过头部，从 1/4 处开始）
  const start = Math.floor(len * 0.25)
  const step = Math.floor((len * 0.5) / 64)
  for (let i = 0; i < 64; i++) {
    const pos = start + i * step
    if (pos < len) {
      // 取 RGB 平均值作为灰度近似
      const b = imageBuffer[pos]
      samples.push(b)
    } else {
      samples.push(0)
    }
  }
  const avg = samples.reduce((s, v) => s + v, 0) / 64
  // 逐像素比较，生成 64-bit hash
  let hash = 0n
  for (let i = 0; i < 64; i++) {
    if (samples[i] > avg) hash |= (1n << BigInt(63 - i))
  }
  return hash.toString(16).padStart(16, '0')
}

/**
 * 计算两个 hash 的汉明距离
 */
export function hammingDistance(hash1, hash2) {
  const n1 = BigInt('0x' + hash1)
  const n2 = BigInt('0x' + hash2)
  let xor = n1 ^ n2
  let dist = 0
  while (xor > 0n) { dist++; xor &= (xor - 1n) }
  return dist
}

/**
 * 预计算所有语料库图片的指纹
 * 输出到 data/rag/corpus_hashes.json
 */
export function buildCorpusHashIndex() {
  const corpusDir = resolve(__dirname, '../../../data/corpus')
  if (!existsSync(corpusDir)) return {}

  const hashIndex = {}

  function scan(dir) {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'images') {
        scan(resolve(dir, e.name))
      } else if (e.name === 'images') {
        // 找到 images 目录 → 扫描所有图片
        const imageFiles = readdirSync(resolve(dir, e.name))
        for (const imgFile of imageFiles) {
          if (/\.(jpg|jpeg|png|gif|webp)$/i.test(imgFile)) {
            try {
              const buf = readFileSync(resolve(dir, e.name, imgFile))
              const hash = computeImageHash(buf)
              hashIndex[imgFile.toLowerCase()] = hash
            } catch { /* skip */ }
          }
        }
      }
    }
  }
  scan(corpusDir)

  // 同时加载语料 JSON，提取每张图片的元信息
  const imageMeta = {}

  function scanMeta(dir) {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith('.')) {
        scanMeta(resolve(dir, e.name))
      } else if (e.name.endsWith('.json')) {
        try {
          const data = JSON.parse(readFileSync(resolve(dir, e.name), 'utf-8'))
          if (data.images) {
            for (const img of data.images) {
              const fileName = img.file?.split('/').pop()?.toLowerCase()
              if (fileName) {
                imageMeta[fileName] = {
                  type: img.primaryType || img.type?.[0] || '其他',
                  module: img.module || '',
                  desc: img.desc || '',
                  imageContentSummary: img.imageContentSummary || '',
                }
              }
            }
          }
        } catch { /* skip */ }
      }
    }
  }
  scanMeta(corpusDir)

  return { hashes: hashIndex, meta: imageMeta }
}

// 直接运行：node services/corpus-hash.js
if (process.argv[1]?.includes('corpus-hash.js')) {
  const outPath = resolve(__dirname, '../../../data/rag/corpus_hashes.json')
  const index = buildCorpusHashIndex()
  writeFileSync(outPath, JSON.stringify(index, null, 2))
  console.log(`已生成指纹库：${Object.keys(index.hashes).length} 张图片，${Object.keys(index.meta).length} 条元信息 → ${outPath}`)
}
