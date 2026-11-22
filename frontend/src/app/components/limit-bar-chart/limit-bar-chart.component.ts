import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TrayCartService } from '../../services/tray-cart.service';
import {
  PercentDailyValue,
  BENCHMARK_PROFILES,
  BenchmarkProfileId,
  CustomNutrientTargets
} from '../../models/nutrition.model';

interface CustomTargetField {
  key: keyof CustomNutrientTargets;
  label: string;
  unit: string;
}

@Component({
  selector: 'app-limit-bar-chart',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section [attr.aria-labelledby]="titleId" class="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 shadow-lg">
      <!-- Compact Header + 1-Click Profile Switcher Pills -->
      <div class="space-y-1.5">
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <h2 [id]="titleId" class="text-sm font-bold text-white font-display flex items-center gap-1.5">
            <span aria-hidden="true">🎯</span>
            <span>Live Daily Limits</span>
          </h2>

          <div class="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 flex-wrap" role="group" aria-label="Dietary benchmark profile">
            <button
              *ngFor="let p of profilePills"
              type="button"
              [attr.aria-pressed]="cartService.activeProfileId() === p.id"
              (click)="onProfileChange(p.id)"
              class="px-2 py-1 min-h-[26px] rounded-md text-[10px] font-bold transition whitespace-nowrap"
              [ngClass]="{
                'bg-[#FFCB05] text-slate-950 shadow-sm': cartService.activeProfileId() === p.id,
                'text-slate-400 hover:text-white': cartService.activeProfileId() !== p.id
              }"
            >
              {{ p.short }}
            </button>
          </div>
        </div>

        <!-- Clear Active Profile & Wolverine 2.5k Explanation -->
        <div class="flex items-start justify-between gap-2 text-[11px] text-slate-400 leading-snug bg-slate-950/60 border border-slate-800/70 rounded-lg px-2.5 py-1.5">
          <span>
            {{ cartService.activeProfile().description }}
            <span *ngIf="cartService.activeProfileId() === 'fda-standard'" class="text-slate-500">
              (<strong>Wolverine 2.5k</strong> = 2,500 kcal / 140g protein gym &amp; athlete preset.)
            </span>
          </span>
          <button
            *ngIf="cartService.activeProfileId() === 'custom'"
            type="button"
            (click)="isEditingCustom.set(!isEditingCustom())"
            class="text-[11px] text-[#FFCB05] hover:underline font-semibold shrink-0"
          >
            {{ isEditingCustom() ? 'Done' : 'Edit' }}
          </button>
        </div>
      </div>

      <!-- Custom Daily Targets Customizer (Active when 'Custom' profile is selected) -->
      <fieldset
        *ngIf="cartService.activeProfileId() === 'custom' && isEditingCustom()"
        class="p-3 rounded-xl bg-slate-950 border border-[#FFCB05]/40 space-y-2.5 m-0"
      >
        <legend class="px-1.5 text-[11px] font-bold text-[#FFCB05] uppercase tracking-wider">
          Customize Daily Targets
        </legend>

        <div class="grid grid-cols-3 gap-2">
          <div *ngFor="let field of customFields" class="space-y-0.5">
            <label [for]="titleId + '-custom-' + field.key" class="block text-[10px] text-slate-300 truncate">
              {{ field.label }} ({{ field.unit }})
            </label>
            <input
              [id]="titleId + '-custom-' + field.key"
              [name]="'custom_' + field.key"
              type="number"
              min="1"
              max="50000"
              [value]="cartService.customTargets()[field.key]"
              (input)="onCustomTargetInput(field.key, $event)"
              (blur)="onCustomTargetBlur(field.key, $event)"
              class="w-full px-2 py-1 min-h-[30px] bg-slate-900 border border-slate-700 rounded-md text-xs text-white font-mono"
            />
          </div>
        </div>

        <div class="flex items-center justify-between pt-1">
          <button
            type="button"
            (click)="cartService.resetCustomTargets()"
            class="text-[11px] text-slate-400 hover:text-white underline transition"
          >
            Reset defaults
          </button>
          <button
            type="button"
            (click)="isEditingCustom.set(false)"
            class="px-2.5 py-1 min-h-[26px] rounded-md bg-[#FFCB05] text-slate-950 text-[11px] font-bold"
          >
            Save &amp; Hide
          </button>
        </div>
      </fieldset>

      <!-- Hero Sodium Remaining Budget Meter -->
      <div
        class="p-3 rounded-xl border bg-slate-950 space-y-2 transition"
        [ngClass]="{
          'border-rose-500/60 bg-rose-950/15': cartService.sodiumAlertState() === 'exceeded',
          'border-amber-500/50': cartService.sodiumAlertState() === 'warning',
          'border-slate-800': cartService.sodiumAlertState() === 'ok'
        }"
      >
        <div class="flex items-baseline justify-between gap-2 flex-wrap">
          <div>
            <div class="text-[10px] uppercase tracking-wider font-bold text-slate-400">Daily Sodium Budget</div>
            <div
              class="text-base font-extrabold font-mono mt-0.5"
              [ngClass]="{
                'text-rose-400': cartService.remainingSodium() < 0,
                'text-amber-300': cartService.remainingSodium() >= 0 && cartService.sodiumAlertState() === 'warning',
                'text-emerald-400': cartService.remainingSodium() >= 0 && cartService.sodiumAlertState() === 'ok'
              }"
            >
              <ng-container *ngIf="cartService.remainingSodium() >= 0; else overBudgetTpl">
                {{ cartService.remainingSodium() | number }} mg left
              </ng-container>
              <ng-template #overBudgetTpl>
                {{ Math.abs(cartService.remainingSodium()) | number }} mg OVER LIMIT
              </ng-template>
            </div>
          </div>

          <div class="text-right font-mono">
            <div class="text-xs font-bold text-white">
              {{ cartService.totalNutrients().sodium_mg.toFixed(0) }} / {{ cartService.sodiumLimit() | number }} mg
            </div>
            <div class="text-[11px] text-slate-400">{{ cartService.sodiumPercent() }}% of ceiling</div>
          </div>
        </div>

        <div class="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800" aria-hidden="true">
          <div
            class="h-full rounded-full transition-all duration-300"
            [style.width.%]="Math.min(100, cartService.sodiumPercent())"
            [ngClass]="{
              'bg-rose-500': cartService.sodiumAlertState() === 'exceeded',
              'bg-amber-400': cartService.sodiumAlertState() === 'warning',
              'bg-emerald-500': cartService.sodiumAlertState() === 'ok'
            }"
          ></div>
        </div>
      </div>

      <!-- Instant 1-Click Top Offender Quick-Fix Alert -->
      <div
        *ngIf="cartService.topOffenders().length > 0"
        class="p-2.5 rounded-xl border bg-slate-950/90 space-y-2"
        [ngClass]="{
          'border-rose-500/50': cartService.sodiumAlertState() === 'exceeded',
          'border-amber-500/40': cartService.sodiumAlertState() !== 'exceeded'
        }"
      >
        <div
          *ngFor="let offender of cartService.topOffenders().slice(0, 2)"
          class="flex items-center justify-between gap-2 text-xs"
        >
          <div class="min-w-0">
            <div class="text-[10px] font-bold uppercase tracking-wide text-rose-300">
              <span aria-hidden="true">⚠️</span> #1 {{ offender.metricLabel }} ({{ offender.amountContributed }}{{ getUnit(offender.metricKey) }})
            </div>
            <p class="font-semibold text-slate-100 truncate font-display text-xs">{{ offender.itemName }}</p>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button
              *ngIf="cartService.getItemQty(offender.itemId) > 1"
              type="button"
              (click)="cartService.updateQty(offender.itemId, -1)"
              [attr.aria-label]="'Reduce ' + offender.itemName + ' by 1 serving'"
              class="px-2 py-1 min-h-[26px] rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-mono font-bold transition"
            >
              &minus;1x
            </button>
            <button
              type="button"
              (click)="cartService.removeItem(offender.itemId)"
              [attr.aria-label]="'Remove ' + offender.itemName + ' from tray'"
              class="px-2 py-1 min-h-[26px] rounded bg-rose-950/70 hover:bg-rose-900 text-rose-200 border border-rose-700/50 text-[10px] font-bold transition"
            >
              Remove
            </button>
          </div>
        </div>
      </div>

      <!-- Always-Visible Key 4 Macro Mini-Bars (Calories, Protein, Carbs, Sugars/SatFat) -->
      <div class="grid grid-cols-2 gap-2">
        <div
          *ngFor="let metric of keyMetrics(); trackBy: trackByMetricKey"
          class="p-2.5 rounded-lg bg-slate-950 border border-slate-800/90 space-y-1.5"
        >
          <div class="flex items-center justify-between gap-1 text-[11px]">
            <span class="text-slate-300 font-semibold truncate">{{ metric.label }}</span>
            <span
              class="font-mono font-bold text-[11px]"
              [ngClass]="{
                'text-rose-400': metric.isCeiling && metric.percent >= 100,
                'text-amber-400': metric.isCeiling && metric.percent >= 80 && metric.percent < 100,
                'text-emerald-400': !metric.isCeiling && metric.percent >= 100,
                'text-slate-200': metric.percent < 80
              }"
            >
              {{ metric.percent }}%
            </span>
          </div>
          <div class="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden" aria-hidden="true">
            <div
              class="h-full rounded-full transition-all duration-300"
              [style.width.%]="Math.min(100, metric.percent)"
              [ngClass]="getBarColor(metric)"
            ></div>
          </div>
          <div class="text-[10px] font-mono text-slate-400 truncate">
            {{ metric.value }} / {{ metric.limit }} {{ metric.unit }}
          </div>
        </div>
      </div>

      <!-- On-Demand Full 9-Nutrient Chart & Accessible Data Table (<details> disclosure) -->
      <details class="group rounded-xl bg-slate-950/60 border border-slate-800/80 overflow-hidden">
        <summary class="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-slate-300 hover:text-[#FFCB05] flex items-center justify-between select-none">
          <span>All 9 Nutrients (Carbs, Fiber, Fats) &amp; Table</span>
          <span aria-hidden="true" class="text-[10px] font-mono text-slate-400 group-open:rotate-180 transition-transform">&#9660;</span>
        </summary>

        <div class="p-3 pt-2 border-t border-slate-800/80 space-y-3">
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-900 text-slate-400 border border-slate-800 font-mono">
              <span aria-hidden="true">⚡</span> {{ cartService.engineMode() }}
            </span>

            <div class="flex items-center gap-1 p-0.5 bg-slate-900 border border-slate-800 rounded-lg" role="group" aria-label="Full chart display mode">
              <button
                type="button"
                [attr.aria-pressed]="viewMode() === 'bars'"
                (click)="viewMode.set('bars')"
                class="px-2 py-1 min-h-[26px] rounded text-[10px] font-semibold transition"
                [ngClass]="{
                  'bg-[#FFCB05] text-slate-950 font-bold': viewMode() === 'bars',
                  'text-slate-400 hover:text-white': viewMode() !== 'bars'
                }"
              >
                %DV Bars
              </button>
              <button
                type="button"
                [attr.aria-pressed]="viewMode() === 'table'"
                (click)="viewMode.set('table')"
                class="px-2 py-1 min-h-[26px] rounded text-[10px] font-semibold transition"
                [ngClass]="{
                  'bg-[#FFCB05] text-slate-950 font-bold': viewMode() === 'table',
                  'text-slate-400 hover:text-white': viewMode() !== 'table'
                }"
              >
                Data Table
              </button>
            </div>
          </div>

          <!-- Compact Horizontal All-9 %DV Bars -->
          <figure *ngIf="viewMode() === 'bars'" class="space-y-2 m-0">
            <div
              *ngFor="let metric of cartService.percentDailyValues(); trackBy: trackByMetricKey"
              class="space-y-1"
            >
              <div class="flex items-center justify-between text-[11px] font-mono">
                <span class="text-slate-200 font-sans font-medium">
                  {{ metric.label }}
                  <span class="text-[10px] text-slate-500">({{ metric.isCeiling ? 'max' : 'goal' }})</span>
                </span>
                <span class="text-slate-300">
                  {{ metric.value }}/{{ metric.limit }}{{ metric.unit }}
                  <strong
                    class="ml-1"
                    [ngClass]="{
                      'text-rose-400': metric.isCeiling && metric.percent >= 100,
                      'text-amber-400': metric.isCeiling && metric.percent >= 80 && metric.percent < 100,
                      'text-emerald-400': !metric.isCeiling && metric.percent >= 100,
                      'text-slate-200': metric.percent < 80
                    }"
                  >
                    ({{ metric.percent }}%)
                  </strong>
                </span>
              </div>
              <div class="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden" aria-hidden="true">
                <div
                  class="h-full rounded-full transition-all duration-300"
                  [style.width.%]="Math.min(100, metric.percent)"
                  [ngClass]="getBarColor(metric)"
                ></div>
              </div>
            </div>
            <figcaption class="text-[10px] text-slate-500 pt-1">
              {{ cartService.activeProfile().label }}
            </figcaption>
          </figure>

          <!-- Accessible Semantic Data Table View -->
          <div *ngIf="viewMode() === 'table'" class="overflow-x-auto sc-scroller rounded-lg border border-slate-800 bg-slate-950">
            <table class="w-full text-left text-[11px] border-collapse">
              <caption class="visually-hidden">
                Nutrient intake and percent daily value breakdown for {{ cartService.activeProfile().label }}
              </caption>
              <thead>
                <tr class="border-b border-slate-800 bg-slate-900/80 text-slate-300 font-semibold">
                  <th scope="col" class="py-2 px-2.5">Nutrient</th>
                  <th scope="col" class="py-2 px-2.5 font-mono">Amount</th>
                  <th scope="col" class="py-2 px-2.5 font-mono">Limit</th>
                  <th scope="col" class="py-2 px-2.5 font-mono text-right">%DV</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/70">
                <tr *ngFor="let metric of cartService.percentDailyValues(); trackBy: trackByMetricKey">
                  <th scope="row" class="py-1.5 px-2.5 font-semibold text-white">{{ metric.label }}</th>
                  <td class="py-1.5 px-2.5 font-mono text-slate-200">{{ metric.value }} {{ metric.unit }}</td>
                  <td class="py-1.5 px-2.5 font-mono text-slate-400">{{ metric.limit }} {{ metric.unit }}</td>
                  <td class="py-1.5 px-2.5 font-mono font-bold text-right" [ngClass]="getStatusTextClass(metric)">
                    {{ metric.percent }}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </section>
  `
})
export class LimitBarChartComponent {
  private static nextInstanceId = 1;
  readonly titleId = `daily-limits-title-${LimitBarChartComponent.nextInstanceId++}`;

  readonly cartService = inject(TrayCartService);
  readonly Math = Math;
  readonly viewMode = signal<'bars' | 'table'>('bars');
  readonly isEditingCustom = signal<boolean>(false);
  readonly profiles = BENCHMARK_PROFILES;

  readonly profilePills: { id: BenchmarkProfileId; short: string }[] = [
    { id: 'fda-standard', short: 'FDA 2k' },
    { id: 'active-wolverine', short: 'Wolverine 2.5k' },
    { id: 'low-sodium-heart', short: 'Heart 1.8k' },
    { id: 'custom', short: 'Custom' }
  ];

  readonly customFields: CustomTargetField[] = [
    { key: 'calories', label: 'Calories', unit: 'kcal' },
    { key: 'sodium_mg', label: 'Sodium Max', unit: 'mg' },
    { key: 'protein_g', label: 'Protein', unit: 'g' },
    { key: 'carbs_g', label: 'Carbs', unit: 'g' },
    { key: 'fat_g', label: 'Total Fat', unit: 'g' },
    { key: 'satFat_g', label: 'Sat Fat', unit: 'g' },
    { key: 'sugar_g', label: 'Sugars', unit: 'g' },
    { key: 'fiber_g', label: 'Fiber', unit: 'g' },
    { key: 'cholesterol_mg', label: 'Cholesterol', unit: 'mg' }
  ];

  readonly keyMetrics = computed<PercentDailyValue[]>(() => {
    const keys = new Set(['calories', 'protein_g', 'carbs_g', 'satFat_g']);
    return this.cartService.percentDailyValues().filter((m) => keys.has(m.key));
  });

  onProfileChange(profileId: BenchmarkProfileId): void {
    this.cartService.setProfile(profileId);
    if (profileId === 'custom') {
      this.isEditingCustom.set(true);
    }
  }

  onCustomTargetInput(key: keyof CustomNutrientTargets, event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    if (!raw) return;
    const val = Number(raw);
    if (Number.isFinite(val) && val >= 1) {
      this.cartService.updateCustomTarget(key, val);
    }
  }

  onCustomTargetBlur(key: keyof CustomNutrientTargets, event: Event): void {
    const input = event.target as HTMLInputElement;
    const val = Number(input.value);
    if (!Number.isFinite(val) || val < 1) {
      input.value = String(this.cartService.customTargets()[key]);
    } else {
      this.cartService.updateCustomTarget(key, val);
      input.value = String(this.cartService.customTargets()[key]);
    }
  }

  trackByMetricKey(_index: number, metric: PercentDailyValue): string {
    return metric.key;
  }

  getBarColor(metric: PercentDailyValue): string {
    if (metric.isCeiling) {
      if (metric.percent >= 100) return 'bg-rose-500';
      if (metric.percent >= 80) return 'bg-amber-400';
      return 'bg-emerald-500';
    }
    if (metric.percent >= 100) return 'bg-emerald-400';
    return 'bg-sky-500';
  }

  getStatusTextClass(metric: PercentDailyValue): string {
    if (metric.status === 'exceeded') return 'text-rose-400';
    if (metric.status === 'warning') return 'text-amber-400';
    if (metric.status === 'achieved') return 'text-emerald-400';
    return 'text-slate-300';
  }

  getUnit(metricKey: string): string {
    if (metricKey.includes('_mg')) return 'mg';
    if (metricKey.includes('calories')) return 'kcal';
    return 'g';
  }
}
