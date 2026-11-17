import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TrayCartService } from '../../services/tray-cart.service';
import { SALAD_PRESETS, SaladPreset, MenuItem } from '../../models/nutrition.model';

@Component({
  selector: 'app-salad-bar-estimator',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="space-y-6">
      <!-- Section Header -->
      <div class="p-4 bg-slate-900 border border-slate-800 rounded-xl">
        <h2 class="text-sm font-bold text-white font-display flex items-center gap-2">
          <span>🥗 Salad Bar &amp; Custom Portion Estimator</span>
        </h2>
        <p class="text-xs text-slate-400 mt-1">
          Dining hall salad bars and custom stations don't always have printed nutrition barcodes. Use verified University of Michigan scoop heuristics or enter custom items below.
        </p>
      </div>

      <!-- 1-Click Scoop Presets -->
      <div class="space-y-3">
        <h3 class="text-xs font-bold text-[#FFCB05] uppercase tracking-wider">
          1-Click Dining Hall Scoop Presets
        </h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div
            *ngFor="let preset of presets"
            class="p-3.5 bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl flex flex-col justify-between gap-3 transition"
          >
            <div>
              <div class="flex items-start justify-between gap-2">
                <h4 class="text-xs font-bold text-white font-display leading-tight">{{ preset.name }}</h4>
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono shrink-0">
                  {{ preset.servingSize }}
                </span>
              </div>
              <div class="mt-2 flex items-center gap-2 text-[11px] font-mono text-slate-400 flex-wrap">
                <span class="text-white font-semibold">{{ preset.calories }} kcal</span>
                <span>•</span>
                <span class="text-emerald-400 font-semibold">{{ preset.sodium_mg }}mg Na</span>
                <span>•</span>
                <span class="text-sky-300">{{ preset.protein_g }}g Pro</span>
              </div>
            </div>

            <button
              (click)="addPreset(preset)"
              class="w-full py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-[#00274C] text-slate-200 hover:text-[#FFCB05] border border-slate-700 hover:border-[#FFCB05] text-xs font-semibold transition flex items-center justify-center gap-1.5 active:scale-95"
            >
              <span>+ Add Scoop</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Custom Food Form -->
      <div class="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-4">
        <div class="border-b border-slate-800 pb-3">
          <h3 class="text-xs font-bold text-[#FFCB05] uppercase tracking-wider">
            Custom Item Estimator
          </h3>
          <p class="text-[11px] text-slate-400 mt-0.5">
            Logging a snack, protein shake, or special food item? Enter its nutrition label values here.
          </p>
        </div>

        <form [formGroup]="customForm" (ngSubmit)="onSubmitCustom()" class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-[11px] font-medium text-slate-300 mb-1">Item Name *</label>
              <input
                type="text"
                formControlName="name"
                placeholder="e.g. Fairlife Core Power Chocolate Shake"
                class="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-[#FFCB05]"
              />
            </div>
            <div>
              <label class="block text-[11px] font-medium text-slate-300 mb-1">Serving Size</label>
              <input
                type="text"
                formControlName="servingSize"
                placeholder="e.g. 1 Bottle (414ml) or 1 Scoop"
                class="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-[#FFCB05]"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label class="block text-[10px] text-slate-400 mb-1">Calories (kcal) *</label>
              <input
                type="number"
                formControlName="calories"
                min="0"
                class="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
              />
            </div>
            <div>
              <label class="block text-[10px] text-rose-300 font-semibold mb-1">Sodium (mg) *</label>
              <input
                type="number"
                formControlName="sodium_mg"
                min="0"
                class="w-full px-2.5 py-1.5 bg-slate-950 border border-rose-900/50 rounded-lg text-white font-mono"
              />
            </div>
            <div>
              <label class="block text-[10px] text-slate-400 mb-1">Protein (g)</label>
              <input
                type="number"
                formControlName="protein_g"
                min="0"
                class="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
              />
            </div>
            <div>
              <label class="block text-[10px] text-slate-400 mb-1">Carbs (g)</label>
              <input
                type="number"
                formControlName="carbs_g"
                min="0"
                class="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
              />
            </div>
            <div>
              <label class="block text-[10px] text-slate-400 mb-1">Total Fat (g)</label>
              <input
                type="number"
                formControlName="fat_g"
                min="0"
                class="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
              />
            </div>
            <div>
              <label class="block text-[10px] text-slate-400 mb-1">Sat Fat (g)</label>
              <input
                type="number"
                formControlName="satFat_g"
                min="0"
                class="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
              />
            </div>
            <div>
              <label class="block text-[10px] text-slate-400 mb-1">Sugars (g)</label>
              <input
                type="number"
                formControlName="sugar_g"
                min="0"
                class="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
              />
            </div>
            <div>
              <label class="block text-[10px] text-slate-400 mb-1">Dietary Fiber (g)</label>
              <input
                type="number"
                formControlName="fiber_g"
                min="0"
                class="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
              />
            </div>
          </div>

          <div class="flex justify-end pt-2">
            <button
              type="submit"
              [disabled]="customForm.invalid"
              class="px-4 py-2 rounded-lg bg-[#FFCB05] text-slate-950 font-bold hover:bg-amber-400 transition text-xs disabled:opacity-50 active:scale-95 shadow-sm"
            >
              + Add Custom Item to Food Tray
            </button>
          </div>
        </form>
      </div>
    </div>
  `
})
export class SaladBarEstimatorComponent {
  private readonly fb = inject(FormBuilder);
  readonly cartService = inject(TrayCartService);

  readonly presets = SALAD_PRESETS;

  readonly customForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    servingSize: ['1 serving', [Validators.maxLength(50)]],
    calories: [150, [Validators.required, Validators.min(0), Validators.max(10000)]],
    sodium_mg: [200, [Validators.required, Validators.min(0), Validators.max(25000)]],
    protein_g: [10, [Validators.min(0), Validators.max(1000)]],
    carbs_g: [15, [Validators.min(0), Validators.max(1000)]],
    fat_g: [5, [Validators.min(0), Validators.max(1000)]],
    satFat_g: [1, [Validators.min(0), Validators.max(500)]],
    sugar_g: [3, [Validators.min(0), Validators.max(1000)]],
    fiber_g: [2, [Validators.min(0), Validators.max(500)]]
  });

  addPreset(preset: SaladPreset): void {
    const item: MenuItem = {
      id: `sc-preset-${preset.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      name: preset.name,
      mealPeriod: 'lunch',
      station: 'Salad Bar',
      servingSize: preset.servingSize,
      calories: preset.calories,
      sodium_mg: preset.sodium_mg,
      protein_g: preset.protein_g,
      carbs_g: preset.carbs_g,
      fat_g: preset.fat_g,
      satFat_g: preset.satFat_g,
      transFat_g: 0,
      cholesterol_mg: 0,
      sugar_g: preset.sugar_g,
      fiber_g: preset.fiber_g,
      tags: preset.tags || []
    };
    this.cartService.addItem(item, 1.0);
  }

  onSubmitCustom(): void {
    if (this.customForm.invalid) return;
    const v = this.customForm.value;

    const sanitizeNum = (val: any, max = 10000): number => {
      const n = Number(val);
      if (isNaN(n) || !isFinite(n) || n < 0) return 0;
      return Math.min(n, max);
    };

    const item: MenuItem = {
      id: `sc-custom-${Date.now()}`,
      name: (v.name || 'Custom Food Item').trim().slice(0, 100),
      mealPeriod: 'lunch',
      station: 'Custom / My Foods',
      servingSize: (v.servingSize || '1 serving').trim().slice(0, 50),
      calories: sanitizeNum(v.calories, 10000),
      sodium_mg: sanitizeNum(v.sodium_mg, 25000),
      protein_g: sanitizeNum(v.protein_g, 1000),
      carbs_g: sanitizeNum(v.carbs_g, 1000),
      fat_g: sanitizeNum(v.fat_g, 1000),
      satFat_g: sanitizeNum(v.satFat_g, 500),
      transFat_g: 0,
      cholesterol_mg: 0,
      sugar_g: sanitizeNum(v.sugar_g, 1000),
      fiber_g: sanitizeNum(v.fiber_g, 500),
      tags: ['Custom']
    };

    this.cartService.addItem(item, 1.0);
    this.customForm.reset({
      name: '',
      servingSize: '1 serving',
      calories: 150,
      sodium_mg: 200,
      protein_g: 10,
      carbs_g: 15,
      fat_g: 5,
      satFat_g: 1,
      sugar_g: 3,
      fiber_g: 2
    });
  }
}
