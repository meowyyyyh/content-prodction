import type { ModuleConfig, StyleConfig, SubCategoryConfig, ShippingOption } from '@/types'

export const MODULE_CONFIG: ModuleConfig[] = [
  // 必选模块（7个）
  { key: 'hook', label: '首屏钩子', category: 'mandatory', description: '开篇抓注意力，利益点前置，讲清产品是什么、核心亮点' },
  { key: 'price', label: '价格福利', category: 'mandatory', description: '集中展示售价、规格数量、赠品权益、优惠力度、单份单价' },
  { key: 'taste', label: '口感体验', category: 'mandatory', description: '从嗅觉、入口、余韵多维度分层描述风味与质地' },
  { key: 'trust', label: '基础信任', category: 'mandatory', description: '拆解配料表、核心含量数据、无添加承诺，建立基础品质信任' },
  { key: 'aftercare', label: '物流售后', category: 'mandatory', description: '清晰说明发货时效、快递方式、售后规则与不发货区域' },
  { key: 'tips', label: '食用储存贴士', category: 'mandatory', description: '说明保质期、储存条件、适用人群、饮用注意事项' },
  { key: 'cta', label: '行动召唤', category: 'mandatory', description: '强化购买理由，降低决策门槛，引导立即下单' },
  // 可选模块（7个）
  { key: 'ingredient', label: '成分科普', category: 'optional', description: '对核心功效成分做深度原理科普，讲清对用户的实际好处' },
  { key: 'origin', label: '原料溯源', category: 'optional', description: '核心原料的产地优势、品质特点、产地故事' },
  { key: 'brand', label: '品牌背书', category: 'optional', description: '介绍品牌实力、牧场/工厂资质、权威认证与奖项' },
  { key: 'scene', label: '场景共情', category: 'optional', description: '结合目标人群日常场景，引发使用共鸣' },
  { key: 'feedback', label: '用户反馈', category: 'optional', description: '模拟真实用户评价口吻，增强真实感与种草感' },
  { key: 'comparison', label: '全网比价', category: 'optional', description: '对标主流平台价格，突出当前渠道的差价优势' },
  { key: 'faq', label: '常见问题', category: 'optional', description: '集中解答用户高频疑问，降低决策顾虑' },
]

// 短版种草模板（7必选）
export const SHORT_TEMPLATE: ModuleKey[] = ['hook','price','taste','trust','aftercare','tips','cta']
// 长版详情模板（14全选）
export const LONG_TEMPLATE: ModuleKey[] = MODULE_CONFIG.map(m => m.key)

export const STYLE_CONFIG: StyleConfig[] = [
  { key: 'xiaohongshu', label: '小红书种草风', description: '对标小红书热门食品种草笔记，用词鲜活有网感，情绪饱满，分享感强', example: '最近挖到的宝藏酸奶！一口下去直接惊艳到了！！' },
  { key: 'minimalist', label: '简约功能风', description: '文字精炼克制，重点清晰，直接传递产品卖点和核心价值', example: '这款酸奶采用 simplified 配方，0添加蔗糖，3.0g优质乳蛋白。' },
  { key: 'fun', label: '趣味风', description: '语气轻松活泼，带轻幽默感，会用网感梗和趣味表达', example: '家人们谁懂啊！喝个酸奶居然喝出了幸福感？？' },
  { key: 'premium', label: '高端大气风', description: '调性偏品质感、高级感，用词考究，突出原料珍稀、工艺专业', example: '甄选北纬40°黄金奶源带牧场奶源，每一滴都经过12道工序精制。' },
  { key: 'girlfriend', label: '日常闺蜜风', description: '语气像和闺蜜聊天分享，平实自然不浮夸，用真实感受打动人', example: '最近不是天热嘛，囤了箱酸奶放冰箱，下午来一瓶太舒服了～' },
]

export const SUB_CATEGORY_CONFIG: SubCategoryConfig[] = [
  { key: 'dairy', label: '乳制品' }, { key: 'snack', label: '休闲零食' }, { key: 'fresh_fruit', label: '生鲜水果' }, { key: 'grain_oil', label: '粮油调味' }, { key: 'other', label: '其他' },
]

export const SHIPPING_OPTIONS: ShippingOption[] = [
  { key: '24h', label: '24 小时内发货' }, { key: '48h', label: '48 小时内发货' }, { key: '72h', label: '72 小时内发货' }, { key: '7d', label: '7 天内发货' }, { key: 'custom', label: '自定义天数' },
]

// 全部风格（含内部风格 senior），用于版本标签和选择器
export const STYLE_LABEL_MAP: Record<string, string> = {
  xiaohongshu: '小红书种草风', minimalist: '简约功能风', fun: '趣味风', premium: '高端大气风', girlfriend: '日常闺蜜风', senior: '资深团长风',
}
export const VERSION_STYLE_OPTIONS: { key: string; label: string }[] = [
  { key: 'xiaohongshu', label: '小红书种草风' }, { key: 'girlfriend', label: '日常闺蜜风' }, { key: 'minimalist', label: '简约功能风' }, { key: 'fun', label: '趣味风' }, { key: 'premium', label: '高端大气风' }, { key: 'senior', label: '资深团长风' },
]

export const getMandatoryModules = (): ModuleConfig[] => MODULE_CONFIG.filter(m => m.category === 'mandatory')
export const getOptionalModules = (): ModuleConfig[] => MODULE_CONFIG.filter(m => m.category === 'optional')
