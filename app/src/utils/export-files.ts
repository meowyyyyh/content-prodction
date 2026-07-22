/**
 * 导出工具：系统"另存为"对话框选择文件夹 → 图片入子文件夹 + 文本(.doc)同级输出
 * 不支持 File System Access API 时降级为 ZIP 下载
 */

interface ExportImage {
  dataUrl: string
  ext: string
  index: number
}

interface ExportVideo {
  file: File
  fileName: string
  index: number
}

interface ExportResult {
  success: boolean
  method: 'directory' | 'zip'
  cancelled?: boolean
  error?: string
}

/** 从 HTML 内容中提取所有 base64 图片 */
function extractImages(html: string, startIndex: number): ExportImage[] {
  const images: ExportImage[] = []
  const imgRegex = /<img[^>]+src="(data:image\/[^"]+)"[^>]*>/gi
  let match: RegExpExecArray | null
  while ((match = imgRegex.exec(html)) !== null) {
    const dataUrl = match[1]
    // 解析 MIME 类型获取扩展名
    const mimeMatch = dataUrl.match(/data:image\/(\w+);base64,/)
    const ext = mimeMatch
      ? (mimeMatch[1] === 'jpeg' ? 'jpg' : mimeMatch[1])
      : 'png'
    images.push({ dataUrl, ext, index: startIndex + images.length + 1 })
  }
  return images
}

/** 从 HTML 内容中提取纯文本：去 img 标签、<br>→换行、去 HTML 标签、保留 emoji */
function extractText(html: string): string {
  if (!html) return ''
  return html
    .replace(/<img[^>]+>/gi, '')       // 去图片标签
    .replace(/<br\s*\/?>/gi, '\n')     // <br> → 换行
    .replace(/<[^>]+>/g, '')           // 去所有 HTML 标签
    .replace(/\n{3,}/g, '\n\n')        // 压缩连续空行
    .trim()
}

/** 将 base64 data URL 解码为 Uint8Array */
function base64ToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/** 生成 Word 兼容 HTML 文档（笔记标题 + 核心卖点 + 正文） */
function buildWordHtml(text: string, headline?: string, sellingPoints?: string): string {
  const parts: string[] = []
  if (headline) parts.push(`<h1 style="font-size:18px;font-weight:bold;margin-bottom:12px">${headline}</h1>`)
  if (sellingPoints) parts.push(`<p style="font-size:14px;color:#555;margin-bottom:16px">${sellingPoints.replace(/\n/g, '<br>')}</p>`)
  if (headline || sellingPoints) parts.push('<hr style="border:none;border-top:1px solid #eee;margin:16px 0">')
  parts.push(text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>'))
  const body = parts.join('\n')
  return `<html><head><meta charset="utf-8"><style>body{font-family:'PingFang SC',sans-serif;line-height:1.8;padding:40px;white-space:pre-wrap}</style></head><body>${body}</body></html>`
}

/** File System Access API 写出 */
async function writeViaDirectoryPicker(
  dirName: string,
  images: ExportImage[],
  videos: ExportVideo[],
  text: string,
  headline?: string,
  sellingPoints?: string
): Promise<ExportResult> {
  const dirHandle = await (window as any).showDirectoryPicker()

  // 创建资源子文件夹
  const resourceFolder = await dirHandle.getDirectoryHandle(dirName, { create: true })

  // 写图片文件
  for (const img of images) {
    const fileName = `img_${String(img.index).padStart(3, '0')}.${img.ext}`
    const fileHandle = await resourceFolder.getFileHandle(fileName, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(base64ToBytes(img.dataUrl))
    await writable.close()
  }

  // 写视频文件
  for (const vid of videos) {
    const fileHandle = await resourceFolder.getFileHandle(vid.fileName, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(vid.file)
    await writable.close()
  }

  // 写文本文件（和文件夹同级）
  const wordHtml = buildWordHtml(text, headline, sellingPoints)
  const textFileHandle = await dirHandle.getFileHandle(`${dirName}.doc`, { create: true })
  const textWritable = await textFileHandle.createWritable()
  await textWritable.write(wordHtml)
  await textWritable.close()

  return { success: true, method: 'directory' }
}

/** ZIP 降级方案 */
async function writeViaZip(
  dirName: string,
  images: ExportImage[],
  videos: ExportVideo[],
  text: string,
  headline?: string,
  sellingPoints?: string
): Promise<ExportResult> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()

  // 资源子文件夹
  const resourceFolder = zip.folder(dirName)!

  for (const img of images) {
    const fileName = `img_${String(img.index).padStart(3, '0')}.${img.ext}`
    const base64 = img.dataUrl.split(',')[1]
    resourceFolder.file(fileName, base64, { base64: true })
  }

  // 写视频文件（二进制）
  for (const vid of videos) {
    const blob = new Blob([vid.file], { type: vid.file.type })
    resourceFolder.file(vid.fileName, blob)
  }

  // 文本文件（和文件夹同级）
  const wordHtml = buildWordHtml(text, headline, sellingPoints)
  zip.file(`${dirName}.doc`, wordHtml)

  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${dirName}.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)

  return { success: true, method: 'zip' }
}

/** 主入口：导出到磁盘 */
export async function exportToDisk(options: {
  productName: string
  headline?: string
  sellingPoints?: string
  modules: { key: string; content?: string }[]
  videoFiles?: Map<string, File>
  onExportCorpus?: () => void
  showToast?: (msg: string, type?: 'info' | 'success' | 'error') => void
}): Promise<void> {
  const { productName, headline, sellingPoints, modules, videoFiles, onExportCorpus, showToast } = options

  // 1. 保留语料 JSON 导出
  onExportCorpus?.()

  // 2. 从模块中提取图片、视频和文本（不含模块标题）
  let globalImgIdx = 0
  const allImages: ExportImage[] = []
  const allVideos: ExportVideo[] = []
  const textParts: string[] = []

  for (const mod of modules) {
    const html = mod.content || ''
    if (!html || html === '<br>') continue

    // 视频模块：从 videoFiles map 取文件
    if (mod.key.startsWith('__video_')) {
      const vf = videoFiles?.get(mod.key)
      if (vf) {
        let videoMeta: any = null
        try { videoMeta = JSON.parse(html) } catch {}
        const ext = vf.name.split('.').pop() || 'mp4'
        allVideos.push({ file: vf, fileName: `video_${String(allVideos.length + 1).padStart(3, '0')}.${ext}`, index: allVideos.length + 1 })
      }
      continue // 视频模块不含文本，跳过
    }

    const modImages = extractImages(html, globalImgIdx)
    allImages.push(...modImages)
    globalImgIdx += modImages.length

    const modText = extractText(html)
    if (modText) textParts.push(modText)
  }

  const fullText = textParts.join('\n\n')
  const safeName = productName.replace(/[\\/:*?"<>|]/g, '_').trim() || '笔记定稿'

  showToast?.('正在导出...', 'info')

  // 3. 尝试 File System Access API
  if ('showDirectoryPicker' in window) {
    try {
      const result = await writeViaDirectoryPicker(safeName, allImages, allVideos, fullText, headline, sellingPoints)
      if (result.success) {
        showToast?.(
          `已导出到文件夹：图片 ${allImages.length} 张 + 文本`,
          'success'
        )
        return
      }
    } catch (e: any) {
      // 用户取消选择 → 静默退出
      if (e.name === 'AbortError') {
        showToast?.('已取消导出', 'info')
        return
      }
      // 系统保护文件夹（如桌面/文稿）→ 降级 ZIP 并提示
      if (e.name === 'DOMException' || e.message?.includes('system') || e.message?.includes('open this folder')) {
        showToast?.('该文件夹受系统保护，已通过 ZIP 下载', 'info')
      } else {
        console.warn('File System Access API 失败，降级为 ZIP:', e)
      }
    }
  }

  // 4. 降级：ZIP 下载
  try {
    showToast?.('浏览器不支持文件夹选择，正通过 ZIP 下载...', 'info')
    await writeViaZip(safeName, allImages, allVideos, fullText, headline, sellingPoints)
    showToast?.('已导出 ZIP（含图片文件夹 + 文本）', 'success')
  } catch (e: any) {
    console.error('ZIP 导出失败:', e)
    showToast?.('导出失败，请重试', 'error')
  }
}
