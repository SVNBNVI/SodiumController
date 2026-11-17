export type MealPeriod = 'breakfast' | 'lunch' | 'dinner' | 'salad';

export interface MenuItem {
  id: string;
  name: string;
  mealPeriod: 'breakfast' | 'lunch' | 'dinner';
  station: string;
  servingSize: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  satFat_g: number;
  transFat_g: number;
  cholesterol_mg: number;
  sodium_mg: number;
  sugar_g: number;
  fiber_g: number;
  tags: string[];
}

export interface TrayItem extends MenuItem {
  qty: number;
}

export interface DailyMenuPayload {
  project: string;
  date: string;
  lastUpdated: string;
  hall: string;
  sourceUrl: string;
  itemCount: number;
  items: MenuItem[];
}

export interface NutrientTotals {
  calories: number;
  sodium_mg: number;
  satFat_g: number;
  sugar_g: number;
  fat_g: number;
  carbs_g: number;
  fiber_g: number;
  protein_g: number;
  cholesterol_mg: number;
  transFat_g: number;
}

export interface FDABenchmark {
  key: keyof NutrientTotals;
  label: string;
  limit: number;
  unit: string;
  isCeiling: boolean;
}

export interface PercentDailyValue {
  key: keyof NutrientTotals;
  label: string;
  value: number;
  limit: number;
  unit: string;
  percent: number;
  visualHeightPct: number;
  isCeiling: boolean;
  status: 'ok' | 'warning' | 'exceeded' | 'achieved';
}

export interface TopOffender {
  metricKey: string;
  metricLabel: string;
  itemId: string;
  itemName: string;
  amountContributed: number;
  percentOfTotal: number;
  percentOfDailyLimit: number;
}

export interface TraySummary {
  totalItemsCount: number;
  totalServingsCount: number;
  totals: NutrientTotals;
  percentDV: PercentDailyValue[];
  sodiumAlertState: 'ok' | 'warning' | 'exceeded';
  sodiumPercentDV: number;
  topOffenders: TopOffender[];
}

export interface SaladPreset {
  name: string;
  servingSize: string;
  calories: number;
  sodium_mg: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  satFat_g: number;
  sugar_g: number;
  fiber_g: number;
  tags?: string[];
}

// ── Section 4: Auto-expire localStorage tray envelope ──
export interface StoredTrayEnvelope {
  date: string; // YYYY-MM-DD in America/Detroit
  items: TrayItem[];
}

export interface DailyHistoryEntry {
  date: string;
  totalCalories: number;
  totalSodium_mg: number;
  itemsCount: number;
}

// ── Section 5: Dietary benchmark presets ──
export type BenchmarkProfileId = 'fda-standard' | 'active-wolverine' | 'low-sodium-heart';

export interface BenchmarkProfile {
  id: BenchmarkProfileId;
  label: string;
  description: string;
  calorieBase: number;
  benchmarks: FDABenchmark[];
}

export const BENCHMARK_PROFILES: BenchmarkProfile[] = [
  {
    id: 'fda-standard',
    label: 'FDA Standard (2,000 kcal)',
    description: 'Default FDA daily value benchmarks for a 2,000 kcal diet.',
    calorieBase: 2000,
    benchmarks: [
      { key: 'sodium_mg', label: 'Sodium', limit: 2300, unit: 'mg', isCeiling: true },
      { key: 'calories', label: 'Calories', limit: 2000, unit: 'kcal', isCeiling: false },
      { key: 'satFat_g', label: 'Sat Fat', limit: 20, unit: 'g', isCeiling: true },
      { key: 'sugar_g', label: 'Sugars', limit: 50, unit: 'g', isCeiling: true },
      { key: 'fat_g', label: 'Total Fat', limit: 78, unit: 'g', isCeiling: true },
      { key: 'carbs_g', label: 'Carbs', limit: 275, unit: 'g', isCeiling: false },
      { key: 'fiber_g', label: 'Fiber', limit: 28, unit: 'g', isCeiling: false },
      { key: 'protein_g', label: 'Protein', limit: 50, unit: 'g', isCeiling: false },
      { key: 'cholesterol_mg', label: 'Cholesterol', limit: 300, unit: 'mg', isCeiling: true }
    ]
  },
  {
    id: 'active-wolverine',
    label: 'Active Wolverine (2,500 kcal)',
    description: 'For student-athletes or high-protein diets. Sodium ceiling kept strict.',
    calorieBase: 2500,
    benchmarks: [
      { key: 'sodium_mg', label: 'Sodium', limit: 2300, unit: 'mg', isCeiling: true },
      { key: 'calories', label: 'Calories', limit: 2500, unit: 'kcal', isCeiling: false },
      { key: 'satFat_g', label: 'Sat Fat', limit: 24, unit: 'g', isCeiling: true },
      { key: 'sugar_g', label: 'Sugars', limit: 55, unit: 'g', isCeiling: true },
      { key: 'fat_g', label: 'Total Fat', limit: 97, unit: 'g', isCeiling: true },
      { key: 'carbs_g', label: 'Carbs', limit: 325, unit: 'g', isCeiling: false },
      { key: 'fiber_g', label: 'Fiber', limit: 34, unit: 'g', isCeiling: false },
      { key: 'protein_g', label: 'Protein', limit: 140, unit: 'g', isCeiling: false },
      { key: 'cholesterol_mg', label: 'Cholesterol', limit: 300, unit: 'mg', isCeiling: true }
    ]
  },
  {
    id: 'low-sodium-heart',
    label: 'Low-Sodium Heart Healthy (1,800 kcal)',
    description: 'Strict sodium and saturated fat ceilings for cardiovascular health.',
    calorieBase: 1800,
    benchmarks: [
      { key: 'sodium_mg', label: 'Sodium', limit: 1500, unit: 'mg', isCeiling: true },
      { key: 'calories', label: 'Calories', limit: 1800, unit: 'kcal', isCeiling: false },
      { key: 'satFat_g', label: 'Sat Fat', limit: 15, unit: 'g', isCeiling: true },
      { key: 'sugar_g', label: 'Sugars', limit: 36, unit: 'g', isCeiling: true },
      { key: 'fat_g', label: 'Total Fat', limit: 60, unit: 'g', isCeiling: true },
      { key: 'carbs_g', label: 'Carbs', limit: 245, unit: 'g', isCeiling: false },
      { key: 'fiber_g', label: 'Fiber', limit: 28, unit: 'g', isCeiling: false },
      { key: 'protein_g', label: 'Protein', limit: 65, unit: 'g', isCeiling: false },
      { key: 'cholesterol_mg', label: 'Cholesterol', limit: 200, unit: 'mg', isCeiling: true }
    ]
  }
];

// Default benchmarks (kept for backward compatibility)
export const FDA_BENCHMARKS: FDABenchmark[] = BENCHMARK_PROFILES[0].benchmarks;

// ── Section 6: Multi-hall support ──
export interface DiningHall {
  slug: string;
  name: string;
}

export const DINING_HALLS: DiningHall[] = [
  { slug: 'bursley', name: 'Bursley Dining Hall' },
  { slug: 'south-quad', name: 'South Quad Dining Hall' },
  { slug: 'east-quad', name: 'East Quad Dining Hall' },
  { slug: 'mosher-jordan', name: 'Mosher-Jordan Dining Hall' },
  { slug: 'north-quad', name: 'North Quad Dining Hall' },
  { slug: 'markley', name: 'Markley Dining Hall' }
];

export const SALAD_PRESETS: SaladPreset[] = [
  { name: 'Mixed Leafy Greens (1 Tongs / 40g)', servingSize: '1 Tongs', calories: 10, sodium_mg: 12, protein_g: 1, carbs_g: 2, fat_g: 0, satFat_g: 0, sugar_g: 1, fiber_g: 1, tags: ['Vegan', 'Gluten-Free'] },
  { name: 'Cucumber & Bell Peppers (1 Scoop / 60g)', servingSize: '1 Scoop', calories: 14, sodium_mg: 3, protein_g: 0.6, carbs_g: 3, fat_g: 0, satFat_g: 0, sugar_g: 1.5, fiber_g: 1, tags: ['Vegan', 'Gluten-Free'] },
  { name: 'Diced Grilled Chicken (1 Scoop / 85g)', servingSize: '1 Scoop (3 oz)', calories: 140, sodium_mg: 310, protein_g: 26, carbs_g: 0, fat_g: 3, satFat_g: 1, sugar_g: 0, fiber_g: 0, tags: ['Halal', 'Gluten-Free'] },
  { name: 'Hard Boiled Egg (1 Whole)', servingSize: '1 Egg', calories: 78, sodium_mg: 62, protein_g: 6, carbs_g: 0.6, fat_g: 5, satFat_g: 1.6, sugar_g: 0.5, fiber_g: 0, tags: ['Vegetarian', 'Gluten-Free'] },
  { name: 'Chickpeas / Garbanzo Beans (1 Scoop / 60g)', servingSize: '1 Scoop', calories: 105, sodium_mg: 140, protein_g: 5.5, carbs_g: 17, fat_g: 1.6, satFat_g: 0.2, sugar_g: 3, fiber_g: 4.5, tags: ['Vegan', 'Gluten-Free'] },
  { name: 'Balsamic Vinaigrette (1 Ladle / 2 Tbsp)', servingSize: '2 Tbsp', calories: 90, sodium_mg: 280, protein_g: 0, carbs_g: 4, fat_g: 8, satFat_g: 1, sugar_g: 3, fiber_g: 0, tags: ['Vegan', 'Gluten-Free'] }
];

export const FALLBACK_BURSLEY_ITEMS: MenuItem[] = [
  { id: 'b-1', name: 'Oatmeal', mealPeriod: 'breakfast', station: 'Hot Cereal', servingSize: 'Cups (253g)', calories: 183, fat_g: 3, satFat_g: 1, transFat_g: 0, cholesterol_mg: 0, sodium_mg: 3, carbs_g: 33, fiber_g: 5, sugar_g: 1, protein_g: 6, tags: ['Vegan', 'Gluten-Free'] },
  { id: 'b-2', name: 'Deep Fried Hashbrowns', mealPeriod: 'breakfast', station: 'Toast', servingSize: '2 Tritaters (113g)', calories: 207, fat_g: 15, satFat_g: 2, transFat_g: 0, cholesterol_mg: 0, sodium_mg: 506, carbs_g: 22, fiber_g: 2, sugar_g: 0, protein_g: 2, tags: ['Vegan'] },
  { id: 'b-3', name: 'Pork Sausage Patty', mealPeriod: 'breakfast', station: 'Toast', servingSize: 'Patty (43g)', calories: 179, fat_g: 16, satFat_g: 6, transFat_g: 0, cholesterol_mg: 40, sodium_mg: 284, carbs_g: 0, fiber_g: 0, sugar_g: 0, protein_g: 6, tags: ['Gluten-Free'] },
  { id: 'b-4', name: 'Scrambled Eggs', mealPeriod: 'breakfast', station: 'Toast', servingSize: '1/2 cup (84g)', calories: 163, fat_g: 12, satFat_g: 4, transFat_g: 0, cholesterol_mg: 350, sodium_mg: 116, carbs_g: 0, fiber_g: 0, sugar_g: 0, protein_g: 11, tags: ['Gluten-Free', 'Vegetarian'] },
  { id: 'b-5', name: 'French Toast Strata w/ Strawberry', mealPeriod: 'breakfast', station: 'Toast', servingSize: 'Piece (263g)', calories: 543, fat_g: 22, satFat_g: 11, transFat_g: 0, cholesterol_mg: 120, sodium_mg: 446, carbs_g: 76, fiber_g: 3, sugar_g: 46, protein_g: 14, tags: ['Vegetarian'] },
  { id: 'b-6', name: 'Garden Scrambled Tofu', mealPeriod: 'breakfast', station: 'Toast', servingSize: '1/2 Cup (113g)', calories: 74, fat_g: 3, satFat_g: 1, transFat_g: 0, cholesterol_mg: 0, sodium_mg: 470, carbs_g: 6, fiber_g: 2, sugar_g: 3, protein_g: 7, tags: ['Vegan', 'Gluten-Free'] },
  { id: 'l-1', name: 'Grilled Herb Chicken Breast', mealPeriod: 'lunch', station: 'Signature', servingSize: '1 Fillet (140g)', calories: 230, fat_g: 6, satFat_g: 1.5, transFat_g: 0, cholesterol_mg: 95, sodium_mg: 520, carbs_g: 1, fiber_g: 0, sugar_g: 0, protein_g: 41, tags: ['Halal', 'Gluten-Free'] },
  { id: 'l-2', name: 'Penne Marinara with Parmesan', mealPeriod: 'lunch', station: 'Pasta', servingSize: '1 Cup (190g)', calories: 340, fat_g: 7, satFat_g: 2.5, transFat_g: 0, cholesterol_mg: 15, sodium_mg: 610, carbs_g: 56, fiber_g: 4, sugar_g: 7, protein_g: 12, tags: ['Vegetarian'] },
  { id: 'd-1', name: 'Roasted Garlic Chicken Thighs', mealPeriod: 'dinner', station: 'Homestyle', servingSize: '2 Pieces (165g)', calories: 310, fat_g: 18, satFat_g: 5, transFat_g: 0, cholesterol_mg: 135, sodium_mg: 680, carbs_g: 3, fiber_g: 0, sugar_g: 1, protein_g: 34, tags: ['Halal', 'Gluten-Free'] },
  { id: 'd-2', name: 'Steamed Broccoli Florets', mealPeriod: 'dinner', station: 'Homestyle', servingSize: '1/2 Cup (78g)', calories: 27, fat_g: 0.3, satFat_g: 0, transFat_g: 0, cholesterol_mg: 0, sodium_mg: 32, carbs_g: 5.6, fiber_g: 2.4, sugar_g: 1.1, protein_g: 1.9, tags: ['Vegan', 'Gluten-Free'] }
];
