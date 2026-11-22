import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import {
  MenuItem,
  DailyMenuPayload,
  DiningHall,
  DINING_HALLS,
  NutrientTotals
} from '../models/nutrition.model';
import { MenuSyncService } from './menu-sync.service';
import { TrayCartService } from './tray-cart.service';

export interface AdvisorIntent {
  rawPrompt: string;
  mealPeriod: 'breakfast' | 'lunch' | 'dinner';
  proteinFocus: boolean;
  carbFocus: 'high' | 'low' | 'neutral';
  calorieFocus: 'low' | 'high' | 'neutral';
  lowSodiumStrict: boolean;
  lowFatStrict: boolean;
  lowSugarStrict: boolean;
  highFiberFocus: boolean;
  targetCalories: number;
  targetProtein_g: number;
  targetCarbs_g: number;
  maxMealSodium_mg: number;
  requiredTags: string[];
  excludedAllergens: string[];
  avoidFriedOrPizza: boolean;
  keywords: string[];
  summaryTags: string[];
}

export interface MealPick {
  item: MenuItem;
  plates: number; // Strictly whole integer >= 1
}

export interface HallMealPlan {
  hall: DiningHall;
  mealPeriod: 'breakfast' | 'lunch' | 'dinner';
  picks: MealPick[];
  totalPlates: number;
  totals: NutrientTotals;
  score: number; // 0 - 100
  grade: 'A' | 'B' | 'C' | 'D';
  isHealthyFit: boolean;
  whyItWorks: string;
  warnings: string[];
}

export interface AdvisorRecommendation {
  intent: AdvisorIntent;
  selectedHall: DiningHall;
  currentHallPlan: HallMealPlan | null;
  currentHallUnavailableReason: string | null;
  bestCampusPlan: HallMealPlan | null;
  recommendSwitchHall: boolean;
  switchReason: string | null;
  allRankedPlans: HallMealPlan[];
}

const CONDIMENT_PATTERN =
  /\b(brown sugar|sugar packet|syrup|ketchup|mustard|mayo|mayonnaise|garnish|relish|hot sauce|soy sauce|tartar|cream cheese|jelly|jam|butter|margarine|sour cream|whipped cream|croutons|bacon bits|salad dressing|vinaigrette|ranch)\b/i;

const DESSERT_OR_DRINK_PATTERN =
  /\b(donut|doughnut|cookie|brownie|cake|cupcake|pie|ice cream|gelato|pudding|candy|fudge|cider|soda|lemonade|juice|punch|sweet roll|cinnamon roll|strudel|danish|muffin|french toast sticks)\b/i;

const FRIED_OR_HEAVY_PATTERN = /\b(deep fried|fried|pizza|fries|nachos|wings|quesadilla|corndog)\b/i;

const FOOD_KEYWORDS = [
  'chicken',
  'salmon',
  'cod',
  'fish',
  'tilapia',
  'tuna',
  'shrimp',
  'turkey',
  'beef',
  'brisket',
  'pork',
  'tofu',
  'tempeh',
  'edamame',
  'egg',
  'eggs',
  'omelet',
  'oatmeal',
  'oats',
  'rice',
  'quinoa',
  'pasta',
  'penne',
  'noodle',
  'potato',
  'sweet potato',
  'broccoli',
  'spinach',
  'kale',
  'beans',
  'chickpea',
  'lentil',
  'curry',
  'bowl',
  'burger',
  'wrap',
  'yogurt'
];

@Injectable({
  providedIn: 'root'
})
export class MealAdvisorService {
  private readonly http = inject(HttpClient);
  private readonly menuSync = inject(MenuSyncService);
  private readonly cartService = inject(TrayCartService);

  private readonly hallMenusCache = new Map<string, DailyMenuPayload>();

  readonly loading = signal<boolean>(false);
  readonly lastRecommendation = signal<AdvisorRecommendation | null>(null);

  clearCache(): void {
    this.hallMenusCache.clear();
  }

  seedHallMenusForTesting(payloads: Record<string, DailyMenuPayload>): void {
    this.hallMenusCache.clear();
    for (const [slug, payload] of Object.entries(payloads)) {
      this.hallMenusCache.set(slug, payload);
    }
  }

  recommendForPrompt(promptText: string): Observable<AdvisorRecommendation> {
    this.loading.set(true);

    const activePeriod = this.menuSync.selectedMealPeriod();
    const defaultMeal: 'breakfast' | 'lunch' | 'dinner' =
      activePeriod === 'salad' ? 'lunch' : activePeriod;

    const remainingNa = this.cartService.remainingSodium();
    const sodiumLimit = this.cartService.sodiumLimit();
    const defaultMealNaBudget =
      this.cartService.cartCount() > 0 && remainingNa > 0
        ? Math.min(950, remainingNa)
        : Math.round(sodiumLimit * 0.42);

    const intent = this.parseIntent(
      promptText,
      defaultMeal,
      this.menuSync.excludedAllergens(),
      defaultMealNaBudget
    );

    return this.loadAllHallMenus().pipe(
      map((menusMap) => this.buildCampusRecommendation(intent, menusMap)),
      tap((rec) => {
        this.lastRecommendation.set(rec);
        this.loading.set(false);
      }),
      catchError(() => {
        this.loading.set(false);
        const emptyRec: AdvisorRecommendation = {
          intent,
          selectedHall: this.menuSync.selectedHall(),
          currentHallPlan: null,
          currentHallUnavailableReason: 'Could not load dining hall menus.',
          bestCampusPlan: null,
          recommendSwitchHall: false,
          switchReason: null,
          allRankedPlans: []
        };
        this.lastRecommendation.set(emptyRec);
        return of(emptyRec);
      })
    );
  }

  parseIntent(
    rawPrompt: string,
    defaultMeal: 'breakfast' | 'lunch' | 'dinner',
    activeExcludedAllergens: string[],
    defaultMealSodiumCap: number
  ): AdvisorIntent {
    const text = rawPrompt.trim();
    const lower = text.toLowerCase();

    // 1. Meal period detection
    let mealPeriod = defaultMeal;
    if (/\b(breakfast|morning)\b/.test(lower)) mealPeriod = 'breakfast';
    else if (/\b(lunch|brunch|midday)\b/.test(lower)) mealPeriod = 'lunch';
    else if (/\b(dinner|supper|tonight|evening)\b/.test(lower)) mealPeriod = 'dinner';

    // 2. Macro & health focus flags
    const proteinFocus =
      /\b(protein|muscle|gym|lift|lifting|workout|post[- ]?workout|athlete|gains|recover|recovery|bulk|bulking|lean)\b/.test(
        lower
      );

    let carbFocus: 'high' | 'low' | 'neutral' = 'neutral';
    if (/\b(low[- ]?carbs?|no[- ]?carbs?|keto|cut[- ]?carbs?|less carbs?)\b/.test(lower)) {
      carbFocus = 'low';
    } else if (
      /\b(carbs?|carbohydrates?|carb[- ]?load|energy|run|running|cardio|endurance|glycogen|bulk|bulking)\b/.test(
        lower
      )
    ) {
      carbFocus = 'high';
    }

    let calorieFocus: 'low' | 'high' | 'neutral' = 'neutral';
    if (/\b(low[- ]?cal|low[- ]?calorie|cut|cutting|deficit|light|weight[- ]?loss|slim|lean)\b/.test(lower)) {
      calorieFocus = 'low';
    } else if (/\b(high[- ]?cal|high[- ]?calorie|bulk|bulking|mass|big meal|hungry|lots of food)\b/.test(lower)) {
      calorieFocus = 'high';
    }

    const lowSodiumStrict = /\b(low[- ]?sodium|low[- ]?na|low[- ]?salt|no[- ]?salt|heart|blood pressure|clean)\b/.test(
      lower
    );
    const lowFatStrict = /\b(low[- ]?fat|low[- ]?sat|lean|heart|cholesterol)\b/.test(lower);
    const lowSugarStrict = /\b(low[- ]?sugar|no[- ]?sugar|no[- ]?sweet|sugar[- ]?free|clean)\b/.test(lower);
    const highFiberFocus = /\b(fiber|veggies?|vegetables?|greens?|gut|plant|wholesome|healthy)\b/.test(lower);
    const avoidFriedOrPizza =
      lowFatStrict || lowSodiumStrict || /\b(no[- ]?fried|not fried|no[- ]?pizza|clean|healthy)\b/.test(lower);

    // 3. Explicit numeric targets if typed by user
    let targetCalories = calorieFocus === 'low' ? 480 : calorieFocus === 'high' ? 880 : 650;
    const calMatch = lower.match(/(\d{3,4})\s*(?:kcal|cals?|calories)\b/);
    if (calMatch) {
      targetCalories = Math.min(1800, Math.max(250, Number(calMatch[1])));
    }

    let targetProtein_g = proteinFocus ? 45 : 28;
    const proMatch = lower.match(/(\d{1,3})\s*(?:g|grams?)?\s*(?:of\s+)?protein\b/);
    if (proMatch) {
      targetProtein_g = Math.min(150, Math.max(10, Number(proMatch[1])));
    }

    let targetCarbs_g = carbFocus === 'high' ? 75 : carbFocus === 'low' ? 25 : 55;
    const carbMatch = lower.match(/(\d{1,3})\s*(?:g|grams?)?\s*(?:of\s+)?carbs?\b/);
    if (carbMatch) {
      targetCarbs_g = Math.min(250, Math.max(5, Number(carbMatch[1])));
    }

    let maxMealSodium_mg = lowSodiumStrict
      ? Math.min(550, Math.max(350, defaultMealSodiumCap))
      : Math.max(450, defaultMealSodiumCap);
    const naMatch = lower.match(/(?:under|below|max|less than|<=?)\s*(\d{2,4})\s*(?:mg)?\s*(?:sodium|na|salt)\b/);
    if (naMatch) {
      maxMealSodium_mg = Math.min(2300, Math.max(200, Number(naMatch[1])));
    }

    // 4. Dietary tags & allergen exclusions
    const requiredTags: string[] = [];
    if (/\b(vegan|plant[- ]?based)\b/.test(lower)) requiredTags.push('Vegan');
    else if (/\b(vegetarian|meatless)\b/.test(lower)) requiredTags.push('Vegetarian');
    if (/\bhalal\b/.test(lower)) requiredTags.push('Halal');
    if (/\b(gluten[- ]?free|no[- ]?gluten|celiac|\bgf\b)\b/.test(lower)) requiredTags.push('Gluten-Free');

    const allergenSet = new Set<string>(activeExcludedAllergens);
    if (/\b(no[- ]?dairy|dairy[- ]?free|no[- ]?milk|lactose)\b/.test(lower)) allergenSet.add('Milk');
    if (/\b(no[- ]?eggs?|egg[- ]?free)\b/.test(lower)) allergenSet.add('Eggs');
    if (/\b(no[- ]?wheat|wheat[- ]?free|gluten[- ]?free|celiac)\b/.test(lower)) allergenSet.add('Wheat');
    if (/\b(no[- ]?soy|soy[- ]?free)\b/.test(lower)) allergenSet.add('Soy');
    if (/\b(no[- ]?peanuts?|peanut[- ]?free|no[- ]?nuts?|nut[- ]?free)\b/.test(lower)) {
      allergenSet.add('Peanuts');
      allergenSet.add('Tree Nuts');
    }
    if (/\b(no[- ]?fish|no[- ]?seafood)\b/.test(lower)) allergenSet.add('Fish');
    if (/\b(no[- ]?shellfish|no[- ]?shrimp|no[- ]?seafood)\b/.test(lower)) allergenSet.add('Shellfish');
    if (/\b(no[- ]?sesame|sesame[- ]?free)\b/.test(lower)) allergenSet.add('Sesame');

    // 5. Specific food cravings
    const keywords = FOOD_KEYWORDS.filter((kw) => lower.includes(kw));

    // Summary tags to show the user what the agent understood
    const summaryTags: string[] = [
      mealPeriod.charAt(0).toUpperCase() + mealPeriod.slice(1)
    ];
    if (proteinFocus || proMatch) summaryTags.push(`Protein ~${targetProtein_g}g+`);
    if (carbFocus === 'high' || carbMatch) summaryTags.push(`Carbs ~${targetCarbs_g}g`);
    if (carbFocus === 'low') summaryTags.push(`Low Carb (≤${targetCarbs_g}g)`);
    if (calorieFocus !== 'neutral' || calMatch) summaryTags.push(`~${targetCalories} kcal`);
    if (lowSodiumStrict || naMatch) summaryTags.push(`Sodium ≤${maxMealSodium_mg}mg`);
    if (highFiberFocus) summaryTags.push('High Fiber');
    if (lowFatStrict) summaryTags.push('Low Sat Fat');
    if (lowSugarStrict) summaryTags.push('Low Sugar');
    for (const t of requiredTags) summaryTags.push(t);
    for (const a of allergenSet) summaryTags.push(`No ${a}`);

    return {
      rawPrompt: text,
      mealPeriod,
      proteinFocus,
      carbFocus,
      calorieFocus,
      lowSodiumStrict,
      lowFatStrict,
      lowSugarStrict,
      highFiberFocus,
      targetCalories,
      targetProtein_g,
      targetCarbs_g,
      maxMealSodium_mg,
      requiredTags,
      excludedAllergens: Array.from(allergenSet),
      avoidFriedOrPizza,
      keywords,
      summaryTags
    };
  }

  private loadAllHallMenus(): Observable<Map<string, DailyMenuPayload>> {
    if (this.hallMenusCache.size === DINING_HALLS.length) {
      return of(this.hallMenusCache);
    }

    const requests: Record<string, Observable<DailyMenuPayload | null>> = {};
    for (const hall of DINING_HALLS) {
      const cached = this.hallMenusCache.get(hall.slug);
      if (cached) {
        requests[hall.slug] = of(cached);
      } else {
        requests[hall.slug] = this.http
          .get<DailyMenuPayload>(`assets/menus/${hall.slug}-today.json`)
          .pipe(catchError(() => of(null)));
      }
    }

    return forkJoin(requests).pipe(
      map((results) => {
        for (const [slug, payload] of Object.entries(results)) {
          if (payload && Array.isArray(payload.items)) {
            this.hallMenusCache.set(slug, payload);
          }
        }
        return this.hallMenusCache;
      })
    );
  }

  /**
   * Evaluates every dining hall in strict isolation (ZERO cross-hall mixing)
   * and compares the user's current hall against the healthiest single-hall option on campus.
   */
  private buildCampusRecommendation(
    intent: AdvisorIntent,
    menusMap: Map<string, DailyMenuPayload>
  ): AdvisorRecommendation {
    const selectedHall = this.menuSync.selectedHall();
    const plans: HallMealPlan[] = [];
    let currentHallUnavailableReason: string | null = null;

    for (const hall of DINING_HALLS) {
      const payload = menusMap.get(hall.slug);
      if (!payload || !payload.items || payload.items.length === 0) {
        if (hall.slug === selectedHall.slug) {
          currentHallUnavailableReason = `${hall.name} has no menu data posted today.`;
        }
        continue;
      }

      const periodItems = payload.items.filter((i) => i.mealPeriod === intent.mealPeriod);
      if (periodItems.length === 0) {
        if (hall.slug === selectedHall.slug) {
          currentHallUnavailableReason = `${hall.name} is not serving ${intent.mealPeriod} today.`;
        }
        continue;
      }

      const plan = this.solveSingleHallOptimalMeal(hall, periodItems, intent);
      if (plan) {
        plans.push(plan);
      } else if (hall.slug === selectedHall.slug) {
        currentHallUnavailableReason = `${hall.name} has no ${intent.mealPeriod} dishes matching your dietary/allergen requirements today.`;
      }
    }

    plans.sort((a, b) => b.score - a.score);

    const currentHallPlan = plans.find((p) => p.hall.slug === selectedHall.slug) ?? null;
    const bestCampusPlan = plans[0] ?? null;

    let recommendSwitchHall = false;
    let switchReason: string | null = null;

    if (bestCampusPlan && bestCampusPlan.hall.slug !== selectedHall.slug) {
      if (!currentHallPlan) {
        recommendSwitchHall = true;
        switchReason = `${
          currentHallUnavailableReason || `${selectedHall.name} has no matching options.`
        } ${bestCampusPlan.hall.name} (${bestCampusPlan.hall.campusArea}) has a Grade ${
          bestCampusPlan.grade
        } single-hall meal ready for ${intent.mealPeriod}.`;
      } else {
        const scoreGap = bestCampusPlan.score - currentHallPlan.score;
        const currentUnhealthy = !currentHallPlan.isHealthyFit || currentHallPlan.score < 70;

        if ((currentUnhealthy && scoreGap >= 8) || scoreGap >= 14) {
          recommendSwitchHall = true;
          const naDiff = Math.round(currentHallPlan.totals.sodium_mg - bestCampusPlan.totals.sodium_mg);
          const proDiff = Math.round(bestCampusPlan.totals.protein_g - currentHallPlan.totals.protein_g);

          const highlights: string[] = [];
          if (naDiff >= 120) highlights.push(`${naDiff} mg less sodium`);
          if (proDiff >= 8) highlights.push(`+${proDiff}g more protein`);
          if (bestCampusPlan.totals.satFat_g + 3 < currentHallPlan.totals.satFat_g) {
            highlights.push('less saturated fat');
          }

          const diffText =
            highlights.length > 0
              ? ` (${highlights.join(', ')})`
              : ` (Health Score ${bestCampusPlan.score}/100 vs ${currentHallPlan.score}/100)`;

          switchReason = `${selectedHall.name}'s ${intent.mealPeriod} menu is less ideal for your goal today${
            currentHallPlan.warnings.length > 0 ? ` (${currentHallPlan.warnings[0].toLowerCase()})` : ''
          }. ${bestCampusPlan.hall.name} offers a much healthier all-in-one meal${diffText}.`;
        }
      }
    }

    return {
      intent,
      selectedHall,
      currentHallPlan,
      currentHallUnavailableReason,
      bestCampusPlan,
      recommendSwitchHall,
      switchReason,
      allRankedPlans: plans
    };
  }

  /**
   * Strictly receives items from ONE single dining hall (`hallItems`) and finds
   * the highest-scoring 1–3 dish combination using whole-plate servings (1x, 2x, 3x).
   */
  private solveSingleHallOptimalMeal(
    hall: DiningHall,
    hallItems: MenuItem[],
    intent: AdvisorIntent
  ): HallMealPlan | null {
    const excludedLower = intent.excludedAllergens.map((a) => a.toLowerCase());

    // Deduplicate by normalized dish name within this single hall & meal period
    const seenNames = new Set<string>();
    const eligible: MenuItem[] = [];

    for (const item of hallItems) {
      const normName = item.name.trim().toLowerCase();
      if (seenNames.has(normName)) continue;

      // Filter out tiny condiments/garnishes
      if (item.calories < 25 || (item.calories < 65 && CONDIMENT_PATTERN.test(item.name))) {
        continue;
      }

      // Skip desserts/sweet drinks unless user specifically requested one by keyword
      const askedForSweet = intent.keywords.some((kw) => normName.includes(kw));
      if (!askedForSweet && DESSERT_OR_DRINK_PATTERN.test(item.name)) {
        continue;
      }

      // Enforce dietary tags
      let tagsOk = true;
      for (const reqTag of intent.requiredTags) {
        const itemTagsLower = (item.tags || []).map((t) => t.toLowerCase());
        if (reqTag === 'Vegetarian') {
          if (!itemTagsLower.includes('vegetarian') && !itemTagsLower.includes('vegan')) {
            tagsOk = false;
            break;
          }
        } else if (reqTag === 'Halal') {
          if (
            !itemTagsLower.includes('halal') &&
            !itemTagsLower.includes('vegan') &&
            !itemTagsLower.includes('vegetarian')
          ) {
            tagsOk = false;
            break;
          }
        } else if (!itemTagsLower.includes(reqTag.toLowerCase())) {
          tagsOk = false;
          break;
        }
      }
      if (!tagsOk) continue;

      // Enforce allergen exclusions
      if (excludedLower.length > 0 && item.allergens && item.allergens.length > 0) {
        if (item.allergens.some((alg) => excludedLower.includes(alg.toLowerCase()))) {
          continue;
        }
      }

      seenNames.add(normName);
      eligible.push(item);
    }

    if (eligible.length === 0) return null;

    // Pre-rank individual items at this hall so combinatorial search focuses on the best candidates
    const rankedCandidates = [...eligible]
      .sort((a, b) => this.scoreSingleDishCandidate(b, intent) - this.scoreSingleDishCandidate(a, intent))
      .slice(0, 14);

    let bestPicks: MealPick[] | null = null;
    let bestTotals: NutrientTotals | null = null;
    let bestScore = -Infinity;

    const evaluateCandidate = (picks: MealPick[]) => {
      const totals = this.sumPicks(picks);
      const s = this.scoreMealCombination(picks, totals, intent);
      if (s > bestScore) {
        bestScore = s;
        bestPicks = picks;
        bestTotals = totals;
      }
    };

    const n = rankedCandidates.length;

    // 1-dish combinations (1x, 2x, 3x whole plates)
    for (let i = 0; i < n; i++) {
      for (let q1 = 1; q1 <= 3; q1++) {
        evaluateCandidate([{ item: rankedCandidates[i], plates: q1 }]);
      }
    }

    // 2-dish combinations (whole plates up to 4 total plates)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        for (const [q1, q2] of [
          [1, 1],
          [2, 1],
          [1, 2],
          [2, 2]
        ]) {
          evaluateCandidate([
            { item: rankedCandidates[i], plates: q1 },
            { item: rankedCandidates[j], plates: q2 }
          ]);
        }
      }
    }

    // 3-dish balanced combinations (up to 4 total plates)
    const cap3 = Math.min(n, 10);
    for (let i = 0; i < cap3; i++) {
      for (let j = i + 1; j < cap3; j++) {
        for (let k = j + 1; k < cap3; k++) {
          evaluateCandidate([
            { item: rankedCandidates[i], plates: 1 },
            { item: rankedCandidates[j], plates: 1 },
            { item: rankedCandidates[k], plates: 1 }
          ]);
          evaluateCandidate([
            { item: rankedCandidates[i], plates: 2 },
            { item: rankedCandidates[j], plates: 1 },
            { item: rankedCandidates[k], plates: 1 }
          ]);
        }
      }
    }

    if (!bestPicks || !bestTotals) return null;

    const finalPicks: MealPick[] = bestPicks;
    const finalTotals: NutrientTotals = bestTotals;
    const clampedScore = Math.max(15, Math.min(99, Math.round(bestScore)));
    const grade: 'A' | 'B' | 'C' | 'D' =
      clampedScore >= 82 ? 'A' : clampedScore >= 68 ? 'B' : clampedScore >= 52 ? 'C' : 'D';

    const warnings: string[] = [];
    if (finalTotals.sodium_mg > intent.maxMealSodium_mg) {
      warnings.push(`High sodium (${Math.round(finalTotals.sodium_mg)} mg vs ${intent.maxMealSodium_mg} mg goal)`);
    }
    if (intent.proteinFocus && finalTotals.protein_g < intent.targetProtein_g * 0.7) {
      warnings.push(`Limited protein options today (${Math.round(finalTotals.protein_g)}g)`);
    }
    if (finalTotals.satFat_g >= 12) {
      warnings.push(`Elevated saturated fat (${Math.round(finalTotals.satFat_g)}g)`);
    }
    if (finalTotals.sugar_g >= 24) {
      warnings.push(`Higher sugar (${Math.round(finalTotals.sugar_g)}g)`);
    }

    const isHealthyFit = warnings.length === 0 && clampedScore >= 70;
    const totalPlates = finalPicks.reduce((acc, p) => acc + p.plates, 0);

    const whyItWorks = this.buildExplanation(hall, finalTotals, intent, warnings);

    return {
      hall,
      mealPeriod: intent.mealPeriod,
      picks: finalPicks,
      totalPlates,
      totals: finalTotals,
      score: clampedScore,
      grade,
      isHealthyFit,
      whyItWorks,
      warnings
    };
  }

  private scoreSingleDishCandidate(item: MenuItem, intent: AdvisorIntent): number {
    let s = 0;
    s += item.protein_g * (intent.proteinFocus ? 2.4 : 1.2);
    if (intent.carbFocus === 'high') s += item.carbs_g * 1.1;
    if (intent.carbFocus === 'low') s -= item.carbs_g * 1.0;
    s += item.fiber_g * (intent.highFiberFocus ? 3.5 : 1.8);
    s -= (item.sodium_mg / 100) * (intent.lowSodiumStrict ? 4.5 : 2.2);
    s -= item.satFat_g * (intent.lowFatStrict ? 3.0 : 1.5);
    s -= item.sugar_g * (intent.lowSugarStrict ? 2.2 : 0.9);
    if (intent.avoidFriedOrPizza && FRIED_OR_HEAVY_PATTERN.test(item.name)) {
      s -= 18;
    }
    const lowerName = item.name.toLowerCase();
    for (const kw of intent.keywords) {
      if (lowerName.includes(kw)) s += 20;
    }
    return s;
  }

  private scoreMealCombination(
    picks: MealPick[],
    t: NutrientTotals,
    intent: AdvisorIntent
  ): number {
    let score = 62;

    // 1. Calorie fit around target
    const calDiff = Math.abs(t.calories - intent.targetCalories);
    const calTolerance = Math.max(180, intent.targetCalories * 0.28);
    if (t.calories < 220) {
      score -= 30; // Too tiny to be a real meal
    } else if (calDiff <= calTolerance) {
      score += 14 * (1 - calDiff / calTolerance);
    } else {
      score -= Math.min(28, ((calDiff - calTolerance) / 100) * 6);
    }

    // 2. Protein fit
    const proRatio = Math.min(1.35, t.protein_g / Math.max(1, intent.targetProtein_g));
    if (intent.proteinFocus) {
      score += proRatio >= 1 ? 22 : proRatio * 20 - (1 - proRatio) * 14;
    } else {
      score += Math.min(12, proRatio * 10);
    }

    // 3. Carbohydrate fit
    if (intent.carbFocus === 'high') {
      const carbRatio = Math.min(1.3, t.carbs_g / Math.max(1, intent.targetCarbs_g));
      score += carbRatio >= 0.85 ? 16 : carbRatio * 14 - 8;
    } else if (intent.carbFocus === 'low') {
      if (t.carbs_g <= intent.targetCarbs_g) {
        score += 15;
      } else {
        score -= Math.min(28, (t.carbs_g - intent.targetCarbs_g) * 0.55);
      }
    }

    // 4. Fiber & balanced plate variety bonus
    score += Math.min(10, t.fiber_g * (intent.highFiberFocus ? 1.5 : 0.8));
    if (picks.length >= 2) {
      score += 5; // Balanced multi-dish meal bonus vs eating 3x of a single item
    }

    // 5. Sodium ceiling health discipline (core SodiumController guard)
    if (t.sodium_mg <= intent.maxMealSodium_mg * 0.75) {
      score += 10;
    } else if (t.sodium_mg > intent.maxMealSodium_mg) {
      const excessNa = t.sodium_mg - intent.maxMealSodium_mg;
      score -= Math.min(45, 10 + (excessNa / 100) * (intent.lowSodiumStrict ? 7.5 : 5.0));
    }

    // 6. Saturated fat, trans fat, and sugar penalties
    if (t.satFat_g > 9) {
      score -= Math.min(20, (t.satFat_g - 9) * (intent.lowFatStrict ? 2.8 : 1.6));
    }
    if (t.transFat_g >= 0.5) {
      score -= 10;
    }
    if (t.sugar_g > 18) {
      score -= Math.min(18, (t.sugar_g - 18) * (intent.lowSugarStrict ? 1.8 : 0.8));
    }

    // 7. Specific keyword match bonus & fried penalty
    for (const p of picks) {
      const ln = p.item.name.toLowerCase();
      for (const kw of intent.keywords) {
        if (ln.includes(kw)) score += 9;
      }
      if (intent.avoidFriedOrPizza && FRIED_OR_HEAVY_PATTERN.test(p.item.name)) {
        score -= 12 * p.plates;
      }
    }

    return score;
  }

  private sumPicks(picks: MealPick[]): NutrientTotals {
    const totals: NutrientTotals = {
      calories: 0,
      sodium_mg: 0,
      satFat_g: 0,
      sugar_g: 0,
      fat_g: 0,
      carbs_g: 0,
      fiber_g: 0,
      protein_g: 0,
      cholesterol_mg: 0,
      transFat_g: 0
    };
    for (const { item, plates } of picks) {
      totals.calories += item.calories * plates;
      totals.sodium_mg += item.sodium_mg * plates;
      totals.satFat_g += item.satFat_g * plates;
      totals.sugar_g += item.sugar_g * plates;
      totals.fat_g += item.fat_g * plates;
      totals.carbs_g += item.carbs_g * plates;
      totals.fiber_g += item.fiber_g * plates;
      totals.protein_g += item.protein_g * plates;
      totals.cholesterol_mg += item.cholesterol_mg * plates;
      totals.transFat_g += item.transFat_g * plates;
    }
    return totals;
  }

  private buildExplanation(
    hall: DiningHall,
    t: NutrientTotals,
    intent: AdvisorIntent,
    warnings: string[]
  ): string {
    const parts: string[] = [
      `Delivers ${Math.round(t.protein_g)}g protein, ${Math.round(t.carbs_g)}g carbs, and ${Math.round(
        t.calories
      )} kcal with ${Math.round(t.sodium_mg)} mg sodium — 100% inside ${hall.name}.`
    ];
    if (warnings.length > 0) {
      parts.push(`Note: ${warnings.join('; ')}.`);
    }
    return parts.join(' ');
  }
}
