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

  // 豆包视觉模型（doubao-seed-2.0-lite）— 图片分类 + 描述
  vision: {
    // 本地用 HTTP（TLS 握手问题），部署用 HTTPS
    endpoint: (process.env.NODE_ENV === 'production' ? 'https' : 'http') + '://ark.cn-beijing.volces.com/api/v3/chat/completions',
    apiKey: process.env.DOUBAO_API_KEY || 'ark-b255732d-aa98-44c7-ab79-63b40cf31db2-f22a7',
    model: 'doubao-seed-2-0-mini-260428',
    temperature: 0.1,
    maxTokens: 80,
    timeout: 20000,
  },
}
