import { Injectable, signal, computed, effect, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Title } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import {
  MenuItem,
  DailyMenuPayload,
  MealPeriod,
  MenuSortOption,
  ALLERGEN_OPTIONS,
  DiningHall,
  DINING_HALLS,
  FALLBACK_BURSLEY_ITEMS
} from '../models/nutrition.model';
import { TrayCartService } from './tray-cart.service';

const HALL_STORAGE_KEY = 'sodiumControllerHall';
const ALLERGEN_STORAGE_KEY = 'sodiumControllerExcludedAllergens';

function getDetroitDefaultMealPeriod(): MealPeriod {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Detroit',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    }).formatToParts(new Date());
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 8);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    const totalMinutes = (hour % 24) * 60 + minute;
    if (totalMinutes < 10 * 60 + 30) return 'breakfast';
    if (totalMinutes < 16 * 60) return 'lunch';
    return 'dinner';
  } catch {
    return 'breakfast';
  }
}

const SORT_LABELS: Record<MenuSortOption, string> = {
  station: 'Station Grouping',
  'sodium-asc': 'Sorted by Lowest Sodium',
  'sodium-desc': 'Sorted by Highest Sodium',
  'protein-desc': 'Sorted by Highest Protein',
  'calories-asc': 'Sorted by Lowest Calories'
};

@Injectable({
  providedIn: 'root'
})
export class MenuSyncService {
  private readonly http = inject(HttpClient);
  private readonly titleService = inject(Title);
  private readonly cartService = inject(TrayCartService);
  private activeRequestSub: Subscription | null = null;

  readonly menuItems = signal<MenuItem[]>([...FALLBACK_BURSLEY_ITEMS]);
  readonly loading = signal<boolean>(false);
  readonly isLive = signal<boolean>(false);
  readonly syncStatus = signal<string>('Syncing...');
  readonly lastSyncedDate = signal<string>('');
  readonly itemCount = computed(() => this.menuItems().length);

  // ── Multi-hall support with localStorage persistence ──
  readonly diningHalls: DiningHall[] = DINING_HALLS;
  readonly selectedHall = signal<DiningHall>(this.loadHallFromStorage());

  // ── Meal period, search, dietary tag, allergen, low-sodium, and sort state ──
  readonly selectedMealPeriod = signal<MealPeriod>(getDetroitDefaultMealPeriod());
  readonly searchQuery = signal<string>('');
  readonly selectedTag = signal<string>('all');
  readonly excludedAllergens = signal<string[]>(this.loadExcludedAllergensFromStorage());
  readonly lowSodiumOnly = signal<boolean>(false);
  readonly fitsRemainingSodiumOnly = signal<boolean>(false);
  readonly sortBy = signal<MenuSortOption>('station');

  readonly availableTags = ['all', 'Vegan', 'Vegetarian', 'Halal', 'Gluten-Free'];
  readonly availableAllergens: readonly string[] = ALLERGEN_OPTIONS;

  readonly mealPeriodCounts = computed<Record<'breakfast' | 'lunch' | 'dinner', number>>(() => {
    const counts = { breakfast: 0, lunch: 0, dinner: 0 };
    for (const item of this.menuItems()) {
      if (item.mealPeriod === 'breakfast') counts.breakfast++;
      else if (item.mealPeriod === 'lunch') counts.lunch++;
      else if (item.mealPeriod === 'dinner') counts.dinner++;
    }
    return counts;
  });

  readonly activeFilterCount = computed<number>(() => {
    let count = 0;
    if (this.searchQuery().trim().length > 0) count++;
    if (this.selectedTag() !== 'all') count++;
    if (this.lowSodiumOnly()) count++;
    if (this.fitsRemainingSodiumOnly()) count++;
    count += this.excludedAllergens().length;
    return count;
  });

  readonly filteredMenuItems = computed<MenuItem[]>(() => {
    const period = this.selectedMealPeriod();
    if (period === 'salad') return [];

    const items = this.menuItems();
    const query = this.searchQuery().trim().toLowerCase();
    const tag = this.selectedTag();
    const excluded = this.excludedAllergens().map((a) => a.toLowerCase());
    const lowNa = this.lowSodiumOnly();
    const fitsBudget = this.fitsRemainingSodiumOnly();
    const remainingBudget = Math.max(0, this.cartService.remainingSodium());
    const sortMode = this.sortBy();

    const filtered = items.filter((item) => {
      if (item.mealPeriod !== period) return false;

      if (query) {
        const matchesName = item.name.toLowerCase().includes(query);
        const matchesStation = item.station.toLowerCase().includes(query);
        const matchesTag = item.tags?.some((t) => t.toLowerCase().includes(query)) ?? false;
        if (!matchesName && !matchesStation && !matchesTag) return false;
      }

      if (tag !== 'all') {
        const hasTag = item.tags && item.tags.some((t) => t.toLowerCase() === tag.toLowerCase());
        if (!hasTag) return false;
      }

      if (lowNa && item.sodium_mg > 400) {
        return false;
      }

      if (fitsBudget && item.sodium_mg > remainingBudget) {
        return false;
      }

      if (excluded.length > 0 && item.allergens && item.allergens.length > 0) {
        const hasExcluded = item.allergens.some((a) => excluded.includes(a.toLowerCase()));
        if (hasExcluded) return false;
      }

      return true;
    });

    if (sortMode === 'station') {
      return filtered;
    }

    return filtered.sort((a, b) => {
      switch (sortMode) {
        case 'sodium-asc':
          return a.sodium_mg - b.sodium_mg || a.calories - b.calories;
        case 'sodium-desc':
          return b.sodium_mg - a.sodium_mg || b.calories - a.calories;
        case 'protein-desc':
          return b.protein_g - a.protein_g || a.sodium_mg - b.sodium_mg;
        case 'calories-asc':
          return a.calories - b.calories || a.sodium_mg - b.sodium_mg;
      }
    });
  });

  readonly groupedByStation = computed<{ station: string; items: MenuItem[] }[]>(() => {
    const filtered = this.filteredMenuItems();
    if (filtered.length === 0) return [];

    const sortMode = this.sortBy();
    if (sortMode !== 'station') {
      return [
        {
          station: SORT_LABELS[sortMode],
          items: filtered
        }
      ];
    }

    const map = new Map<string, MenuItem[]>();
    for (const item of filtered) {
      const station = item.station || 'General Offerings';
      if (!map.has(station)) {
        map.set(station, []);
      }
      map.get(station)!.push(item);
    }

    return Array.from(map.entries()).map(([station, items]) => ({
      station,
      items
    }));
  });

  constructor() {
    effect(() => {
      const hall = this.selectedHall();
      this.titleService.setTitle(`SodiumController • ${hall.name} Nutrition & Limit Tracker`);
      try {
        localStorage.setItem(HALL_STORAGE_KEY, hall.slug);
      } catch {
        /* ignore storage quota errors */
      }
    });

    effect(() => {
      const excluded = this.excludedAllergens();
      try {
        localStorage.setItem(ALLERGEN_STORAGE_KEY, JSON.stringify(excluded));
      } catch {
        /* ignore storage quota errors */
      }
    });

    this.fetchMenuForHall(this.selectedHall());
  }

  setHall(hall: DiningHall): void {
    this.selectedHall.set(hall);
    this.fetchMenuForHall(hall);
  }

  fetchSodiumJson(force = false): void {
    this.fetchMenuForHall(this.selectedHall(), force);
  }

  private fetchMenuForHall(hall: DiningHall, _force = false): void {
    this.activeRequestSub?.unsubscribe();
    this.loading.set(true);
    this.syncStatus.set('Syncing...');

    const ts = `?t=${Date.now()}`;
    const hallJsonPath = `assets/menus/${hall.slug}-today.json${ts}`;
    const defaultJsonPath = `assets/sodium-today.json${ts}`;

    this.activeRequestSub = this.http.get<DailyMenuPayload>(hallJsonPath).subscribe({
      next: (payload) => {
        this.applyPayload(payload, hall);
      },
      error: () => {
        this.activeRequestSub = this.http.get<DailyMenuPayload>(defaultJsonPath).subscribe({
          next: (payload) => {
            this.applyPayload(payload, hall);
          },
          error: () => {
            this.activeRequestSub = this.http.get<DailyMenuPayload>(`sodium-today.json${ts}`).subscribe({
              next: (payload) => {
                this.applyPayload(payload, hall);
              },
              error: () => {
                this.menuItems.set([...FALLBACK_BURSLEY_ITEMS]);
                this.isLive.set(false);
                this.syncStatus.set('Offline Sample');
                this.loading.set(false);
              }
            });
          }
        });
      }
    });
  }

  private applyPayload(payload: DailyMenuPayload, _hall: DiningHall): void {
    if (payload && Array.isArray(payload.items) && payload.items.length > 0) {
      this.menuItems.set(payload.items);
      this.lastSyncedDate.set(payload.date || '');

      if (payload.isFallback) {
        this.isLive.set(false);
        this.syncStatus.set('Offline Sample');
      } else {
        this.isLive.set(true);
        this.syncStatus.set('Data Live');
      }

      // If the currently selected meal period has 0 dishes (e.g. weekend Brunch-only halls), auto-select the first available period
      const activePeriod = this.selectedMealPeriod();
      if (activePeriod !== 'salad') {
        const counts = this.mealPeriodCounts();
        if (counts[activePeriod] === 0) {
          const fallbackOrder: ('lunch' | 'dinner' | 'breakfast')[] = ['lunch', 'dinner', 'breakfast'];
          const firstNonEmpty = fallbackOrder.find((p) => counts[p] > 0);
          if (firstNonEmpty) {
            this.selectedMealPeriod.set(firstNonEmpty);
          }
        }
      }
    } else {
      this.menuItems.set([...FALLBACK_BURSLEY_ITEMS]);
      this.isLive.set(false);
      this.syncStatus.set('Offline Sample');
    }
    this.loading.set(false);
  }

  setMealPeriod(period: MealPeriod): void {
    this.selectedMealPeriod.set(period);
  }

  setSearchQuery(q: string): void {
    this.searchQuery.set(q);
  }

  setSelectedTag(tag: string): void {
    this.selectedTag.set(tag);
  }

  toggleExcludedAllergen(allergen: string): void {
    this.excludedAllergens.update((prev) =>
      prev.includes(allergen) ? prev.filter((a) => a !== allergen) : [...prev, allergen]
    );
  }

  clearExcludedAllergens(): void {
    this.excludedAllergens.set([]);
  }

  toggleLowSodiumOnly(): void {
    this.lowSodiumOnly.update((v) => !v);
  }

  toggleFitsRemainingSodium(): void {
    this.fitsRemainingSodiumOnly.update((v) => !v);
  }

  setSortBy(sort: MenuSortOption): void {
    this.sortBy.set(sort);
  }

  resetAllFilters(): void {
    this.searchQuery.set('');
    this.selectedTag.set('all');
    this.lowSodiumOnly.set(false);
    this.fitsRemainingSodiumOnly.set(false);
    this.excludedAllergens.set([]);
    this.sortBy.set('station');
  }

  private loadHallFromStorage(): DiningHall {
    try {
      const slug = localStorage.getItem(HALL_STORAGE_KEY);
      if (slug) {
        const match = DINING_HALLS.find((h) => h.slug === slug);
        if (match) return match;
      }
    } catch {
      /* ignore */
    }
    return DINING_HALLS[0];
  }

  private loadExcludedAllergensFromStorage(): string[] {
    try {
      const raw = localStorage.getItem(ALLERGEN_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter((x): x is string => typeof x === 'string');
        }
      }
    } catch {
      /* ignore */
    }
    return [];
  }
}
