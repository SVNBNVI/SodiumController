import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MenuSyncService } from '../../services/menu-sync.service';
import { TrayCartService } from '../../services/tray-cart.service';
import { MenuItem, MealPeriod } from '../../models/nutrition.model';

@Component({
  selector: 'app-menu-browser',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-4">
      <!-- Meal Period Tab Switcher -->
      <div class="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto scrollbar-none">
        <button
          *ngFor="let tab of tabs"
          (click)="setPeriod(tab.id)"
          class="px-4 py-2 rounded-lg text-xs font-bold transition whitespace-nowrap flex items-center gap-1.5"
          [ngClass]="{
            'bg-[#FFCB05] text-slate-950 shadow-sm shadow-amber-400/20': menuSync.selectedMealPeriod() === tab.id,
            'text-slate-400 hover:text-white hover:bg-slate-800/60': menuSync.selectedMealPeriod() !== tab.id
          }"
        >
          <span>{{ tab.label }}</span>
        </button>
      </div>

      <!-- Search & Tag Filter Bar (hidden if in salad tab) -->
      <div *ngIf="menuSync.selectedMealPeriod() !== 'salad'" class="space-y-3">
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <!-- Instant Search Input -->
          <div class="relative flex-1">
            <span class="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-500">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
              </svg>
            </span>
            <input
              type="text"
              [ngModel]="menuSync.searchQuery()"
              (ngModelChange)="onSearchChange($event)"
              placeholder="Search dishes, ingredients, or stations (e.g. Chicken, Tacos, Pizza)..."
              class="w-full pl-9 pr-8 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#FFCB05] focus:ring-1 focus:ring-[#FFCB05] transition"
            />
            <button
              *ngIf="menuSync.searchQuery()"
              (click)="clearSearch()"
              class="absolute inset-y-0 right-2.5 flex items-center text-slate-400 hover:text-white"
            >
              &times;
            </button>
          </div>

          <!-- Total Count Badge -->
          <div class="text-[11px] font-mono text-slate-400 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg shrink-0 flex items-center justify-between sm:justify-start gap-2">
            <span>Showing:</span>
            <span class="font-bold text-[#FFCB05]">{{ menuSync.filteredMenuItems().length }} dishes</span>
          </div>
        </div>

        <!-- Dietary Tag Filter Pills -->
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="text-[11px] text-slate-400 mr-1 font-medium">Dietary:</span>
          <button
            *ngFor="let tag of menuSync.availableTags"
            (click)="setTag(tag)"
            class="px-2.5 py-1 rounded-full text-[11px] font-medium transition border"
            [ngClass]="{
              'bg-[#00274C] text-[#FFCB05] border-[#FFCB05]': menuSync.selectedTag() === tag,
              'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200': menuSync.selectedTag() !== tag
            }"
          >
            {{ tag === 'all' ? 'All Diets' : tag }}
          </button>
        </div>
      </div>

      <!-- Station Grouped Dishes Listing -->
      <div *ngIf="menuSync.selectedMealPeriod() !== 'salad'" class="space-y-6">
        <!-- Empty State -->
        <div
          *ngIf="menuSync.groupedByStation().length === 0"
          class="p-8 text-center bg-slate-900/60 border border-slate-800 rounded-xl"
        >
          <p class="text-sm text-slate-400 mb-2">No dishes match your filters for this meal.</p>
          <button
            (click)="resetFilters()"
            class="text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-[#FFCB05] hover:bg-slate-700 transition"
          >
            Clear Search &amp; Filters
          </button>
        </div>

        <!-- Station Section -->
        <div
          *ngFor="let group of menuSync.groupedByStation()"
          class="bg-slate-900/70 border border-slate-800/90 rounded-xl overflow-hidden shadow-sm"
        >
          <!-- Station Header -->
          <div class="px-4 py-2.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-[#FFCB05]"></span>
              <h3 class="text-xs font-bold text-white uppercase tracking-wider">{{ group.station }}</h3>
            </div>
            <span class="text-[11px] text-slate-500 font-mono">{{ group.items.length }} items</span>
          </div>

          <!-- Dishes in this Station -->
          <div class="divide-y divide-slate-800/60">
            <div
              *ngFor="let item of group.items"
              class="p-3.5 hover:bg-slate-800/40 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <!-- Dish Details -->
              <div class="space-y-1.5 flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h4 class="text-sm font-semibold text-slate-100 font-display truncate">{{ item.name }}</h4>
                  <span class="text-[10px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 font-mono">
                    {{ item.servingSize }}
                  </span>
                </div>

                <!-- Nutrition Breakdown Badges -->
                <div class="flex items-center gap-2 flex-wrap text-[11px] font-mono">
                  <span class="text-slate-300 font-medium">
                    <strong class="text-white">{{ item.calories }}</strong> kcal
                  </span>
                  <span class="text-slate-600">•</span>
                  <span
                    class="font-semibold"
                    [ngClass]="{
                      'text-rose-400': item.sodium_mg >= 800,
                      'text-amber-400': item.sodium_mg >= 400 && item.sodium_mg < 800,
                      'text-emerald-400': item.sodium_mg < 400
                    }"
                  >
                    {{ item.sodium_mg }}mg Na
                  </span>
                  <span class="text-slate-600">•</span>
                  <span class="text-slate-400">{{ item.satFat_g }}g Sat Fat</span>
                  <span class="text-slate-600">•</span>
                  <span class="text-slate-400">{{ item.sugar_g }}g Sugar</span>
                  <span class="text-slate-600">•</span>
                  <span class="text-sky-300">{{ item.protein_g }}g Pro</span>
                </div>

                <!-- Dietary Tags -->
                <div *ngIf="item.tags && item.tags.length > 0" class="flex items-center gap-1.5 flex-wrap">
                  <span
                    *ngFor="let tag of item.tags"
                    class="text-[9px] px-1.5 py-0.2 rounded font-medium border"
                    [ngClass]="getTagClass(tag)"
                  >
                    {{ tag }}
                  </span>
                </div>
              </div>

              <!-- Action: Add to Tray -->
              <div class="shrink-0 flex items-center gap-2">
                <button
                  (click)="addToTray(item)"
                  class="w-full sm:w-auto px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 hover:border-[#FFCB05] hover:bg-[#00274C] hover:text-[#FFCB05] text-slate-200 text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
                >
                  <span class="text-base leading-none font-bold">+</span>
                  <span>Add to Tray</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
})
export class MenuBrowserComponent {
  readonly menuSync = inject(MenuSyncService);
  readonly cartService = inject(TrayCartService);

  readonly tabs: { id: MealPeriod; label: string }[] = [
    { id: 'breakfast', label: '🍳 Breakfast' },
    { id: 'lunch', label: '🥪 Lunch / Brunch' },
    { id: 'dinner', label: '🍽️ Dinner' },
    { id: 'salad', label: '🥗 Salad Bar & Custom' }
  ];

  setPeriod(period: MealPeriod): void {
    this.menuSync.setMealPeriod(period);
  }

  onSearchChange(query: string): void {
    this.menuSync.setSearchQuery(query);
  }

  clearSearch(): void {
    this.menuSync.setSearchQuery('');
  }

  setTag(tag: string): void {
    this.menuSync.setSelectedTag(tag);
  }

  resetFilters(): void {
    this.menuSync.setSearchQuery('');
    this.menuSync.setSelectedTag('all');
  }

  addToTray(item: MenuItem): void {
    this.cartService.addItem(item, 1.0);
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
