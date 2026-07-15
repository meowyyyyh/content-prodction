export type ProductCategory = 'dairy' | 'snack' | 'fresh_fruit' | 'grain_oil' | 'other'
export type SubCategory = 'dairy' | 'snack' | 'fresh_fruit' | 'grain_oil' | 'other'
export type ContentStyle = 'xiaohongshu' | 'minimalist' | 'fun' | 'premium' | 'girlfriend' | 'senior'
export type ModuleKey = 'hook' | 'price' | 'taste' | 'trust' | 'aftercare' | 'tips' | 'cta' | 'ingredient' | 'origin' | 'brand' | 'scene' | 'feedback' | 'comparison' | 'faq'
export type ShippingTimeliness = '24h' | '48h' | '72h' | '7d' | 'custom'
export type ShelfLifeUnit = 'day' | 'month' | 'year'
export type GenerateCount = 1 | 2 | 3

export interface ModuleConfig { key: ModuleKey; label: string; category: 'mandatory' | 'optional'; description: string }
export interface StyleConfig { key: ContentStyle; label: string; description: string; example: string }
export interface SubCategoryConfig { key: SubCategory; label: string }
export interface ShippingOption { key: ShippingTimeliness; label: string }

export interface ProductInput {
  productName: string; subCategory: SubCategory | ''; netWeight: string; origin: string
  productionDate: string; shelfLifeValue: string; shelfLifeUnit: ShelfLifeUnit
  suggestedPrice: string; sellingPoints: string; coreIngredients: string
  shippingOrigin: string; shippingTimeliness: ShippingTimeliness; customShippingDays: string
  courier: string; extraShippingFeeEnabled: boolean; extraShippingFeeAreas: string
  noShippingAreasEnabled: boolean; noShippingAreas: string; afterSalesRules: string
  brandBackground: string; targetAudience: string; usageScene: string; additionalNotes: string
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

export interface ClassifiedImage { id: string; type: string; desc: string; preview?: string; suggestedModule?: string }
// 图片类型 → 建议模块映射
export const IMAGE_MODULE_MAP: Record<string, ModuleKey[]> = {
  '产品图': ['taste', 'hook'],
  '封面图': ['hook'],
  '配料表': ['trust', 'ingredient'],
  '场景图': ['scene'],
  '品牌图': ['brand'],
  '包装图': ['hook'],
  '其他': [],
}
