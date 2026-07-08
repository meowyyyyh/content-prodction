// ============================================================
// 服务端配置
// ============================================================

export const CONFIG = {
  port: process.env.PORT || 3001,

  // DeepSeek API 直连
  llm: {
    endpoint: 'https://api.deepseek.com/chat/completions',
    apiKey: 'sk-93e049fb3fd34333ad74f2ccd412e7c5',
    model: 'deepseek-chat',
    maxTokens: 8192,
    temperature: 0.8,
    timeout: 60000,
  },

  // 合规规则文件路径（相对于 server 目录）
  complianceRulesPath: '../../data/compliance/forbidden_words_dev.json',

  // 语料库路径
  corpusPath: '../../data/rag/food_rag_corpus_v1.0.json',
}
