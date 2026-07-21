import type { ModuleConfig, StyleConfig, SubCategoryConfig, ShippingOption, ModuleKey } from '@/types'
import { ALL_MODULES, getDefaultModules } from '@/config/moduleRegistry'

// MODULE_CONFIG 现在从 moduleRegistry 导出，保持向后兼容
export const MODULE_CONFIG: ModuleConfig[] = ALL_MODULES

// 短版种草模板（7模块）— 保留旧的作为默认回退
export const SHORT_TEMPLATE: ModuleKey[] = ['hook','price','cta']
// 长版详情模板（14全选）
export const LONG_TEMPLATE: ModuleKey[] = MODULE_CONFIG.map(m => m.key)

// 根据类目获取默认模板（新版：类目驱动）
export function getTemplateForCategory(catLevel1: string, catLevel2: string, catLevel3: string): ModuleKey[] {
  return getDefaultModules(catLevel1, catLevel2, catLevel3)
}

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
