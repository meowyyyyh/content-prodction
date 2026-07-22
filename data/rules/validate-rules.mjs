// ============================================================
// RULES RAG 校验脚本
// 用法：node data/rules/validate-rules.mjs
// 检查 category_rules.json 中所有 key 的有效性
// ============================================================

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// 合法的一级类目名（与 categories.ts 中的 level1s 对齐）
const VALID_LEVEL1S = [
  '数码家电', '居家生活', '美妆洗护', '美食酒水', '母婴亲子',
  '鞋包服饰', '汽车旅行', '文体健康', '餐厨用品', '钟表眼镜',
  '办公学习', '家具', '家装建材', '虚拟卡券', '医药健康',
]

// 所有合法的 moduleKey（与 types/index.ts ModuleKey 对齐）
const VALID_MODULE_KEYS = [
  'hook', 'price', 'cta', 'aftercare', 'faq',
  'trust', 'brand', 'scene', 'tips', 'feedback',
  'taste', 'ingredient', 'origin',
  'texture', 'efficacy', 'usage_method', 'before_after', 'ingredient_analysis', 'suitable_skin',
  'product_info', 'usage_dosage', 'precautions', 'qualification',
  'fabric', 'styling', 'sizing', 'craftsmanship', 'care_washing',
  'safety', 'age_guide', 'parenting_knowledge', 'feeding_guide', 'growth_support',
  'material', 'usage_experience', 'home_styling', 'cleaning_care',
  'specs', 'unboxing', 'tutorial', 'product_compare', 'compatibility',
  'material_craft', 'usage_demo', 'durability', 'kitchen_styling',
  'performance', 'training_guide', 'health_benefit', 'safety_gear',
  'specs_perf', 'install_guide', 'compatibility_check', 'road_test',
  'design_detail', 'wear_experience', 'authenticity', 'optics_params',
  'material_structure', 'space_design', 'assembly_guide', 'durability_info',
  'tech_specs', 'install_process', 'quality_standard',
  'productivity', 'setup_guide', 'ergonomics', 'learning_support',
  'rights_list', 'plan_compare', 'activate_guide', 'platform_support',
  'validity_rules', 'support_policy', 'usage_scenarios', 'value_analysis',
]

let errors = 0

const rulesPath = resolve(__dirname, 'category_rules.json')
let rules
try {
  rules = JSON.parse(readFileSync(rulesPath, 'utf-8'))
} catch (e) {
  console.error('❌ JSON 解析失败:', e.message)
  process.exit(1)
}

for (const [catKey, catRules] of Object.entries(rules)) {
  if (catKey === '__universal__') {
    console.log('✓ __universal__')
  } else if (catKey === '*') {
    // skip — "*" is a module-level special key
  } else if (!VALID_LEVEL1S.includes(catKey)) {
    console.error(`❌ 未知类目: "${catKey}" — 不在合法一级类目列表中`)
    errors++
  } else {
    console.log(`✓ ${catKey}`)
  }

  if (typeof catRules !== 'object' || catRules === null) {
    console.error(`❌ ${catKey}: 值必须是对象`)
    errors++
    continue
  }

  for (const [modKey, modRules] of Object.entries(catRules)) {
    // "*" is the special global-rules key
    if (modKey === '*') {
      if (catKey === '__universal__') {
        console.error('❌ __universal__ 中不应使用 "*" 全局key')
        errors++
      }
      continue
    }

    if (!VALID_MODULE_KEYS.includes(modKey)) {
      console.error(`❌ ${catKey}.${modKey}: 未知模块key — 不在 ModuleKey 联合类型中`)
      errors++
      continue
    }

    if (!modRules || typeof modRules !== 'object') {
      console.error(`❌ ${catKey}.${modKey}: 值必须是 { forbidden, required } 对象`)
      errors++
      continue
    }

    if (modRules.forbidden !== undefined && !Array.isArray(modRules.forbidden)) {
      console.error(`❌ ${catKey}.${modKey}.forbidden: 必须是字符串数组`)
      errors++
    }
    if (modRules.required !== undefined && !Array.isArray(modRules.required)) {
      console.error(`❌ ${catKey}.${modKey}.required: 必须是字符串数组`)
      errors++
    }
  }
}

if (errors > 0) {
  console.error(`\n❌ ${errors} 个错误，请修正后重新运行`)
  process.exit(1)
} else {
  console.log(`\n✓ 全部通过 — 所有规则有效`)
}
