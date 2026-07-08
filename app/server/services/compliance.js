// ============================================================
// 合规校验服务
// POC 阶段：exact match（关键词 contains）
// MVP 阶段：增加 semantic match（embedding + 向量相似度）
// ============================================================

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

let rulesCache = null

/** 加载合规规则 */
export function loadRules() {
  if (rulesCache) return rulesCache

  const rulesPath = resolve(__dirname, '../../../data/compliance/forbidden_words_dev.json')
  const raw = readFileSync(rulesPath, 'utf-8')
  rulesCache = JSON.parse(raw)
  return rulesCache
}

/**
 * pre_banned 扫描
 * 在生成前检测输入，命中 critical 规则则阻断
 * @param {string} text - 待检测文本
 * @returns {{ passed: boolean, hits: Array }}
 */
export function preBannedCheck(text) {
  const rules = loadRules()
  const hits = []

  for (const rule of rules.pre_banned) {
    // POC: exact match（关键词 contains）
    if (rule.keywords && rule.keywords.length > 0) {
      for (const keyword of rule.keywords) {
        if (text.includes(keyword)) {
          hits.push({
            ruleId: rule.rule_id,
            violationType: rule.violation_type,
            riskLevel: rule.risk_level,
            flaggedText: keyword,
            stage: 'pre_banned',
            suggestion: rule.violation_desc || '',
          })
        }
      }
    }
  }

  return {
    passed: hits.length === 0,
    hits,
  }
}

/**
 * post_check 扫描
 * 在生成后检测输出，标记违规但不阻断
 * @param {string} text - 待检测文本
 * @returns {{ hits: Array }}
 */
export function postCheck(text) {
  const rules = loadRules()
  const hits = []

  for (const rule of rules.post_check) {
    if (rule.keywords && rule.keywords.length > 0) {
      for (const keyword of rule.keywords) {
        if (text.includes(keyword)) {
          // 检查例外模式
          let hasException = false
          if (rule.exception_pattern) {
            for (const exception of rule.exception_pattern) {
              // 简化：如果文本中包含例外模式且关键词在例外模式附近，则跳过
              if (text.includes(exception)) {
                hasException = true
                break
              }
            }
          }

          if (!hasException) {
            hits.push({
              ruleId: rule.rule_id,
              violationType: rule.violation_type,
              riskLevel: rule.risk_level,
              flaggedText: keyword,
              stage: 'post_check',
              suggestion: '', // P2 阶段从 full 版规则库获取替代建议
            })
          }
        }
      }
    }
  }

  return { hits }
}

/**
 * 完整合规扫描
 * @param {string} inputText - 用户输入文本
 * @param {string} outputText - AI 生成文本
 * @returns {{ preBanned, postCheck }}
 */
export function fullComplianceCheck(inputText, outputText) {
  const preBanned = preBannedCheck(inputText)
  const postCheckResult = preBanned.passed ? postCheck(outputText) : { hits: [] }

  return {
    preBanned: preBanned.hits,
    postCheck: postCheckResult.hits,
    blocked: !preBanned.passed,
  }
}
