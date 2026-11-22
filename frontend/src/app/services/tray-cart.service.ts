import { Injectable, signal, computed, effect } from '@angular/core';
import {
  MenuItem,
  TrayItem,
  NutrientTotals,
  PercentDailyValue,
  TopOffender,
  TraySummary,
  FDABenchmark,
  BenchmarkProfileId,
  BenchmarkProfile,
  BENCHMARK_PROFILES,
  CustomNutrientTargets,
  DEFAULT_CUSTOM_TARGETS,
  StoredTrayEnvelope,
  DailyHistoryEntry
} from '../models/nutrition.model';

const STORAGE_KEY = 'sodiumControllerCart';
const HISTORY_KEY = 'sodiumControllerHistory';
const PROFILE_KEY = 'sodiumControllerProfile';
const CUSTOM_TARGETS_KEY = 'sodiumControllerCustomTargets';
const MAX_HISTORY_DAYS = 14;

export interface NutritionWasmModule {
  calculateTraySummary: (cartJson: string, benchmarksJson: string) => string;
}

function getDetroitDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Detroit',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function safeNonNegative(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

@Injectable({
  providedIn: 'root'
})
export class TrayCartService {
  // ── Active benchmark profile & custom user targets ──
  readonly activeProfileId = signal<BenchmarkProfileId>(this.loadProfileFromStorage());
  readonly customTargets = signal<CustomNutrientTargets>(this.loadCustomTargetsFromStorage());

  readonly activeProfile = computed<BenchmarkProfile>(() => {
    const id = this.activeProfileId();
    if (id === 'custom') {
      const t = this.customTargets();
      return {
        id: 'custom',
        label: `Custom Targets (${t.calories.toLocaleString()} kcal)`,
        shortLabel: 'Custom',
        description: `Your custom daily goals: ${t.calories.toLocaleString()} kcal, ${t.sodium_mg.toLocaleString()} mg sodium max, ${t.protein_g}g protein, ${t.carbs_g}g carbs.`,
        calorieBase: t.calories,
        benchmarks: [
          { key: 'sodium_mg', label: 'Sodium', limit: t.sodium_mg, unit: 'mg', isCeiling: true },
          { key: 'calories', label: 'Calories', limit: t.calories, unit: 'kcal', isCeiling: false },
          { key: 'satFat_g', label: 'Sat Fat', limit: t.satFat_g, unit: 'g', isCeiling: true },
          { key: 'sugar_g', label: 'Sugars', limit: t.sugar_g, unit: 'g', isCeiling: true },
          { key: 'fat_g', label: 'Total Fat', limit: t.fat_g, unit: 'g', isCeiling: true },
          { key: 'carbs_g', label: 'Carbs', limit: t.carbs_g, unit: 'g', isCeiling: false },
          { key: 'fiber_g', label: 'Fiber', limit: t.fiber_g, unit: 'g', isCeiling: false },
          { key: 'protein_g', label: 'Protein', limit: t.protein_g, unit: 'g', isCeiling: false },
          { key: 'cholesterol_mg', label: 'Cholesterol', limit: t.cholesterol_mg, unit: 'mg', isCeiling: true }
        ]
      };
    }
    return BENCHMARK_PROFILES.find((p) => p.id === id) ?? BENCHMARK_PROFILES[0];
  });

  readonly activeBenchmarks = computed<FDABenchmark[]>(() => {
    return this.activeProfile().benchmarks;
  });

  readonly sodiumLimit = computed<number>(() => {
    return this.activeBenchmarks().find((b) => b.key === 'sodium_mg')?.limit ?? 2300;
  });

  // ── Date-stamped tray with auto-expire ──
  readonly todayDate = signal<string>(getDetroitDate());
  readonly cart = signal<TrayItem[]>(this.loadCartWithExpiry());
  readonly history = signal<DailyHistoryEntry[]>(this.loadHistory());
  readonly isHistoryOpen = signal<boolean>(false);
  readonly isMobileSheetOpen = signal<boolean>(false);

  // ── WebAssembly engine state (genuinely wired into traySummary computation) ──
  private readonly wasmModule = signal<NutritionWasmModule | null>(null);
  readonly wasmLoaded = computed<boolean>(() => this.wasmModule() !== null);
  readonly engineMode = computed<string>(() => {
    return this.wasmLoaded() ? 'C++20 WebAssembly (WASM)' : 'TypeScript Engine';
  });

  readonly cartCount = computed(() => {
    return this.cart().filter((i) => i.qty > 0).length;
  });

  readonly cartQtyMap = computed<Map<string, number>>(() => {
    const map = new Map<string, number>();
    for (const item of this.cart()) {
      if (item.qty > 0) {
        map.set(item.id, item.qty);
      }
    }
    return map;
  });

  // ── Unified TraySummary (runs C++20 WASM when loaded, TypeScript fallback otherwise) ──
  readonly traySummary = computed<TraySummary>(() => {
    const items = this.cart();
    const benchmarks = this.activeBenchmarks();
    const mod = this.wasmModule();

    if (mod) {
      try {
        const rawJson = mod.calculateTraySummary(JSON.stringify(items), JSON.stringify(benchmarks));
        const parsed = JSON.parse(rawJson) as Partial<TraySummary> & { error?: boolean };
        if (parsed && !parsed.error && parsed.totals && Array.isArray(parsed.percentDV)) {
          return {
            totalItemsCount: parsed.totalItemsCount ?? items.length,
            totalServingsCount: parsed.totalServingsCount ?? 0,
            totals: parsed.totals,
            percentDV: parsed.percentDV.map((p) => ({
              ...p,
              percent: Math.round(p.percent),
              visualHeightPct:
                typeof p.visualHeightPct === 'number'
                  ? Math.round(p.visualHeightPct)
                  : Math.min(100, Math.round((p.percent / 150) * 100))
            })),
            sodiumAlertState: parsed.sodiumAlertState ?? 'ok',
            sodiumPercentDV: Math.round(parsed.sodiumPercentDV ?? 0),
            topOffenders: (parsed.topOffenders ?? []).map((o) => ({
              ...o,
              amountContributed: Math.round(o.amountContributed),
              percentOfTotal: Math.round(o.percentOfTotal),
              percentOfDailyLimit: Math.round(o.percentOfDailyLimit)
            }))
          };
        }
      } catch {
        // Fall back seamlessly to TypeScript engine
      }
    }

    return this.calculateTypeScriptSummary(items, benchmarks);
  });

  readonly totalServings = computed<number>(() => {
    return this.traySummary().totalServingsCount;
  });

  readonly totalNutrients = computed<NutrientTotals>(() => {
    return this.traySummary().totals;
  });

  readonly percentDailyValues = computed<PercentDailyValue[]>(() => {
    return this.traySummary().percentDV;
  });

  readonly sodiumPercent = computed<number>(() => {
    return this.traySummary().sodiumPercentDV;
  });

  readonly remainingSodium = computed<number>(() => {
    return Math.round(this.sodiumLimit() - this.totalNutrients().sodium_mg);
  });

  readonly sodiumAlertState = computed<'ok' | 'warning' | 'exceeded'>(() => {
    return this.traySummary().sodiumAlertState;
  });

  readonly topOffenders = computed<TopOffender[]>(() => {
    return this.traySummary().topOffenders;
  });

  readonly fullHistoryWithToday = computed<(DailyHistoryEntry & { isLiveToday?: boolean })[]>(() => {
    const list = [...this.history()];
    const todayCart = this.cart();
    const totals = this.totalNutrients();
    const today = this.todayDate();

    if (todayCart.length > 0) {
      const existingIdx = list.findIndex((h) => h.date === today);
      const liveEntry: DailyHistoryEntry & { isLiveToday?: boolean } = {
        date: today,
        totalCalories: Math.round(totals.calories),
        totalSodium_mg: Math.round(totals.sodium_mg),
        itemsCount: todayCart.length,
        isLiveToday: true
      };

      if (existingIdx !== -1) {
        list[existingIdx] = liveEntry;
      } else {
        list.unshift(liveEntry);
      }
    }

    return list;
  });

  constructor() {
    // Persist cart with date-stamped envelope
    effect(() => {
      const current = this.cart();
      const today = this.todayDate();
      try {
        const envelope: StoredTrayEnvelope = { date: today, items: current };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
      } catch (err) {
        console.warn('Failed to save cart to localStorage', err);
      }
    });

    // Persist selected profile
    effect(() => {
      const profileId = this.activeProfileId();
      try {
        localStorage.setItem(PROFILE_KEY, profileId);
      } catch {
        /* ignore */
      }
    });

    // Persist custom targets
    effect(() => {
      const targets = this.customTargets();
      try {
        localStorage.setItem(CUSTOM_TARGETS_KEY, JSON.stringify(targets));
      } catch {
        /* ignore */
      }
    });

    void this.initWasmEngine();
  }

  registerWasmModule(mod: NutritionWasmModule | null): void {
    this.wasmModule.set(mod);
  }

  private async initWasmEngine(): Promise<void> {
    if (typeof window === 'undefined') return;
    const win = window as unknown as Record<string, unknown>;

    // 1. Check global factory if preloaded
    const globalFactory = win['createNutritionEngine'];
    if (typeof globalFactory === 'function') {
      try {
        const mod = (await (globalFactory as () => Promise<NutritionWasmModule>)()) ?? null;
        if (mod && typeof mod.calculateTraySummary === 'function') {
          this.wasmModule.set(mod);
          return;
        }
      } catch {
        // Continue to fallback
      }
    }

    // 2. Skip automatic network probe inside Karma test runner
    if ('__karma__' in win) return;

    // 3. Check lightweight WASM manifest before importing ES6 Emscripten bundle
    try {
      const manifestUrl = new URL('assets/wasm/wasm-manifest.json', document.baseURI).href;
      const resp = await fetch(manifestUrl, { cache: 'no-cache' });
      if (!resp.ok) return;
      const manifest = (await resp.json()) as { available?: boolean };
      if (!manifest.available) return;

      const wasmJsUrl = new URL('assets/wasm/nutrition_engine.js', document.baseURI).href;
      const dynamicImport = new Function('u', 'return import(u)') as (
        url: string
      ) => Promise<{ default?: () => Promise<NutritionWasmModule> }>;
      const esModule = await dynamicImport(wasmJsUrl);
      if (esModule && typeof esModule.default === 'function') {
        const mod = await esModule.default();
        if (mod && typeof mod.calculateTraySummary === 'function') {
          this.wasmModule.set(mod);
        }
      }
    } catch {
      // Cleanly retain TypeScript calculation engine
    }
  }

  private calculateTypeScriptSummary(
    items: TrayItem[],
    benchmarks: FDABenchmark[]
  ): TraySummary {
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

    let activeCount = 0;
    let totalServings = 0;

    for (const item of items) {
      const q = Number.isFinite(item.qty) && item.qty > 0 ? item.qty : 0;
      if (q <= 0) continue;
      activeCount++;
      totalServings += q;
      totals.calories += safeNonNegative(item.calories) * q;
      totals.sodium_mg += safeNonNegative(item.sodium_mg) * q;
      totals.satFat_g += safeNonNegative(item.satFat_g) * q;
      totals.sugar_g += safeNonNegative(item.sugar_g) * q;
      totals.fat_g += safeNonNegative(item.fat_g) * q;
      totals.carbs_g += safeNonNegative(item.carbs_g) * q;
      totals.fiber_g += safeNonNegative(item.fiber_g) * q;
      totals.protein_g += safeNonNegative(item.protein_g) * q;
      totals.cholesterol_mg += safeNonNegative(item.cholesterol_mg) * q;
      totals.transFat_g += safeNonNegative(item.transFat_g) * q;
    }

    let sodiumPercentDV = 0;
    let sodiumAlertState: 'ok' | 'warning' | 'exceeded' = 'ok';
    const topOffenders: TopOffender[] = [];

    const percentDV: PercentDailyValue[] = benchmarks.map((bm) => {
      const rawVal = totals[bm.key];
      const val = Math.round(rawVal * 10) / 10;
      const pct = bm.limit > 0 ? Math.round((rawVal / bm.limit) * 100) : 0;
      const visualHeightPct = Math.min(100, Math.max(0, Math.round((pct / 150) * 100)));

      let status: 'ok' | 'warning' | 'exceeded' | 'achieved' = 'ok';
      if (bm.isCeiling) {
        if (pct >= 100) status = 'exceeded';
        else if (pct >= 80) status = 'warning';
      } else if (pct >= 100) {
        status = 'achieved';
      }

      if (bm.key === 'sodium_mg') {
        sodiumPercentDV = pct;
        sodiumAlertState = status === 'exceeded' ? 'exceeded' : status === 'warning' ? 'warning' : 'ok';
      }

      if (bm.isCeiling && pct >= 80 && activeCount > 0) {
        let worstItem: TrayItem | null = null;
        let maxContrib = -1;

        for (const item of items) {
          const q = Number.isFinite(item.qty) && item.qty > 0 ? item.qty : 0;
          if (q <= 0) continue;
          const contrib = safeNonNegative(item[bm.key]) * q;
          if (contrib > maxContrib) {
            maxContrib = contrib;
            worstItem = item;
          }
        }

        if (worstItem && maxContrib > 0) {
          topOffenders.push({
            metricKey: bm.key,
            metricLabel: bm.label,
            itemId: worstItem.id,
            itemName: worstItem.name,
            amountContributed: Math.round(maxContrib),
            percentOfTotal: rawVal > 0 ? Math.round((maxContrib / rawVal) * 100) : 0,
            percentOfDailyLimit: bm.limit > 0 ? Math.round((maxContrib / bm.limit) * 100) : 0
          });
        }
      }

      return {
        key: bm.key,
        label: bm.label,
        value: val,
        limit: bm.limit,
        unit: bm.unit,
        percent: pct,
        visualHeightPct,
        isCeiling: bm.isCeiling,
        status
      };
    });

    return {
      totalItemsCount: activeCount,
      totalServingsCount: Math.round(totalServings * 10) / 10,
      totals,
      percentDV,
      sodiumAlertState,
      sodiumPercentDV,
      topOffenders
    };
  }

  getItemQty(id: string): number {
    return this.cartQtyMap().get(id) ?? 0;
  }

  getDishSodiumImpactPct(dishSodiumMg: number): number {
    const limit = this.sodiumLimit();
    if (limit <= 0 || dishSodiumMg <= 0) return 0;
    return Math.round((dishSodiumMg / limit) * 100);
  }

  wouldExceedSodiumLimit(dishSodiumMg: number): boolean {
    if (dishSodiumMg <= 0) return false;
    return this.totalNutrients().sodium_mg + dishSodiumMg > this.sodiumLimit();
  }

  openMobileSheet(): void {
    this.isMobileSheetOpen.set(true);
  }

  closeMobileSheet(): void {
    this.isMobileSheetOpen.set(false);
  }

  // ── Cart mutations (whole-plate integer servings) ──
  addItem(item: MenuItem, qty: number = 1): void {
    const safeQty = Math.round(safeNonNegative(qty, 1));
    if (safeQty <= 0) return;

    this.cart.update((prev) => {
      const idx = prev.findIndex((i) => i.id === item.id);
      if (idx !== -1) {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          qty: Math.round(updated[idx].qty + safeQty)
        };
        return updated;
      }
      return [...prev, { ...item, qty: safeQty }];
    });
  }

  updateQty(id: string, delta: number): void {
    const intDelta = Math.trunc(delta);
    if (intDelta === 0) return;

    this.cart.update((prev) => {
      const idx = prev.findIndex((i) => i.id === id);
      if (idx === -1) return prev;

      const newQty = Math.round(prev[idx].qty + intDelta);
      if (newQty <= 0) {
        return prev.filter((i) => i.id !== id);
      }
      const updated = [...prev];
      updated[idx] = { ...updated[idx], qty: newQty };
      return updated;
    });
  }

  removeItem(id: string): void {
    this.cart.update((prev) => prev.filter((i) => i.id !== id));
  }

  clearTray(): void {
    this.cart.set([]);
  }

  loadSingleHallMeal(picks: { item: MenuItem; plates: number }[]): void {
    const nextCart: TrayItem[] = [];
    for (const pick of picks) {
      const qty = Math.max(1, Math.round(pick.plates));
      nextCart.push({ ...pick.item, qty });
    }
    this.cart.set(nextCart);
  }

  buildShareSummary(hallName = 'M|Dining'): string {
    const items = this.cart().filter((i) => i.qty > 0);
    const totals = this.totalNutrients();
    const profile = this.activeProfile();
    const naLimit = this.sodiumLimit();
    const naPct = this.sodiumPercent();

    const lines: string[] = [
      `SodiumController • ${hallName} (${this.todayDate()})`,
      `Profile: ${profile.label}`,
      `Sodium: ${Math.round(totals.sodium_mg)} / ${naLimit} mg (${naPct}% DV)`,
      `Calories: ${Math.round(totals.calories)} kcal | Protein: ${Math.round(totals.protein_g)}g | Carbs: ${Math.round(totals.carbs_g)}g | Fat: ${Math.round(totals.fat_g)}g`,
      '',
      'Logged Items:'
    ];

    for (const item of items) {
      lines.push(
        `- ${item.qty}x ${item.name} (${Math.round(item.calories * item.qty)} kcal, ${Math.round(item.sodium_mg * item.qty)}mg Na)`
      );
    }

    return lines.join('\n');
  }

  // ── Profile switching & custom target updates ──
  setProfile(profileId: BenchmarkProfileId): void {
    this.activeProfileId.set(profileId);
  }

  updateCustomTarget(key: keyof CustomNutrientTargets, rawValue: number): void {
    const n = Number(rawValue);
    if (!Number.isFinite(n)) return;
    const clamped = Math.min(50000, Math.max(1, Math.round(n)));
    this.customTargets.update((prev) => ({
      ...prev,
      [key]: clamped
    }));
  }

  resetCustomTargets(): void {
    this.customTargets.set({ ...DEFAULT_CUSTOM_TARGETS });
  }

  // ── History modal controls ──
  openHistory(): void {
    this.isHistoryOpen.set(true);
  }

  closeHistory(): void {
    this.isHistoryOpen.set(false);
  }

  toggleHistory(): void {
    this.isHistoryOpen.update((v) => !v);
  }

  clearHistory(): void {
    try {
      localStorage.removeItem(HISTORY_KEY);
      this.history.set([]);
    } catch {
      /* ignore */
    }
  }

  // ── Date-aware storage ──
  private sanitizeStoredItems(rawItems: unknown[]): TrayItem[] {
    const valid: TrayItem[] = [];
    for (const entry of rawItems) {
      if (!entry || typeof entry !== 'object') continue;
      const r = entry as Partial<TrayItem>;
      if (typeof r.id !== 'string' || typeof r.name !== 'string') continue;
      const rawQty = safeNonNegative(r.qty, 1);
      if (rawQty <= 0) continue;
      const qty = Math.max(1, Math.round(rawQty));

      valid.push({
        id: r.id,
        name: r.name,
        mealPeriod:
          r.mealPeriod === 'breakfast' || r.mealPeriod === 'lunch' || r.mealPeriod === 'dinner'
            ? r.mealPeriod
            : 'lunch',
        station: typeof r.station === 'string' ? r.station : 'General',
        servingSize: typeof r.servingSize === 'string' ? r.servingSize : '1 serving',
        calories: safeNonNegative(r.calories),
        protein_g: safeNonNegative(r.protein_g),
        carbs_g: safeNonNegative(r.carbs_g),
        fat_g: safeNonNegative(r.fat_g),
        satFat_g: safeNonNegative(r.satFat_g),
        transFat_g: safeNonNegative(r.transFat_g),
        cholesterol_mg: safeNonNegative(r.cholesterol_mg),
        sodium_mg: safeNonNegative(r.sodium_mg),
        sugar_g: safeNonNegative(r.sugar_g),
        fiber_g: safeNonNegative(r.fiber_g),
        tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === 'string') : [],
        allergens: Array.isArray(r.allergens)
          ? r.allergens.filter((a): a is string => typeof a === 'string')
          : [],
        qty
      });
    }
    return valid;
  }

  private loadCartWithExpiry(): TrayItem[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      const parsed: unknown = JSON.parse(stored);

      if (Array.isArray(parsed)) {
        return this.sanitizeStoredItems(parsed);
      }

      if (!parsed || typeof parsed !== 'object') return [];
      const envelope = parsed as Partial<StoredTrayEnvelope>;
      const today = getDetroitDate();
      const items = Array.isArray(envelope.items) ? this.sanitizeStoredItems(envelope.items) : [];

      if (envelope.date === today) {
        return items;
      }

      if (typeof envelope.date === 'string' && envelope.date.length > 0 && items.length > 0) {
        this.archiveDayToHistory(envelope.date, items);
      }
      return [];
    } catch {
      return [];
    }
  }

  private archiveDayToHistory(date: string, items: TrayItem[]): void {
    try {
      let totalCal = 0;
      let totalSodium = 0;
      for (const item of items) {
        const q = Number.isFinite(item.qty) && item.qty > 0 ? item.qty : 0;
        if (q <= 0) continue;
        totalCal += safeNonNegative(item.calories) * q;
        totalSodium += safeNonNegative(item.sodium_mg) * q;
      }

      const entry: DailyHistoryEntry = {
        date,
        totalCalories: Math.round(totalCal),
        totalSodium_mg: Math.round(totalSodium),
        itemsCount: items.length
      };

      const history = this.loadHistory();
      const filtered = history.filter((h) => h.date !== date);
      filtered.push(entry);
      filtered.sort((a, b) => b.date.localeCompare(a.date));
      const trimmed = filtered.slice(0, MAX_HISTORY_DAYS);

      localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
      this.history.set(trimmed);
    } catch {
      // ignore
    }
  }

  private loadHistory(): DailyHistoryEntry[] {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (item) =>
              item &&
              typeof item.date === 'string' &&
              typeof item.totalSodium_mg === 'number' &&
              Number.isFinite(item.totalSodium_mg)
          );
        }
      }
    } catch {
      /* ignore */
    }
    return [];
  }

  private loadProfileFromStorage(): BenchmarkProfileId {
    try {
      const stored = localStorage.getItem(PROFILE_KEY);
      if (
        stored === 'custom' ||
        (stored && BENCHMARK_PROFILES.some((p) => p.id === stored))
      ) {
        return stored as BenchmarkProfileId;
      }
    } catch {
      /* ignore */
    }
    return 'fda-standard';
  }

  private loadCustomTargetsFromStorage(): CustomNutrientTargets {
    try {
      const stored = localStorage.getItem(CUSTOM_TARGETS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<CustomNutrientTargets>;
        if (parsed && typeof parsed === 'object') {
          const clampOrDefault = (val: unknown, def: number): number => {
            const n = Number(val);
            return Number.isFinite(n) && n >= 1 && n <= 50000 ? Math.round(n) : def;
          };
          return {
            sodium_mg: clampOrDefault(parsed.sodium_mg, DEFAULT_CUSTOM_TARGETS.sodium_mg),
            calories: clampOrDefault(parsed.calories, DEFAULT_CUSTOM_TARGETS.calories),
            protein_g: clampOrDefault(parsed.protein_g, DEFAULT_CUSTOM_TARGETS.protein_g),
            carbs_g: clampOrDefault(parsed.carbs_g, DEFAULT_CUSTOM_TARGETS.carbs_g),
            fat_g: clampOrDefault(parsed.fat_g, DEFAULT_CUSTOM_TARGETS.fat_g),
            satFat_g: clampOrDefault(parsed.satFat_g, DEFAULT_CUSTOM_TARGETS.satFat_g),
            sugar_g: clampOrDefault(parsed.sugar_g, DEFAULT_CUSTOM_TARGETS.sugar_g),
            fiber_g: clampOrDefault(parsed.fiber_g, DEFAULT_CUSTOM_TARGETS.fiber_g),
            cholesterol_mg: clampOrDefault(parsed.cholesterol_mg, DEFAULT_CUSTOM_TARGETS.cholesterol_mg)
          };
        }
      }
    } catch {
      /* ignore */
    }
    return { ...DEFAULT_CUSTOM_TARGETS };
  }
}
