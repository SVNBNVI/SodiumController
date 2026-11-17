import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  MenuItem,
  DailyMenuPayload,
  MealPeriod,
  DiningHall,
  DINING_HALLS,
  FALLBACK_BURSLEY_ITEMS
} from '../models/nutrition.model';

@Injectable({
  providedIn: 'root'
})
export class MenuSyncService {
  readonly menuItems = signal<MenuItem[]>([...FALLBACK_BURSLEY_ITEMS]);
  readonly loading = signal<boolean>(false);
  readonly isLive = signal<boolean>(false);
  readonly syncStatus = signal<string>('Checking sodium-today.json...');
  readonly lastSyncedDate = signal<string>('');
  readonly itemCount = computed(() => this.menuItems().length);

  // ── Section 6: Multi-hall support ──
  readonly diningHalls: DiningHall[] = DINING_HALLS;
  readonly selectedHall = signal<DiningHall>(DINING_HALLS[0]); // Default: Bursley

  readonly selectedMealPeriod = signal<MealPeriod>('breakfast');
  readonly searchQuery = signal<string>('');
  readonly selectedTag = signal<string>('all');

  readonly availableTags = ['all', 'Vegan', 'Vegetarian', 'Halal', 'Gluten-Free'];

  readonly filteredMenuItems = computed<MenuItem[]>(() => {
    const period = this.selectedMealPeriod();
    if (period === 'salad') return [];

    const items = this.menuItems();
    const query = this.searchQuery().trim().toLowerCase();
    const tag = this.selectedTag();

    return items.filter((item) => {
      if (item.mealPeriod !== period) return false;

      if (query) {
        const matchesName = item.name.toLowerCase().includes(query);
        const matchesStation = item.station.toLowerCase().includes(query);
        if (!matchesName && !matchesStation) return false;
      }

      if (tag !== 'all') {
        const hasTag = item.tags && item.tags.some((t) => t.toLowerCase() === tag.toLowerCase());
        if (!hasTag) return false;
      }

      return true;
    });
  });

  readonly groupedByStation = computed<{ station: string; items: MenuItem[] }[]>(() => {
    const filtered = this.filteredMenuItems();
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

  constructor(private http: HttpClient) {
    this.fetchMenuForHall(this.selectedHall());
  }

  // ── Section 6: Hall switching ──
  setHall(hall: DiningHall): void {
    this.selectedHall.set(hall);
    this.fetchMenuForHall(hall);
  }

  fetchSodiumJson(force = false): void {
    this.fetchMenuForHall(this.selectedHall(), force);
  }

  private fetchMenuForHall(hall: DiningHall, force = false): void {
    this.loading.set(true);
    this.syncStatus.set(`Syncing ${hall.name}...`);

    // Cache-busting timestamp per Section 1
    const ts = `?t=${Date.now()}`;

    // Try hall-specific file first, then fall back to default
    const hallJsonPath = `assets/menus/${hall.slug}-today.json${ts}`;
    const defaultJsonPath = `assets/sodium-today.json${ts}`;

    this.http.get<DailyMenuPayload>(hallJsonPath).subscribe({
      next: (payload) => {
        this.applyPayload(payload, hall);
      },
      error: () => {
        // Fallback to default sodium-today.json (Bursley)
        this.http.get<DailyMenuPayload>(defaultJsonPath).subscribe({
          next: (payload) => {
            this.applyPayload(payload, hall);
          },
          error: () => {
            // Final fallback to built-in menu
            this.http.get<DailyMenuPayload>(`sodium-today.json${ts}`).subscribe({
              next: (payload) => {
                this.applyPayload(payload, hall);
              },
              error: (err) => {
                console.warn('[MenuSyncService] Could not load live JSON; using built-in Bursley fallback menu.', err);
                this.menuItems.set([...FALLBACK_BURSLEY_ITEMS]);
                this.isLive.set(false);
                this.syncStatus.set(`Using Built-in Bursley Menu (Offline Fallback)`);
                this.loading.set(false);
              }
            });
          }
        });
      }
    });
  }

  private applyPayload(payload: DailyMenuPayload, hall: DiningHall): void {
    if (payload && Array.isArray(payload.items) && payload.items.length > 0) {
      this.menuItems.set(payload.items);
      this.isLive.set(true);
      this.lastSyncedDate.set(payload.date || '');
      this.syncStatus.set(`Live ${hall.name} (${payload.date}) • ${payload.items.length} items`);
    } else {
      this.menuItems.set([...FALLBACK_BURSLEY_ITEMS]);
      this.isLive.set(false);
      this.syncStatus.set('Empty live menu; loaded verified Bursley database');
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
}
