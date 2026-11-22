import { Component, inject, ViewChildren, QueryList, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MenuSyncService } from '../../services/menu-sync.service';
import { TrayCartService } from '../../services/tray-cart.service';
import { MenuItem, MealPeriod, MenuSortOption } from '../../models/nutrition.model';

@Component({
  selector: 'app-menu-browser',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-4">
      <!-- Meal Period Tab Switcher (WAI-ARIA Tabs with Arrow Key Navigation) -->
      <div
        role="tablist"
        aria-label="Meal periods"
        class="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto sc-scroller"
      >
        <button
          #periodTab
          *ngFor="let tab of tabs; let idx = index"
          type="button"
          role="tab"
          [id]="'meal-tab-' + tab.id"
          [attr.aria-selected]="menuSync.selectedMealPeriod() === tab.id"
          [attr.tabindex]="menuSync.selectedMealPeriod() === tab.id ? 0 : -1"
          (click)="setPeriod(tab.id)"
          (keydown)="onTabKeydown($event, idx)"
          class="px-3.5 py-2 min-h-[36px] rounded-lg text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5"
          [ngClass]="{
            'bg-[#FFCB05] text-slate-950 shadow-sm shadow-amber-400/20': menuSync.selectedMealPeriod() === tab.id,
            'text-slate-400 hover:text-white hover:bg-slate-800/60': menuSync.selectedMealPeriod() !== tab.id
          }"
        >
          <span aria-hidden="true">{{ tab.icon }}</span>
          <span>{{ tab.label }}</span>
          <span
            *ngIf="tab.id !== 'salad'"
            class="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
            [ngClass]="{
              'bg-slate-950/20 text-slate-950': menuSync.selectedMealPeriod() === tab.id,
              'bg-slate-800 text-slate-400': menuSync.selectedMealPeriod() !== tab.id
            }"
          >
            {{ getPeriodCount(tab.id) }}
          </span>
        </button>
      </div>

      <!-- Search, Smart Sodium Budget Filter, Sort & Allergen Controls (hidden in Salad tab) -->
      <search
        *ngIf="menuSync.selectedMealPeriod() !== 'salad'"
        aria-label="Filter dining hall dishes"
        class="block space-y-2.5 bg-slate-900/50 border border-slate-800/80 rounded-xl p-3"
      >
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <!-- Instant Search Input -->
          <div class="relative flex-1">
            <label for="menuDishSearch" class="visually-hidden">Search dishes, stations, or dietary tags</label>
            <span aria-hidden="true" class="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-500">
              <svg aria-hidden="true" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
              </svg>
            </span>
            <input
              id="menuDishSearch"
              name="menuSearch"
              type="search"
              autocorrect="off"
              autocapitalize="none"
              spellcheck="false"
              [ngModel]="menuSync.searchQuery()"
              (ngModelChange)="onSearchChange($event)"
              placeholder="Search dishes or stations (e.g. Chicken, Pizza, Oats)..."
              class="w-full pl-9 pr-8 py-2 min-h-[36px] bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 transition"
            />
            <button
              *ngIf="menuSync.searchQuery()"
              type="button"
              (click)="clearSearch()"
              aria-label="Clear search query"
              class="absolute inset-y-0 right-1.5 px-2 flex items-center text-slate-400 hover:text-white"
            >
              <span aria-hidden="true">&times;</span>
            </button>
          </div>

          <!-- Sort Selector -->
          <div class="flex items-center gap-1.5 shrink-0">
            <label for="menuSortSelect" class="text-[11px] text-slate-400 font-medium shrink-0">Sort:</label>
            <select
              id="menuSortSelect"
              name="menuSort"
              [ngModel]="menuSync.sortBy()"
              (ngModelChange)="onSortChange($event)"
              class="text-xs px-2.5 py-2 min-h-[36px] rounded-lg bg-slate-950 text-slate-200 border border-slate-800 font-medium cursor-pointer pr-7 appearance-none bg-no-repeat bg-right flex-1 sm:flex-initial"
              style="background-image: url('data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%226%22 viewBox=%220 0 10 6%22%3E%3Cpath d=%22M0 0l5 6 5-6z%22 fill=%22%2394a3b8%22/%3E%3C/svg%3E'); background-position: right 8px center; background-size: 8px 5px;"
            >
              <option *ngFor="let opt of sortOptions" [value]="opt.value" class="bg-slate-900 text-slate-200">
                {{ opt.label }}
              </option>
            </select>
          </div>
        </div>

        <!-- 1-Click Quick Filters: Fits Remaining Sodium + Low Sodium + Dietary Pills -->
        <div class="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            [attr.aria-pressed]="menuSync.fitsRemainingSodiumOnly()"
            (click)="menuSync.toggleFitsRemainingSodium()"
            class="px-2.5 py-1 min-h-[28px] rounded-full text-[11px] font-bold transition border"
            [ngClass]="{
              'bg-[#FFCB05] text-slate-950 border-[#FFCB05] shadow-sm': menuSync.fitsRemainingSodiumOnly(),
              'bg-amber-500/10 text-[#FFCB05] border-amber-500/40 hover:bg-amber-500/20': !menuSync.fitsRemainingSodiumOnly()
            }"
          >
            <span aria-hidden="true">✨</span>
            Fits My Na Left (&le;{{ Math.max(0, cartService.remainingSodium()) | number }}mg)
          </button>

          <button
            type="button"
            [attr.aria-pressed]="menuSync.lowSodiumOnly()"
            (click)="menuSync.toggleLowSodiumOnly()"
            class="px-2.5 py-1 min-h-[28px] rounded-full text-[11px] font-semibold transition border"
            [ngClass]="{
              'bg-emerald-950/80 text-emerald-300 border-emerald-500/60': menuSync.lowSodiumOnly(),
              'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-emerald-300': !menuSync.lowSodiumOnly()
            }"
          >
            Low Na (&le;400mg)
          </button>

          <span aria-hidden="true" class="text-slate-700 mx-0.5 hidden sm:inline">|</span>

          <button
            *ngFor="let tag of menuSync.availableTags"
            type="button"
            [attr.aria-pressed]="menuSync.selectedTag() === tag"
            (click)="setTag(tag)"
            class="px-2.5 py-1 min-h-[28px] rounded-full text-[11px] font-medium transition border"
            [ngClass]="{
              'bg-[#00274C] text-[#FFCB05] border-[#FFCB05]': menuSync.selectedTag() === tag,
              'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200': menuSync.selectedTag() !== tag
            }"
          >
            {{ tag === 'all' ? 'All Diets' : tag }}
          </button>

          <span class="ml-auto text-[11px] font-mono text-slate-400">
            <strong class="text-[#FFCB05]">{{ menuSync.filteredMenuItems().length }}</strong> dishes
          </span>
        </div>

        <!-- Collapsible Allergen Exclusion Bar (starts open if user already excluded allergens, compact otherwise) -->
        <details [open]="menuSync.excludedAllergens().length > 0" class="group pt-1 border-t border-slate-800/60">
          <summary class="cursor-pointer list-none text-[11px] text-slate-400 hover:text-slate-200 font-medium flex items-center justify-between select-none py-0.5">
            <span>
              Exclude Allergens
              <span *ngIf="menuSync.excludedAllergens().length > 0" class="text-rose-300 font-bold ml-1">
                ({{ menuSync.excludedAllergens().length }} excluded)
              </span>
            </span>
            <div class="flex items-center gap-2">
              <button
                *ngIf="menuSync.activeFilterCount() > 0"
                type="button"
                (click)="$event.stopPropagation(); resetFilters()"
                class="text-[11px] text-[#FFCB05] hover:underline font-semibold"
              >
                Reset filters ({{ menuSync.activeFilterCount() }})
              </button>
              <span aria-hidden="true" class="text-[10px] group-open:rotate-180 transition-transform">&#9660;</span>
            </div>
          </summary>

          <div class="pt-2 space-y-1.5">
            <div class="flex items-center gap-1.5 flex-wrap">
              <button
                *ngFor="let allergen of menuSync.availableAllergens"
                type="button"
                [attr.aria-pressed]="isAllergenExcluded(allergen)"
                (click)="menuSync.toggleExcludedAllergen(allergen)"
                class="px-2.5 py-1 min-h-[26px] rounded-full text-[10px] font-medium transition border"
                [ngClass]="{
                  'bg-rose-950/70 text-rose-200 border-rose-500/60 line-through decoration-rose-400': isAllergenExcluded(allergen),
                  'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200': !isAllergenExcluded(allergen)
                }"
              >
                {{ allergen }}
              </button>
            </div>
            <p *ngIf="menuSync.excludedAllergens().length > 0" class="text-[10px] text-slate-400 leading-snug">
              Cross-contact can occur in campus kitchens. Always verify in-hall M|Dining signage for severe allergies.
            </p>
          </div>
        </details>
      </search>

      <!-- Station Grouped Dishes Listing -->
      <div
        *ngIf="menuSync.selectedMealPeriod() !== 'salad'"
        role="tabpanel"
        [attr.aria-labelledby]="'meal-tab-' + menuSync.selectedMealPeriod()"
        class="space-y-5"
      >
        <!-- Empty State -->
        <div
          *ngIf="menuSync.groupedByStation().length === 0"
          class="p-8 text-center bg-slate-900/60 border border-slate-800 rounded-xl"
        >
          <p class="text-sm text-slate-300 mb-2">No dishes match your current filters.</p>
          <button
            type="button"
            (click)="resetFilters()"
            class="text-xs px-3.5 py-2 min-h-[34px] rounded-lg bg-slate-800 text-[#FFCB05] hover:bg-slate-700 font-semibold transition"
          >
            Reset Filters
          </button>
        </div>

        <!-- Station Section -->
        <section
          *ngFor="let group of menuSync.groupedByStation(); trackBy: trackByStation"
          class="bg-slate-900/70 border border-slate-800/90 rounded-xl overflow-hidden shadow-sm"
        >
          <!-- Station Header -->
          <div class="px-4 py-2 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span aria-hidden="true" class="w-2 h-2 rounded-full bg-[#FFCB05]"></span>
              <h3 class="text-xs font-bold text-white uppercase tracking-wider">{{ group.station }}</h3>
            </div>
            <span class="text-[11px] text-slate-400 font-mono">{{ group.items.length }}</span>
          </div>

          <!-- Dishes in this Station -->
          <ul role="list" class="divide-y divide-slate-800/60 m-0 p-0 list-none">
            <li
              *ngFor="let item of group.items; trackBy: trackByItemId"
              class="p-3 hover:bg-slate-800/40 transition flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
            >
              <!-- Dish Details -->
              <div class="space-y-1 flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h4 class="text-sm font-semibold text-slate-100 font-display truncate">{{ item.name }}</h4>
                  <span class="text-[10px] text-slate-300 px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 font-mono">
                    {{ item.servingSize }}
                  </span>
                  <span
                    *ngIf="menuSync.sortBy() !== 'station'"
                    class="text-[10px] text-[#FFCB05] px-1.5 py-0.5 rounded bg-[#00274C]/70 border border-amber-500/30 font-medium"
                  >
                    {{ item.station }}
                  </span>
                </div>

                <!-- Nutrition Breakdown + Instant %DV Impact -->
                <div class="flex items-center gap-1.5 flex-wrap text-[11px] font-mono">
                  <span class="text-slate-300 font-medium">
                    <strong class="text-white">{{ item.calories }}</strong> kcal
                  </span>
                  <span aria-hidden="true" class="text-slate-600">•</span>
                  <span
                    class="font-semibold"
                    [ngClass]="{
                      'text-rose-400': item.sodium_mg >= 800,
                      'text-amber-400': item.sodium_mg >= 400 && item.sodium_mg < 800,
                      'text-emerald-400': item.sodium_mg < 400
                    }"
                  >
                    {{ item.sodium_mg }}mg Na ({{ cartService.getDishSodiumImpactPct(item.sodium_mg) }}% DV)
                  </span>
                  <span aria-hidden="true" class="text-slate-600">•</span>
                  <span class="text-sky-300">{{ item.protein_g }}g Pro</span>
                  <span aria-hidden="true" class="text-slate-600">•</span>
                  <span class="text-slate-400">{{ item.satFat_g }}g Sat</span>
                  <span aria-hidden="true" class="text-slate-600">•</span>
                  <span class="text-slate-400">{{ item.sugar_g }}g Sug</span>
                </div>

                <!-- Dietary Tags, Allergens & Over-Budget Warning -->
                <div
                  *ngIf="(item.tags && item.tags.length > 0) || (item.allergens && item.allergens.length > 0) || showWouldExceedBadge(item)"
                  class="flex items-center gap-1.5 flex-wrap"
                >
                  <span
                    *ngIf="showWouldExceedBadge(item)"
                    class="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/40"
                  >
                    <span aria-hidden="true">⚠️</span> Pushes over Na limit
                  </span>
                  <span
                    *ngFor="let tag of item.tags"
                    class="text-[10px] px-1.5 py-0.5 rounded font-medium border"
                    [ngClass]="getTagClass(tag)"
                  >
                    {{ tag }}
                  </span>
                  <span
                    *ngIf="item.allergens && item.allergens.length > 0"
                    class="text-[10px] px-1.5 py-0.5 rounded font-medium bg-rose-950/30 text-rose-300 border border-rose-800/40"
                  >
                    Contains: {{ item.allergens.join(', ') }}
                  </span>
                </div>
              </div>

              <!-- Action: 1-Click Add or Live Quantity Stepper -->
              <div class="shrink-0 flex items-center gap-2">
                <ng-container *ngIf="cartService.getItemQty(item.id) as activeQty; else addButtonTpl">
                  <div class="flex items-center gap-1 bg-[#00274C]/80 border border-[#FFCB05]/60 rounded-lg p-1">
                    <button
                      type="button"
                      (click)="cartService.updateQty(item.id, -1)"
                      [attr.aria-label]="'Decrease ' + item.name + ' by 1 serving'"
                      class="w-7 h-7 rounded bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition flex items-center justify-center"
                    >
                      &minus;
                    </button>
                    <span class="px-2 text-center font-mono text-xs font-bold text-[#FFCB05]">
                      {{ activeQty }}x
                    </span>
                    <button
                      type="button"
                      (click)="cartService.updateQty(item.id, 1)"
                      [attr.aria-label]="'Increase ' + item.name + ' by 1 serving'"
                      class="w-7 h-7 rounded bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition flex items-center justify-center"
                    >
                      +
                    </button>
                  </div>
                </ng-container>
                <ng-template #addButtonTpl>
                  <button
                    type="button"
                    (click)="addToTray(item)"
                    [attr.aria-label]="'Add ' + item.name + ' to tray'"
                    class="w-full sm:w-auto px-3.5 py-2 min-h-[34px] rounded-lg bg-slate-800 border border-slate-700 hover:border-[#FFCB05] hover:bg-[#00274C] hover:text-[#FFCB05] text-slate-200 text-xs font-semibold transition flex items-center justify-center gap-1 shadow-sm active:scale-95"
                  >
                    <span aria-hidden="true" class="text-base leading-none font-bold">+</span>
                    <span>Add</span>
                  </button>
                </ng-template>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </div>
  `
})
export class MenuBrowserComponent {
  @ViewChildren('periodTab') private tabButtons!: QueryList<ElementRef<HTMLButtonElement>>;

  readonly menuSync = inject(MenuSyncService);
  readonly cartService = inject(TrayCartService);
  readonly Math = Math;

  readonly tabs: { id: MealPeriod; icon: string; label: string }[] = [
    { id: 'breakfast', icon: '🍳', label: 'Breakfast' },
    { id: 'lunch', icon: '🥪', label: 'Lunch / Brunch' },
    { id: 'dinner', icon: '🍽️', label: 'Dinner' },
    { id: 'salad', icon: '🥗', label: 'Salad & Custom' }
  ];

  readonly sortOptions: { value: MenuSortOption; label: string }[] = [
    { value: 'station', label: 'Station (Default)' },
    { value: 'sodium-asc', label: 'Lowest Sodium' },
    { value: 'sodium-desc', label: 'Highest Sodium' },
    { value: 'protein-desc', label: 'Highest Protein' },
    { value: 'calories-asc', label: 'Lowest Calories' }
  ];

  setPeriod(period: MealPeriod): void {
    this.menuSync.setMealPeriod(period);
  }

  getPeriodCount(period: MealPeriod): number {
    if (period === 'salad') return 0;
    return this.menuSync.mealPeriodCounts()[period];
  }

  showWouldExceedBadge(item: MenuItem): boolean {
    return (
      this.cartService.cartCount() > 0 &&
      this.cartService.remainingSodium() >= 0 &&
      this.cartService.wouldExceedSodiumLimit(item.sodium_mg)
    );
  }

  onTabKeydown(event: KeyboardEvent, index: number): void {
    const count = this.tabs.length;
    let nextIdx = -1;
    if (event.key === 'ArrowRight') {
      nextIdx = (index + 1) % count;
    } else if (event.key === 'ArrowLeft') {
      nextIdx = (index - 1 + count) % count;
    } else if (event.key === 'Home') {
      nextIdx = 0;
    } else if (event.key === 'End') {
      nextIdx = count - 1;
    }

    if (nextIdx !== -1) {
      event.preventDefault();
      this.setPeriod(this.tabs[nextIdx].id);
      const btns = this.tabButtons?.toArray();
      btns?.[nextIdx]?.nativeElement.focus();
    }
  }

  onSearchChange(query: string): void {
    this.menuSync.setSearchQuery(query);
  }

  clearSearch(): void {
    this.menuSync.setSearchQuery('');
  }

  onSortChange(sort: MenuSortOption): void {
    this.menuSync.setSortBy(sort);
  }

  setTag(tag: string): void {
    this.menuSync.setSelectedTag(tag);
  }

  isAllergenExcluded(allergen: string): boolean {
    return this.menuSync.excludedAllergens().includes(allergen);
  }

  resetFilters(): void {
    this.menuSync.resetAllFilters();
  }

  addToTray(item: MenuItem): void {
    this.cartService.addItem(item, 1.0);
  }

  trackByStation(_index: number, group: { station: string }): string {
    return group.station;
  }

  trackByItemId(_index: number, item: MenuItem): string {
    return item.id;
  }

  getTagClass(tag: string): string {
    const t = tag.toLowerCase();
    if (t.includes('vegan')) return 'bg-emerald-950/40 text-emerald-300 border-emerald-800/40';
    if (t.includes('vegetarian')) return 'bg-green-950/40 text-green-300 border-green-800/40';
    if (t.includes('halal')) return 'bg-purple-950/40 text-purple-300 border-purple-800/40';
    if (t.includes('gluten')) return 'bg-amber-950/40 text-amber-300 border-amber-800/40';
    return 'bg-slate-800 text-slate-300 border-slate-700';
  }
}
