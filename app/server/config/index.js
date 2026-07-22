// ============================================================
// 服务端配置
// ============================================================

export const CONFIG = {
  port: process.env.PORT || 3001,

  // DeepSeek API 直连
  llm: {
    endpoint: 'https://api.deepseek.com/chat/completions',
    apiKey: process.env.DEEPSEEK_API_KEY || 'sk-93e049fb3fd34333ad74f2ccd412e7c5',
    model: 'deepseek-chat',
    maxTokens: 8192,
    temperature: 0.8,
    timeout: 60000,
  },

  // 合规规则文件路径（相对于 server 目录）
  complianceRulesPath: '../../data/compliance/forbidden_words_dev.json',

  // 语料库路径
  corpusPath: '../../data/rag/corpus_index.json',

  // 豆包视觉模型（低延迟推理端点）— 图片分类 + 描述
  // 临时走 HTTP：HTTPS TLS 握手被阻断（2026-07-22）
  vision: {
    endpoint: 'http://ark.cn-beijing.volces.com/api/v3/chat/completions',
    apiKey: process.env.ARK_API_KEY || process.env.DOUBAO_API_KEY || '',
    model: 'ep-20260721203600-pz8qc',
    temperature: 0.1,
  maxTokens: 2000,
  timeout: 60000,
  },
}
