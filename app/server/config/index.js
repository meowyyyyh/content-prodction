// ============================================================
// 服务端配置
// ============================================================

export const CONFIG = {
  port: process.env.PORT || 3001,

  // DeepSeek API 直连
  llm: {
    endpoint: 'https://api.deepseek.com/chat/completions',
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    model: 'deepseek-chat',
    maxTokens: 8192,
    temperature: 0.8,
    timeout: 60000,
  },

  // 合规规则文件路径（相对于 server 目录）
  complianceRulesPath: '../../data/compliance/forbidden_words_dev.json',

  // 语料库路径
  corpusPath: '../../data/rag/corpus_index.json',

  // 豆包视觉模型（doubao-seed-2.0-lite）— 图片分类 + 描述
  vision: {
    endpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    apiKey: process.env.DOUBAO_API_KEY || '',
    model: 'doubao-seed-2-0-lite-260428',
    temperature: 0.1,
    maxTokens: 60,
    timeout: 15000,
  },
}
