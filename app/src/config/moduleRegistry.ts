// 模块注册表 + 类目→模块映射（三层查找链）
// Phase 1: 美食酒水可用，其他类目用纯通用模块

import type { ModuleKey, ModuleConfig } from '@/types'

// ============================================================
// 模块定义注册表
// ============================================================

export const ALL_MODULES: ModuleConfig[] = [
  // === 通用模块（5个，所有实体类目共享）===
  { key: 'hook', label: '首屏钩子', scope: 'common', description: '开场抓注意力，利益点前置' },
  { key: 'price', label: '价格福利', scope: 'common', description: '售价、规格数量、赠品权益、优惠力度' },
  { key: 'aftercare', label: '物流售后', scope: 'common', description: '发货时效、快递方式、售后规则' },
  { key: 'faq', label: '常见问题', scope: 'common', description: 'Q&A解答' },

  // === 类目适配模块（5个，prompt 按类目分化）===
  { key: 'trust', label: '基础信任', scope: 'common', description: '品质保证、认证、口碑、数据支撑' },
  { key: 'brand', label: '品牌背书', scope: 'common', description: '品牌故事、实力展示' },
  { key: 'scene', label: '场景共情', scope: 'common', description: '使用场景、生活方式' },
  { key: 'tips', label: '使用贴士', scope: 'common', description: '储存/使用/注意事项' },
  { key: 'feedback', label: '用户反馈', scope: 'common', description: '好评/用户晒单' },

  // === 美食酒水专属模块 ===
  { key: 'taste', label: '口感体验', scope: 'food', description: '味觉/嗅觉/质地描述' },
  { key: 'ingredient', label: '成分科普', scope: 'food', description: '配料/营养成分解读' },
  { key: 'origin', label: '原料溯源', scope: 'food', description: '产地/奶源/种植环境' },

  // === 美妆洗护专属模块（Batch 1）===
  { key: 'texture', label: '质地体验', scope: 'beauty', description: '质地、肤感、吸收度、气味' },
  { key: 'efficacy', label: '功效解析', scope: 'beauty', description: '核心成分功效、使用效果、作用机理' },
  { key: 'usage_method', label: '使用方法', scope: 'beauty', description: '正确步骤、用量、早晚区别、搭配建议' },
  { key: 'before_after', label: '效果对比', scope: 'beauty', description: '使用前后变化（基于事实，不夸大）' },
  { key: 'ingredient_analysis', label: '成分解读', scope: 'beauty', description: '明星成分科普、浓度/配方分析' },
  { key: 'suitable_skin', label: '适用肤质', scope: 'beauty', description: '不同肤质适用性、敏感肌测试结果' },

  // === 医药健康专属模块（Batch 2）===
  { key: 'product_info', label: '产品信息', scope: 'medical', description: '品名、规格、成分、批准文号（替代首屏钩子）' },
  { key: 'usage_dosage', label: '用法用量', scope: 'medical', description: '用法说明、剂量、频次、疗程' },
  { key: 'precautions', label: '注意事项', scope: 'medical', description: '禁忌人群、不良反应、药物相互作用' },
  { key: 'qualification', label: '资质证照', scope: 'medical', description: '批准文号、生产许可、GMP认证' },

  // === 鞋包服饰专属模块（Batch 3）===
  { key: 'fabric', label: '面料材质', scope: 'fashion', description: '面料成分、手感、透气性、挺括度' },
  { key: 'styling', label: '穿搭示范', scope: 'fashion', description: '搭配方案、风格指南、一衣多穿' },
  { key: 'sizing', label: '尺码版型', scope: 'fashion', description: '尺码表、试穿建议、版型特点' },
  { key: 'craftsmanship', label: '工艺细节', scope: 'fashion', description: '走线、五金、拼接、做工特写' },
  { key: 'care_washing', label: '洗护保养', scope: 'fashion', description: '洗涤方式、晾晒方法、防变形技巧' },

  // === 母婴亲子专属模块（Batch 4）===
  { key: 'safety', label: '安全材质', scope: 'mama', description: '材料安全标准、认证、无毒无害检测' },
  { key: 'age_guide', label: '分龄推荐', scope: 'mama', description: '适用月龄/年龄、发展阶段匹配' },
  { key: 'parenting_knowledge', label: '育儿知识', scope: 'mama', description: '科学育儿科普、发育指导' },
  { key: 'feeding_guide', label: '喂养指南', scope: 'mama', description: '冲泡方法、喂养频率、转奶建议' },
  { key: 'growth_support', label: '成长助力', scope: 'mama', description: '产品如何支持宝宝发育' },

  // === 居家生活专属模块（Batch 5）===
  { key: 'material', label: '材质工艺', scope: 'home', description: '面料/材质解析、工艺特点' },
  { key: 'usage_experience', label: '使用体验', scope: 'home', description: '上手感受、日常使用细节' },
  { key: 'home_styling', label: '家居搭配', scope: 'home', description: '风格搭配、摆放灵感' },
  { key: 'cleaning_care', label: '清洁保养', scope: 'home', description: '不同材质的清洁方法、保养周期' },

  // === 数码家电专属模块（Batch 6）===
  { key: 'specs', label: '参数评测', scope: 'digital', description: '核心参数解读、性能数据' },
  { key: 'unboxing', label: '开箱体验', scope: 'digital', description: '外观设计、配件清单、第一印象' },
  { key: 'tutorial', label: '使用教程', scope: 'digital', description: '操作指南、功能演示、进阶玩法' },
  { key: 'product_compare', label: '横向对比', scope: 'digital', description: '同价位/同类产品对比' },
  { key: 'compatibility', label: '兼容适配', scope: 'digital', description: '接口兼容性、系统要求、配件适配' },

  // === 餐厨用品专属模块（Batch 7）===
  { key: 'material_craft', label: '材质与工艺', scope: 'kitchen', description: '材质安全性、工艺特点、耐热温度' },
  { key: 'usage_demo', label: '使用演示', scope: 'kitchen', description: '操作步骤、使用技巧、注意事项' },
  { key: 'durability', label: '耐用性', scope: 'kitchen', description: '耐热/耐磨/抗摔、刮擦测试' },
  { key: 'kitchen_styling', label: '厨房搭配', scope: 'kitchen', description: '与厨房风格/其他餐具的搭配' },

  // === 文体健康专属模块（Batch 8）===
  { key: 'performance', label: '性能体验', scope: 'sports', description: '实际使用感受、性能表现' },
  { key: 'training_guide', label: '训练指南', scope: 'sports', description: '使用方法、训练计划、动作要领' },
  { key: 'health_benefit', label: '健康益处', scope: 'sports', description: '运动价值、身体改善（不夸大）' },
  { key: 'safety_gear', label: '安全防护', scope: 'sports', description: '护具安全性、防滑/缓冲/支撑' },

  // === 汽车旅行专属模块（Batch 9）===
  { key: 'specs_perf', label: '参数与性能', scope: 'auto', description: '核心参数、性能表现、实测数据' },
  { key: 'install_guide', label: '安装指南', scope: 'auto', description: '安装步骤、所需工具、注意事项' },
  { key: 'compatibility_check', label: '适配说明', scope: 'auto', description: '车型适配、年份兼容、接口匹配' },
  { key: 'road_test', label: '实测体验', scope: 'auto', description: '路试感受、噪音/稳定性/操控' },

  // === 钟表眼镜专属模块（Batch 10）===
  { key: 'design_detail', label: '设计细节', scope: 'watch', description: '外观设计、材质、工艺、细节特写' },
  { key: 'wear_experience', label: '佩戴体验', scope: 'watch', description: '舒适度、重量、贴合感、日常感受' },
  { key: 'authenticity', label: '正品鉴别', scope: 'watch', description: '防伪特征、鉴别方法、授权证明' },
  { key: 'optics_params', label: '光学参数', scope: 'watch', description: '镜片参数、镀膜、防蓝光/UV指标（眼镜专用）' },

  // === 家具专属模块（Batch 11）===
  { key: 'material_structure', label: '材质结构', scope: 'furniture', description: '主材/辅材、结构工艺、连接方式' },
  { key: 'space_design', label: '空间搭配', scope: 'furniture', description: '尺寸适配、风格搭配、布局建议' },
  { key: 'assembly_guide', label: '安装组装', scope: 'furniture', description: '安装步骤、工具需求、安装时间' },
  { key: 'durability_info', label: '耐用保障', scope: 'furniture', description: '承重测试、环保等级、质保年限' },

  // === 家装建材专属模块（Batch 11）===
  { key: 'tech_specs', label: '技术规格', scope: 'reno', description: '规格参数、技术指标、检测数据' },
  { key: 'install_process', label: '施工安装', scope: 'reno', description: '安装流程、施工要求、辅料需求' },
  { key: 'quality_standard', label: '质量标准', scope: 'reno', description: '国标/欧标/行业标准、检测报告' },

  // === 办公学习专属模块（Batch 12）===
  { key: 'productivity', label: '效率体验', scope: 'office', description: '使用效率提升、实际体验感受' },
  { key: 'setup_guide', label: '安装设置', scope: 'office', description: '开箱设置、初始化配置、驱动安装' },
  { key: 'ergonomics', label: '人体工学', scope: 'office', description: '舒适度、健康设计、护眼/护脊' },
  { key: 'learning_support', label: '学习助力', scope: 'office', description: '如何辅助学习/创作/工作效率' },

  // === 虚拟卡券专属模块（Batch 14）===
  { key: 'rights_list', label: '权益清单', scope: 'virtual', description: '逐条列出会员/卡券包含的所有权益' },
  { key: 'plan_compare', label: '套餐对比', scope: 'virtual', description: '不同档位/时长套餐的权益和价格对比' },
  { key: 'activate_guide', label: '开通指南', scope: 'virtual', description: '开通步骤、激活方式、兑换流程' },
  { key: 'platform_support', label: '平台兼容', scope: 'virtual', description: '支持的设备/平台/系统版本' },
  { key: 'validity_rules', label: '有效期规则', scope: 'virtual', description: '有效期说明、自动续费规则' },
  { key: 'support_policy', label: '售后与客服', scope: 'virtual', description: '退款政策、客服渠道、发票规则' },
  { key: 'usage_scenarios', label: '使用场景', scope: 'virtual', description: '什么情况下这个会员/卡券最值' },
  { key: 'value_analysis', label: '省钱计算', scope: 'virtual', description: '原价 vs 团购价、一年省多少' },

  // === 行动召唤（始终最后） ===
  { key: 'cta', label: '行动召唤', scope: 'common', description: '引导下单、团购入口' },
]

// ============================================================
// 模块配置类型
// ============================================================

export interface CategoryModuleConfig {
  mandatory: ModuleKey[]     // 必选（灰色不可取消）
  recommended: ModuleKey[]   // 推荐（默认勾选，可取消）
  optional: ModuleKey[]      // 可选（默认不勾选，doubao可触发自动勾选）
}

// ============================================================
// 一级默认（15个一级类目 → 默认模块组）
// 命名规则：__level1Name__
// ============================================================

export const LEVEL1_DEFAULTS: Record<string, CategoryModuleConfig> = {
  '__美食酒水__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['taste', 'trust', 'ingredient', 'origin', 'brand', 'scene', 'aftercare', 'tips', 'faq'],
    optional: ['feedback'],
  },
  '__美妆洗护__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['texture', 'efficacy', 'ingredient_analysis', 'usage_method', 'suitable_skin', 'trust', 'brand', 'scene', 'tips', 'faq'],
    optional: ['before_after', 'feedback', 'aftercare'],
  },
  '__医药健康__': {
    mandatory: ['product_info', 'precautions', 'cta'],
    recommended: ['usage_dosage', 'trust', 'qualification', 'brand', 'faq'],
    optional: ['price', 'tips', 'aftercare'],
    // 禁用模块：hook（由 product_info 替代）、scene（场景共情违规）、feedback（用户反馈违规）
  },
  '__鞋包服饰__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['fabric', 'styling', 'sizing', 'craftsmanship', 'trust', 'brand', 'scene', 'tips', 'care_washing', 'faq'],
    optional: ['feedback', 'aftercare'],
  },
  '__母婴亲子__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['safety', 'age_guide', 'trust', 'brand', 'scene', 'tips', 'faq'],
    optional: ['parenting_knowledge', 'feedback', 'aftercare'],
    // feeding_guide / growth_support 仅特定L2需要，通过 LEVEL2_OVERRIDE 开启
  },
  '__居家生活__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['material', 'usage_experience', 'trust', 'scene', 'tips', 'cleaning_care', 'faq'],
    optional: ['home_styling', 'brand', 'feedback', 'aftercare'],
  },
  '__数码家电__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['specs', 'unboxing', 'tutorial', 'trust', 'scene', 'tips', 'compatibility', 'faq'],
    optional: ['product_compare', 'brand', 'feedback', 'aftercare'],
  },
  '__餐厨用品__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['material_craft', 'usage_demo', 'trust', 'scene', 'tips', 'faq'],
    optional: ['durability', 'kitchen_styling', 'brand', 'feedback', 'aftercare'],
  },
  '__文体健康__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['performance', 'trust', 'scene', 'tips', 'faq'],
    optional: ['training_guide', 'health_benefit', 'safety_gear', 'brand', 'feedback', 'aftercare'],
    // training_guide / health_benefit / safety_gear 仅运动装备类L2需要
  },
  '__汽车旅行__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['specs_perf', 'install_guide', 'compatibility_check', 'trust', 'tips', 'faq'],
    optional: ['road_test', 'scene', 'brand', 'feedback', 'aftercare'],
  },
  '__钟表眼镜__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['design_detail', 'wear_experience', 'trust', 'brand', 'scene', 'tips', 'faq'],
    optional: ['authenticity', 'feedback', 'aftercare'],
    // optics_params 仅眼镜二级类目需要，通过 LEVEL2_OVERRIDE 开启
  },
  '__家具__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['material_structure', 'space_design', 'assembly_guide', 'trust', 'tips', 'faq'],
    optional: ['durability_info', 'brand', 'scene', 'feedback', 'aftercare'],
  },
  '__家装建材__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['tech_specs', 'install_process', 'quality_standard', 'trust', 'tips', 'faq'],
    optional: ['scene', 'brand', 'feedback', 'aftercare'],
  },
  '__办公学习__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['productivity', 'setup_guide', 'trust', 'ergonomics', 'scene', 'tips', 'faq'],
    optional: ['learning_support', 'brand', 'feedback', 'aftercare'],
  },
  '__虚拟卡券__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['rights_list', 'plan_compare', 'activate_guide', 'validity_rules', 'support_policy', 'value_analysis'],
    optional: ['platform_support', 'usage_scenarios', 'faq'],
  },
  '__default__': {  // 其他一级类目 → 纯通用
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['trust', 'brand', 'scene', 'aftercare', 'tips', 'faq'],
    optional: ['feedback'],
  },
}

// ============================================================
// 二级覆盖（整个二级类目需要不同配置时使用）
// 命名规则：__level1Name__level2Name__
// ============================================================

export const LEVEL2_OVERRIDES: Record<string, CategoryModuleConfig> = {
  // === 美食酒水 ===
  '__美食酒水__水果蔬菜__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['taste', 'trust', 'origin', 'brand', 'scene', 'aftercare', 'tips', 'faq'],
    optional: ['ingredient', 'feedback'],
  },
  '__美食酒水__肉蛋海鲜__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['taste', 'trust', 'origin', 'brand', 'scene', 'aftercare', 'tips', 'faq'],
    optional: ['ingredient', 'feedback'],
  },
  '__美食酒水__滋补保健__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['taste', 'trust', 'origin', 'brand', 'scene', 'aftercare', 'tips', 'faq'],
    optional: ['ingredient', 'feedback'],
  },
  '__美食酒水__粮油调味__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['taste', 'trust', 'origin', 'brand', 'scene', 'aftercare', 'tips', 'faq'],
    optional: ['ingredient', 'feedback'],
  },

  // === 母婴亲子 ===
  '__母婴亲子__奶粉辅食__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['safety', 'age_guide', 'trust', 'brand', 'scene', 'tips', 'faq', 'feeding_guide', 'parenting_knowledge'],
    optional: ['growth_support', 'feedback', 'aftercare'],
  },
  '__母婴亲子__洗护喂养__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['safety', 'age_guide', 'trust', 'brand', 'scene', 'tips', 'faq', 'feeding_guide'],
    optional: ['parenting_knowledge', 'growth_support', 'feedback', 'aftercare'],
  },
  '__母婴亲子__玩具图书__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['safety', 'age_guide', 'trust', 'brand', 'scene', 'tips', 'faq', 'parenting_knowledge'],
    optional: ['growth_support', 'feeding_guide', 'feedback', 'aftercare'],
  },

  // === 钟表眼镜 ===
  '__钟表眼镜__眼镜__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['design_detail', 'wear_experience', 'trust', 'brand', 'scene', 'tips', 'faq'],
    optional: ['optics_params', 'authenticity', 'feedback', 'aftercare'],
  },

  // === 美妆洗护 ===
  '__美妆洗护__保养保健__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['trust', 'brand', 'scene', 'tips', 'faq'],
    optional: ['texture', 'efficacy', 'ingredient_analysis', 'usage_method', 'suitable_skin', 'before_after', 'feedback', 'aftercare'],
  },
  '__美妆洗护__香水彩妆__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['texture', 'efficacy', 'usage_method', 'trust', 'brand', 'scene', 'tips', 'faq'],
    optional: ['ingredient_analysis', 'suitable_skin', 'before_after', 'feedback', 'aftercare'],
  },
  '__美妆洗护__健康用品__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['trust', 'brand', 'scene', 'tips', 'faq'],
    optional: ['texture', 'efficacy', 'usage_method', 'feedback', 'aftercare'],
  },
  '__美妆洗护__口腔护理__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['texture', 'efficacy', 'ingredient_analysis', 'usage_method', 'trust', 'brand', 'scene', 'tips', 'faq'],
    optional: ['suitable_skin', 'before_after', 'feedback', 'aftercare'],
  },
  '__美妆洗护__女性护理__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['trust', 'brand', 'scene', 'tips', 'faq'],
    optional: ['texture', 'efficacy', 'usage_method', 'feedback', 'aftercare'],
  },
  '__美妆洗护__美妆工具__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['trust', 'tips', 'faq'],
    optional: ['texture', 'efficacy', 'ingredient_analysis', 'usage_method', 'suitable_skin', 'before_after', 'brand', 'scene', 'feedback', 'aftercare'],
  },

  // === 鞋包服饰 ===
  '__鞋包服饰__珠宝首饰__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['craftsmanship', 'trust', 'brand', 'scene', 'tips', 'faq'],
    optional: ['fabric', 'styling', 'sizing', 'care_washing', 'feedback', 'aftercare'],
  },

  // === 文体健康 ===
  '__文体健康__户外运动__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['performance', 'training_guide', 'trust', 'scene', 'tips', 'safety_gear', 'faq'],
    optional: ['health_benefit', 'brand', 'feedback', 'aftercare'],
  },
  '__文体健康__健身器材__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['performance', 'training_guide', 'trust', 'scene', 'tips', 'safety_gear', 'faq'],
    optional: ['health_benefit', 'brand', 'feedback', 'aftercare'],
  },
  '__文体健康__体育用品__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['performance', 'training_guide', 'trust', 'scene', 'tips', 'safety_gear', 'faq'],
    optional: ['health_benefit', 'brand', 'feedback', 'aftercare'],
  },

  // === 汽车旅行 ===
  '__汽车旅行__美容清洗__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['specs_perf', 'install_guide', 'trust', 'tips', 'faq'],
    optional: ['compatibility_check', 'road_test', 'scene', 'brand', 'feedback', 'aftercare'],
  },

  // === 数码家电 ===
  '__数码家电__数码电器配件__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['specs', 'unboxing', 'tutorial', 'compatibility', 'trust', 'scene', 'tips', 'faq'],
    optional: ['product_compare', 'brand', 'feedback', 'aftercare'],
  },

  // === 居家生活 ===
  '__居家生活__宠物生活__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['material', 'usage_experience', 'trust', 'scene', 'tips', 'cleaning_care', 'faq'],
    optional: ['home_styling', 'brand', 'feedback', 'aftercare'],
  },
  '__居家生活__家庭清洁__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['material', 'usage_experience', 'trust', 'tips', 'cleaning_care', 'faq'],
    optional: ['home_styling', 'scene', 'brand', 'feedback', 'aftercare'],
  },

  // === 餐厨用品 ===
  '__餐厨用品__一次性用品__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['material_craft', 'usage_demo', 'trust', 'scene', 'tips', 'faq'],
    optional: ['durability', 'kitchen_styling', 'brand', 'feedback', 'aftercare'],
  },

  // === 家具 ===
  '__家具__凳类__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['material_structure', 'space_design', 'trust', 'tips', 'faq'],
    optional: ['assembly_guide', 'durability_info', 'brand', 'scene', 'feedback', 'aftercare'],
  },
  '__家具__几类__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['material_structure', 'space_design', 'trust', 'tips', 'faq'],
    optional: ['assembly_guide', 'durability_info', 'brand', 'scene', 'feedback', 'aftercare'],
  },

  // === 办公学习 ===
  '__办公学习__办公耗材__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['trust', 'scene', 'tips', 'faq'],
    optional: ['productivity', 'setup_guide', 'ergonomics', 'learning_support', 'brand', 'feedback', 'aftercare'],
  },
  '__办公学习__安装维修__': {
    mandatory: ['hook', 'price', 'cta'],
    recommended: ['trust', 'scene', 'tips', 'faq'],
    optional: ['productivity', 'setup_guide', 'ergonomics', 'learning_support', 'brand', 'feedback', 'aftercare'],
  },
}

// ============================================================
// 三级精确覆盖（极少使用，通常为空）
// ============================================================

export const CATEGORY_MODULE_MAP: Record<string, CategoryModuleConfig> = {
  // 仅为特定三级类目需要不同配置时添加
}

// ============================================================
// 三层查找
// ============================================================
// lookup: catCode ("level1::level2::level3")
//   ① CATEGORY_MODULE_MAP[catCode]（三级精确）
//   ② LEVEL2_OVERRIDES["__level1__level2__"]（二级覆盖）
//   ③ LEVEL1_DEFAULTS["__level1__"]（一级默认）
//   ④ LEVEL1_DEFAULTS["__default__"]（兜底）

export function getModuleConfig(catLevel1: string, catLevel2: string, catLevel3: string): CategoryModuleConfig {
  // ① 三级精确
  const code = `${catLevel1}::${catLevel2}::${catLevel3}`
  if (CATEGORY_MODULE_MAP[code]) return CATEGORY_MODULE_MAP[code]

  // ② 二级覆盖
  const l2Key = `__${catLevel1}__${catLevel2}__`
  if (LEVEL2_OVERRIDES[l2Key]) return LEVEL2_OVERRIDES[l2Key]

  // ③ 一级默认
  const l1Key = `__${catLevel1}__`
  if (LEVEL1_DEFAULTS[l1Key]) return LEVEL1_DEFAULTS[l1Key]

  // ④ 兜底
  return LEVEL1_DEFAULTS['__default__']!
}

// ============================================================
// 模块展示顺序
// ============================================================

export const DEFAULT_MODULE_ORDER: Record<string, ModuleKey[]> = {
  // price 靠前第二顺位（2026-07-20 运营会议确认）；aftercare 默认不勾选，系统自动贴笔记末尾
  '美食酒水': ['hook', 'price', 'taste', 'origin', 'ingredient', 'trust', 'brand', 'scene', 'aftercare', 'tips', 'feedback', 'faq', 'cta'],
  '美妆洗护': ['hook', 'price', 'texture', 'efficacy', 'ingredient_analysis', 'usage_method', 'suitable_skin', 'trust', 'brand', 'before_after', 'scene', 'tips', 'feedback', 'faq', 'aftercare', 'cta'],
  '医药健康': ['product_info', 'usage_dosage', 'precautions', 'qualification', 'trust', 'brand', 'price', 'tips', 'faq', 'aftercare', 'cta'],
  '鞋包服饰': ['hook', 'price', 'fabric', 'craftsmanship', 'sizing', 'styling', 'trust', 'brand', 'scene', 'care_washing', 'tips', 'feedback', 'faq', 'aftercare', 'cta'],
  '母婴亲子': ['hook', 'price', 'safety', 'age_guide', 'feeding_guide', 'trust', 'brand', 'growth_support', 'parenting_knowledge', 'scene', 'tips', 'feedback', 'faq', 'aftercare', 'cta'],
  '居家生活': ['hook', 'price', 'material', 'usage_experience', 'trust', 'brand', 'home_styling', 'scene', 'cleaning_care', 'tips', 'feedback', 'faq', 'aftercare', 'cta'],
  '数码家电': ['hook', 'price', 'specs', 'unboxing', 'tutorial', 'compatibility', 'trust', 'brand', 'product_compare', 'scene', 'tips', 'feedback', 'faq', 'aftercare', 'cta'],
  '餐厨用品': ['hook', 'price', 'material_craft', 'usage_demo', 'durability', 'trust', 'brand', 'kitchen_styling', 'scene', 'tips', 'feedback', 'faq', 'aftercare', 'cta'],
  '文体健康': ['hook', 'price', 'performance', 'training_guide', 'safety_gear', 'trust', 'brand', 'health_benefit', 'scene', 'tips', 'feedback', 'faq', 'aftercare', 'cta'],
  '汽车旅行': ['hook', 'price', 'specs_perf', 'install_guide', 'compatibility_check', 'road_test', 'trust', 'brand', 'scene', 'tips', 'feedback', 'faq', 'aftercare', 'cta'],
  '钟表眼镜': ['hook', 'price', 'design_detail', 'wear_experience', 'optics_params', 'trust', 'brand', 'authenticity', 'scene', 'tips', 'feedback', 'faq', 'aftercare', 'cta'],
  '家具': ['hook', 'price', 'material_structure', 'assembly_guide', 'space_design', 'trust', 'brand', 'durability_info', 'scene', 'tips', 'feedback', 'faq', 'aftercare', 'cta'],
  '家装建材': ['hook', 'price', 'tech_specs', 'quality_standard', 'install_process', 'trust', 'brand', 'scene', 'tips', 'feedback', 'faq', 'aftercare', 'cta'],
  '办公学习': ['hook', 'price', 'productivity', 'setup_guide', 'ergonomics', 'trust', 'brand', 'learning_support', 'scene', 'tips', 'feedback', 'faq', 'aftercare', 'cta'],
  '虚拟卡券': ['hook', 'price', 'rights_list', 'plan_compare', 'value_analysis', 'activate_guide', 'validity_rules', 'support_policy', 'platform_support', 'usage_scenarios', 'faq', 'cta'],
  '__default__': ['hook', 'price', 'trust', 'brand', 'scene', 'aftercare', 'tips', 'feedback', 'faq', 'cta'],
}

// 生成 catCode
export function makeCatCode(level1: string, level2: string, level3: string): string {
  return `${level1}::${level2}::${level3}`
}

// 获取可用模块列表（该类目下可选的模块）
export function getAvailableModules(catLevel1: string, catLevel2: string, catLevel3: string): ModuleKey[] {
  const config = getModuleConfig(catLevel1, catLevel2, catLevel3)
  return [...new Set([...config.mandatory, ...config.recommended, ...config.optional])]
}

// 获取默认勾选的模块（仅 mandatory，非必选由 AI 深推决定）
export function getDefaultModules(catLevel1: string, catLevel2: string, catLevel3: string): ModuleKey[] {
  const config = getModuleConfig(catLevel1, catLevel2, catLevel3)
  return [...config.mandatory]
}

// ============================================================
// 类目模糊匹配（Levenshtein 距离兜底）
// ============================================================

function levenshteinDistance(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]) + 1
    }
  }
  return dp[m][n]
}

export type CategoryMatchResult = { matched: string; type: 'exact' | 'fuzzy' } | null

/** 在候选类目列表中做精确+模糊匹配 */
export function fuzzyMatchCategory(llmValue: string, candidates: string[], maxDistance = 2): CategoryMatchResult {
  if (!llmValue || !candidates.length) return null
  const trimmed = llmValue.trim()
  // 1) 精确匹配
  if (candidates.includes(trimmed)) return { matched: trimmed, type: 'exact' }
  // 2) 模糊匹配（Levenshtein ≤ maxDistance）
  let bestMatch: string | null = null
  let bestDist = Infinity
  for (const c of candidates) {
    const dist = levenshteinDistance(trimmed, c)
    if (dist < bestDist) { bestDist = dist; bestMatch = c }
  }
  if (bestMatch && bestDist <= maxDistance) return { matched: bestMatch, type: 'fuzzy' }
  return null
}

/** 三级类目模糊匹配：分别在一级、二级、三级候选列表中匹配 */
export function fuzzyMatchAllLevels(
  llmCat1: string, llmCat2: string, llmCat3: string,
  level1s: string[], getLevel2s: (l1: string) => string[], getLevel3s: (l1: string, l2: string) => string[],
): { catLevel1: string; catLevel2: string; catLevel3: string; matchType: 'exact' | 'fuzzy' | 'none' } {
  const l1Match = fuzzyMatchCategory(llmCat1, level1s)
  if (!l1Match) return { catLevel1: '', catLevel2: '', catLevel3: '', matchType: 'none' }

  const l2Candidates = getLevel2s(l1Match.matched)
  const l2Match = fuzzyMatchCategory(llmCat2, l2Candidates)
  if (!l2Match) return { catLevel1: l1Match.matched, catLevel2: '', catLevel3: '', matchType: l1Match.type }

  const l3Candidates = getLevel3s(l1Match.matched, l2Match.matched)
  const l3Match = fuzzyMatchCategory(llmCat3, l3Candidates)
  if (!l3Match) return { catLevel1: l1Match.matched, catLevel2: l2Match.matched, catLevel3: '', matchType: l1Match.type === 'fuzzy' || l2Match.type === 'fuzzy' ? 'fuzzy' : 'exact' }

  const worstType = l1Match.type === 'fuzzy' || l2Match.type === 'fuzzy' || l3Match.type === 'fuzzy' ? 'fuzzy' as const : 'exact' as const
  return { catLevel1: l1Match.matched, catLevel2: l2Match.matched, catLevel3: l3Match.matched, matchType: worstType }
}
