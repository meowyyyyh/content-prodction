export type ProductCategory = 'dairy' | 'snack' | 'fresh_fruit' | 'grain_oil' | 'other'
/** @deprecated 使用 catCode 替代 */
export type SubCategory = 'dairy' | 'snack' | 'fresh_fruit' | 'grain_oil' | 'other'
export type ContentStyle = 'xiaohongshu' | 'minimalist' | 'fun' | 'premium' | 'girlfriend' | 'senior'
// 通用模块 + 美食酒水专属 + 美妆洗护专属（Batch 1）+ 后续批次追加
export type ModuleKey = 'hook' | 'price' | 'taste' | 'trust' | 'aftercare' | 'tips' | 'cta'
  | 'ingredient' | 'origin' | 'brand' | 'scene' | 'feedback' | 'faq'
  // 美妆洗护专属（Batch 1）
  | 'texture' | 'efficacy' | 'usage_method' | 'before_after' | 'ingredient_analysis' | 'suitable_skin'
  // 医药健康专属（Batch 2）
  | 'product_info' | 'usage_dosage' | 'precautions' | 'qualification'
  // 鞋包服饰专属（Batch 3）
  | 'fabric' | 'styling' | 'sizing' | 'craftsmanship' | 'care_washing'
  // 母婴亲子专属（Batch 4）
  | 'safety' | 'age_guide' | 'parenting_knowledge' | 'feeding_guide' | 'growth_support'
  // 居家生活专属（Batch 5）
  | 'material' | 'usage_experience' | 'home_styling' | 'cleaning_care'
  // 数码家电专属（Batch 6）
  | 'specs' | 'unboxing' | 'tutorial' | 'product_compare' | 'compatibility'
  // 餐厨用品专属（Batch 7）
  | 'material_craft' | 'usage_demo' | 'durability' | 'kitchen_styling'
  // 文体健康专属（Batch 8）
  | 'performance' | 'training_guide' | 'health_benefit' | 'safety_gear'
  // 汽车旅行专属（Batch 9）
  | 'specs_perf' | 'install_guide' | 'compatibility_check' | 'road_test'
  // 钟表眼镜专属（Batch 10）
  | 'design_detail' | 'wear_experience' | 'authenticity' | 'optics_params'
  // 家具专属（Batch 11）
  | 'material_structure' | 'space_design' | 'assembly_guide' | 'durability_info'
  // 家装建材专属（Batch 11）
  | 'tech_specs' | 'install_process' | 'quality_standard'
  // 办公学习专属（Batch 12）
  | 'productivity' | 'setup_guide' | 'ergonomics' | 'learning_support'
  // 虚拟卡券专属（Batch 14）
  | 'rights_list' | 'plan_compare' | 'activate_guide' | 'platform_support'
  | 'validity_rules' | 'support_policy' | 'usage_scenarios' | 'value_analysis'
export type ShippingTimeliness = '24h' | '48h' | '72h' | '7d' | 'custom'
export type ShelfLifeUnit = 'day' | 'month' | 'year'
export type GenerateCount = 1 | 2 | 3

export interface ModuleConfig {
  key: ModuleKey; label: string
  scope: 'common' | 'optional' | 'food' | 'beauty' | 'medical'  // 模块所属范围
  /** @deprecated 改用 scope + 类目映射表判断 */
  category?: 'mandatory' | 'optional'
  description: string
}
export interface StyleConfig { key: ContentStyle; label: string; description: string; example: string }
export interface SubCategoryConfig { key: SubCategory; label: string }
export interface ShippingOption { key: ShippingTimeliness; label: string }

export interface ProductInput {
  productName: string
  /** @deprecated Phase 1 改用 catCode 作为类目主键 */
  subCategory: SubCategory | ''
  catCode: string          // 类目编码，格式 "level1::level2::level3"，如 "美食酒水::酒水饮料::乳制品"
  catLevel1: string; catLevel2: string; catLevel3: string; netWeight: string; origin: string
  productionDate: string; shelfLifeValue: string; shelfLifeUnit: ShelfLifeUnit
  suggestedPrice: string; groupBuyPrice: string; groupBuyQuantity: string; groupBuyUnit: string; headline: string; sellingPoints: string; coreIngredients: string
  shippingOrigin: string; shippingTimeliness: ShippingTimeliness; customShippingDays: string
  courier: string; extraShippingFeeEnabled: boolean; extraShippingFeeAreas: string
  noShippingAreasEnabled: boolean; noShippingAreas: string; afterSalesRules: string
  brandBackground: string; targetAudience: string; usageScene: string; additionalNotes: string; rawProductText: string
  style: ContentStyle; selectedModules: ModuleKey[]; moduleOrder: ModuleKey[]
  generateCount: GenerateCount; versionStyles: ContentStyle[]; textLength: 'short' | 'long'; enableRAG: boolean; enableCompliance: boolean
}

export interface ModuleResult {
  moduleKey: ModuleKey; moduleLabel: string; content: string; status: 'loading' | 'completed' | 'error'
  errorMessage?: string; adopted: boolean; complianceHits?: ComplianceHit[]
}
export interface ComplianceHit { ruleId: string; violationType: string; riskLevel: 'critical' | 'high' | 'medium'; flaggedText: string; suggestion: string }
export interface GenerateResult { productName: string; style: ContentStyle; modules: ModuleResult[]; fullText: string }
export interface GenerateResponse { success: boolean; data?: GenerateResult; error?: string; preBannedHit?: ComplianceHit }
export type GenerateStatus = 'idle' | 'checking' | 'generating' | 'completed' | 'error' | 'blocked'

/** @deprecated type 字段已废弃（v2.2），图片路由改用 suggestedModule + layout_role 双层兜底 */
export interface ClassifiedImage { id: string; type?: string; desc: string; preview?: string; suggestedModule?: string; layout_role?: string; imageContentSummary?: string; imageOcrText?: string }
