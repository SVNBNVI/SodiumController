import { Injectable, signal, computed, effect } from '@angular/core';
import {
  MenuItem,
  TrayItem,
  NutrientTotals,
  PercentDailyValue,
  TopOffender,
  FDABenchmark,
  BenchmarkProfileId,
  BenchmarkProfile,
  BENCHMARK_PROFILES,
  StoredTrayEnvelope,
  DailyHistoryEntry
} from '../models/nutrition.model';

const STORAGE_KEY = 'sodiumControllerCart';
const HISTORY_KEY = 'sodiumControllerHistory';
const PROFILE_KEY = 'sodiumControllerProfile';
const MAX_HISTORY_DAYS = 14;

function getDetroitDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Detroit',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

@Injectable({
  providedIn: 'root'
})
export class TrayCartService {
  // ── Section 5: Active benchmark profile ──
  readonly activeProfileId = signal<BenchmarkProfileId>(this.loadProfileFromStorage());

  readonly activeProfile = computed<BenchmarkProfile>(() => {
    return BENCHMARK_PROFILES.find((p) => p.id === this.activeProfileId()) ?? BENCHMARK_PROFILES[0];
  });

  readonly activeBenchmarks = computed<FDABenchmark[]>(() => {
    return this.activeProfile().benchmarks;
  });

  // ── Section 4: Date-stamped tray with auto-expire ──
  readonly todayDate = signal<string>(getDetroitDate());
  readonly cart = signal<TrayItem[]>(this.loadCartWithExpiry());
  readonly history = signal<DailyHistoryEntry[]>(this.loadHistory());
  readonly isHistoryOpen = signal<boolean>(false);

  readonly fullHistoryWithToday = computed<(DailyHistoryEntry & { isLiveToday?: boolean })[]>(() => {
    const list = [...this.history()];
    const todayCart = this.cart();
    const totals = this.totalNutrients();
    const today = this.todayDate();

    // If today's cart has items, add or update today's live preview in the list
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

  // ── Section 3: WebAssembly engine status ──
  readonly wasmLoaded = signal<boolean>(false);
  readonly engineMode = computed<string>(() => {
    return this.wasmLoaded() ? 'C++20 WebAssembly (WASM)' : 'TypeScript Engine';
  });

  readonly cartCount = computed(() => {
    return this.cart().length;
  });

  readonly totalServings = computed(() => {
    return this.cart().reduce((sum, item) => sum + (item.qty || 1), 0);
  });

  readonly totalNutrients = computed<NutrientTotals>(() => {
    const totals: NutrientTotals = {
      calories: 0, sodium_mg: 0, satFat_g: 0, sugar_g: 0, fat_g: 0,
      carbs_g: 0, fiber_g: 0, protein_g: 0, cholesterol_mg: 0, transFat_g: 0
    };

    for (const item of this.cart()) {
      const q = item.qty || 1;
      totals.calories += (item.calories || 0) * q;
      totals.sodium_mg += (item.sodium_mg || 0) * q;
      totals.satFat_g += (item.satFat_g || 0) * q;
      totals.sugar_g += (item.sugar_g || 0) * q;
      totals.fat_g += (item.fat_g || 0) * q;
      totals.carbs_g += (item.carbs_g || 0) * q;
      totals.fiber_g += (item.fiber_g || 0) * q;
      totals.protein_g += (item.protein_g || 0) * q;
      totals.cholesterol_mg += (item.cholesterol_mg || 0) * q;
      totals.transFat_g += (item.transFat_g || 0) * q;
    }

    return totals;
  });

  readonly percentDailyValues = computed<PercentDailyValue[]>(() => {
    const totals = this.totalNutrients();
    const benchmarks = this.activeBenchmarks();

    return benchmarks.map((bm) => {
      const val = Math.round(totals[bm.key] * 10) / 10;
      const pct = bm.limit > 0 ? Math.round((val / bm.limit) * 100) : 0;
      const visualHeightPct = Math.min(100, Math.round((pct / 150) * 100));

      let status: 'ok' | 'warning' | 'exceeded' | 'achieved' = 'ok';
      if (bm.isCeiling) {
        if (pct >= 100) status = 'exceeded';
        else if (pct >= 80) status = 'warning';
      } else {
        if (pct >= 100) status = 'achieved';
      }

      return { key: bm.key, label: bm.label, value: val, limit: bm.limit, unit: bm.unit, percent: pct, visualHeightPct, isCeiling: bm.isCeiling, status };
    });
  });

  readonly sodiumPercent = computed<number>(() => {
    const sodiumVal = this.totalNutrients().sodium_mg;
    const sodiumBm = this.activeBenchmarks().find((b) => b.key === 'sodium_mg');
    const limit = sodiumBm?.limit ?? 2300;
    return Math.round((sodiumVal / limit) * 100);
  });

  readonly sodiumAlertState = computed<'ok' | 'warning' | 'exceeded'>(() => {
    const pct = this.sodiumPercent();
    if (pct >= 100) return 'exceeded';
    if (pct >= 80) return 'warning';
    return 'ok';
  });

  readonly topOffenders = computed<TopOffender[]>(() => {
    const items = this.cart();
    const totals = this.totalNutrients();
    if (items.length === 0) return [];

    const offenders: TopOffender[] = [];
    const ceilingMetrics = this.activeBenchmarks().filter((b) => b.isCeiling);

    for (const bm of ceilingMetrics) {
      const totalVal = totals[bm.key];
      const pctOfLimit = bm.limit > 0 ? (totalVal / bm.limit) * 100 : 0;

      if (pctOfLimit >= 80) {
        let worstItem: TrayItem | null = null;
        let maxContrib = -1;

        for (const item of items) {
          const contrib = ((item[bm.key] as number) || 0) * (item.qty || 1);
          if (contrib > maxContrib) {
            maxContrib = contrib;
            worstItem = item;
          }
        }

        if (worstItem && maxContrib > 0) {
          offenders.push({
            metricKey: bm.key,
            metricLabel: bm.label,
            itemId: worstItem.id,
            itemName: worstItem.name,
            amountContributed: Math.round(maxContrib),
            percentOfTotal: totalVal > 0 ? Math.round((maxContrib / totalVal) * 100) : 0,
            percentOfDailyLimit: bm.limit > 0 ? Math.round((maxContrib / bm.limit) * 100) : 0
          });
        }
      }
    }

    return offenders;
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
      } catch { /* ignore */ }
    });

    this.initWasmEngine();
  }

  private initWasmEngine(): void {
    if (typeof window !== 'undefined' && (window as any).createNutritionEngine) {
      try {
        (window as any).createNutritionEngine().then((mod: any) => {
          if (mod && mod.calculateTraySummary) {
            (window as any).__sodiumWasmModule = mod;
            this.wasmLoaded.set(true);
            console.log('[TrayCartService] C++20 WebAssembly nutrition engine loaded successfully.');
          }
        }).catch(() => {
          // Fallback to TS
        });
      } catch {
        // Fallback to TS
      }
    }
  }

  // ── Cart mutations ──
  addItem(item: MenuItem, qty: number = 1.0): void {
    this.cart.update((prev) => {
      const idx = prev.findIndex((i) => i.id === item.id);
      if (idx !== -1) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], qty: Math.round((updated[idx].qty + qty) * 10) / 10 };
        return updated;
      }
      return [...prev, { ...item, qty }];
    });
  }

  updateQty(id: string, delta: number): void {
    this.cart.update((prev) => {
      const idx = prev.findIndex((i) => i.id === id);
      if (idx === -1) return prev;

      const newQty = Math.round((prev[idx].qty + delta) * 10) / 10;
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

  // ── Section 5: Profile switching ──
  setProfile(profileId: BenchmarkProfileId): void {
    this.activeProfileId.set(profileId);
  }

  // ── Section 4: History modal controls ──
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
    } catch { /* ignore */ }
  }

  // ── Section 4: Date-aware storage ──
  private loadCartWithExpiry(): TrayItem[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      const parsed = JSON.parse(stored);

      // Handle legacy format (plain array without date envelope)
      if (Array.isArray(parsed)) {
        return parsed;
      }

      const envelope = parsed as StoredTrayEnvelope;
      const today = getDetroitDate();

      if (envelope.date === today) {
        // Same day — restore items
        return Array.isArray(envelope.items) ? envelope.items : [];
      }

      // Different day — archive yesterday's tray into history, then start fresh
      if (Array.isArray(envelope.items) && envelope.items.length > 0) {
        this.archiveDayToHistory(envelope.date, envelope.items);
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
        const q = item.qty || 1;
        totalCal += (item.calories || 0) * q;
        totalSodium += (item.sodium_mg || 0) * q;
      }

      const entry: DailyHistoryEntry = {
        date,
        totalCalories: Math.round(totalCal),
        totalSodium_mg: Math.round(totalSodium),
        itemsCount: items.length
      };

      const history = this.loadHistory();
      // Prevent duplicate entries for same date
      const filtered = history.filter((h) => h.date !== date);
      filtered.push(entry);
      // Keep only most recent MAX_HISTORY_DAYS entries
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
            (item) => item && typeof item.date === 'string' && typeof item.totalSodium_mg === 'number'
          );
        }
      }
    } catch { /* ignore */ }
    return [];
  }

  private loadProfileFromStorage(): BenchmarkProfileId {
    try {
      const stored = localStorage.getItem(PROFILE_KEY);
      if (stored && BENCHMARK_PROFILES.some((p) => p.id === stored)) {
        return stored as BenchmarkProfileId;
      }
    } catch { /* ignore */ }
    return 'fda-standard';
  }
}
