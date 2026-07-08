/**
 * 从 compliance_rules_full.json（权威数据源）导出 forbidden_words_dev.json（开发用管线格式）
 *
 * 使用方式：
 *   node export_dev_rules.js
 *
 * 输出文件：
 *   ./forbidden_words_dev.json（与脚本同目录）
 *
 * 维护说明：
 *   - 所有违禁词规则的增删改统一在 compliance_rules_full.json 中进行
 *   - 修改后运行本脚本即可自动更新 forbidden_words_dev.json
 *   - POC 阶段可手动运行；MVP 阶段可集成到 pre-commit hook 或 CI 流程
 */

const fs = require('fs');
const path = require('path');

const FULL_RULES_PATH = path.join(__dirname, 'compliance_rules_full.json');
const DEV_RULES_PATH = path.join(__dirname, 'forbidden_words_dev.json');

// ── 读取权威数据源 ──
const fullRules = JSON.parse(fs.readFileSync(FULL_RULES_PATH, 'utf-8'));
const { modules } = fullRules;
const { banned_categories, forbidden_words, content_rules } = modules;

// ── 工具函数：将 full 版规则转为 dev 版精简格式 ──
function simplifyRule(rule) {
  const simplified = {
    rule_id: rule.rule_id,
    violation_type: rule.violation_type || rule.banned_category,
    risk_level: rule.risk_level,
    match_mode: rule.match_mode || 'exact',
    keywords: rule.keywords || [],
  };
  // 仅当存在例外模式时才输出
  if (rule.exception_pattern && rule.exception_pattern.length > 0) {
    simplified.exception_pattern = rule.exception_pattern;
  }
  // 仅当有违规描述时才输出（content_rules 类）
  if (rule.violation_desc) {
    simplified.violation_desc = rule.violation_desc;
  }
  return simplified;
}

// ── 按 check_stage 分流 ──
const pre_banned = [];
const post_check = [];

// 处理 banned_categories
for (const rule of banned_categories) {
  const simplified = simplifyRule(rule);
  if (rule.check_stage === 'pre_banned') {
    pre_banned.push(simplified);
  } else if (rule.check_stage === 'post_check') {
    post_check.push(simplified);
  }
}

// 处理 forbidden_words
for (const rule of forbidden_words) {
  const simplified = simplifyRule(rule);
  if (rule.check_stage === 'pre_banned') {
    pre_banned.push(simplified);
  } else if (rule.check_stage === 'post_check') {
    post_check.push(simplified);
  }
}

// 处理 content_rules
for (const rule of content_rules) {
  const simplified = simplifyRule(rule);
  if (rule.check_stage === 'pre_banned') {
    pre_banned.push(simplified);
  } else if (rule.check_stage === 'post_check') {
    post_check.push(simplified);
  }
}

// ── 组装 dev 格式 ──
const devRules = {
  version: fullRules.version,
  update_time: new Date().toISOString().split('T')[0],
  source: 'compliance_rules_full.json',
  note: '本文件由 export_dev_rules.js 自动生成，请勿手动编辑。修改规则请在 compliance_rules_full.json 中进行',
  applicable_platform: fullRules.applicable_platform,
  applicable_category: fullRules.applicable_category,
  pre_banned,
  post_check,
};

// ── 写入输出文件 ──
fs.writeFileSync(DEV_RULES_PATH, JSON.stringify(devRules, null, 2), 'utf-8');

// ── 统计输出 ──
console.log(`✅ forbidden_words_dev.json 已生成`);
console.log(`   pre_banned: ${pre_banned.length} 条规则`);
console.log(`   post_check: ${post_check.length} 条规则`);
console.log(`   总计: ${pre_banned.length + post_check.length} 条规则`);
console.log(`   数据源: ${FULL_RULES_PATH}`);
console.log(`   目标文件: ${DEV_RULES_PATH}`);
