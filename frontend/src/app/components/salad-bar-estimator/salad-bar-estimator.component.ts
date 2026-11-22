import { Component, inject, signal, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TrayCartService } from '../../services/tray-cart.service';
import { SALAD_PRESETS, SaladPreset, MenuItem } from '../../models/nutrition.model';

@Component({
  selector: 'app-salad-bar-estimator',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div
      role="tabpanel"
      aria-labelledby="meal-tab-salad"
      class="space-y-6"
    >
      <!-- Section Header -->
      <div class="p-4 bg-slate-900 border border-slate-800 rounded-xl">
        <h2 class="text-sm font-bold text-white font-display flex items-center gap-2">
          <span aria-hidden="true">🥗</span>
          <span>Salad Bar &amp; Custom Portion Estimator</span>
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
            <div class="space-y-2">
              <div class="flex items-start justify-between gap-2">
                <h4 class="text-xs font-bold text-white font-display leading-tight">{{ preset.name }}</h4>
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono shrink-0">
                  {{ preset.servingSize }}
                </span>
              </div>
              <div class="flex items-center gap-2 text-[11px] font-mono text-slate-400 flex-wrap">
                <span class="text-white font-semibold">{{ preset.calories }} kcal</span>
                <span aria-hidden="true">•</span>
                <span class="text-emerald-400 font-semibold">{{ preset.sodium_mg }}mg Na</span>
                <span aria-hidden="true">•</span>
                <span class="text-sky-300">{{ preset.protein_g }}g Pro</span>
              </div>
              <div *ngIf="preset.allergens && preset.allergens.length > 0" class="text-[10px] text-rose-300 font-medium">
                Contains: {{ preset.allergens.join(', ') }}
              </div>
            </div>

            <button
              type="button"
              (click)="addPreset(preset)"
              [attr.aria-label]="'Add Scoop: ' + preset.name"
              class="w-full py-2 px-3 min-h-[34px] rounded-lg bg-slate-800 hover:bg-[#00274C] text-slate-200 hover:text-[#FFCB05] border border-slate-700 hover:border-[#FFCB05] text-xs font-semibold transition flex items-center justify-center gap-1.5 active:scale-95"
            >
              <span aria-hidden="true">+</span>
              <span>Add Scoop</span>
              <span
                *ngIf="cartService.getItemQty(getPresetId(preset)) as presetQty"
                class="ml-1 px-1.5 py-0.5 rounded bg-[#FFCB05] text-slate-950 font-mono text-[10px] font-bold"
              >
                {{ presetQty }}x
              </span>
            </button>
          </div>
        </div>
      </div>

      <!-- Custom Food Form -->
      <div class="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-4">
        <div class="border-b border-slate-800 pb-3">
          <h3 id="custom-item-form-heading" class="text-xs font-bold text-[#FFCB05] uppercase tracking-wider">
            Custom Item Estimator
          </h3>
          <p class="text-[11px] text-slate-400 mt-0.5">
            Logging a snack, protein shake, or off-menu item? Enter its nutrition label values below.
          </p>
        </div>

        <form
          [formGroup]="customForm"
          (ngSubmit)="onSubmitCustom()"
          aria-labelledby="custom-item-form-heading"
          novalidate
          class="space-y-4"
        >
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="space-y-1">
              <label for="custom-name" class="block text-[11px] font-medium text-slate-300">
                Item Name <span aria-hidden="true" class="text-rose-400">*</span>
              </label>
              <input
                #nameInput
                id="custom-name"
                name="customName"
                type="text"
                formControlName="name"
                required
                minlength="2"
                maxlength="100"
                (blur)="onNameBlur()"
                (input)="onNameInput()"
                [attr.aria-invalid]="nameErrorVisible() ? 'true' : null"
                [attr.aria-describedby]="nameErrorVisible() ? 'custom-name-error' : null"
                placeholder="e.g. Fairlife Core Power Shake"
                class="w-full px-3 py-2 min-h-[36px] bg-slate-950 border rounded-lg text-xs text-white transition"
                [ngClass]="nameErrorVisible() ? 'border-rose-500' : 'border-slate-800'"
              />
              <p
                *ngIf="nameErrorVisible()"
                id="custom-name-error"
                class="text-[11px] text-rose-400 font-medium"
              >
                Please enter a food name (at least 2 characters).
              </p>
            </div>

            <div class="space-y-1">
              <label for="custom-serving-size" class="block text-[11px] font-medium text-slate-300">
                Serving Size
              </label>
              <input
                id="custom-serving-size"
                name="customServingSize"
                type="text"
                formControlName="servingSize"
                maxlength="50"
                placeholder="e.g. 1 Bottle (414ml) or 1 Scoop"
                class="w-full px-3 py-2 min-h-[36px] bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div class="space-y-1">
              <label for="custom-calories" class="block text-[10px] text-slate-300">
                Calories (kcal) <span aria-hidden="true" class="text-rose-400">*</span>
              </label>
              <input
                #caloriesInput
                id="custom-calories"
                name="calories"
                type="number"
                formControlName="calories"
                required
                min="0"
                max="10000"
                class="w-full px-2.5 py-2 min-h-[36px] bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
              />
            </div>

            <div class="space-y-1">
              <label for="custom-sodium" class="block text-[10px] text-rose-300 font-semibold">
                Sodium (mg) <span aria-hidden="true">*</span>
              </label>
              <input
                #sodiumInput
                id="custom-sodium"
                name="sodium_mg"
                type="number"
                formControlName="sodium_mg"
                required
                min="0"
                max="25000"
                class="w-full px-2.5 py-2 min-h-[36px] bg-slate-950 border border-rose-900/50 rounded-lg text-white font-mono"
              />
            </div>

            <div class="space-y-1">
              <label for="custom-protein" class="block text-[10px] text-slate-300">Protein (g)</label>
              <input
                id="custom-protein"
                name="protein_g"
                type="number"
                formControlName="protein_g"
                min="0"
                max="1000"
                class="w-full px-2.5 py-2 min-h-[36px] bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
              />
            </div>

            <div class="space-y-1">
              <label for="custom-carbs" class="block text-[10px] text-slate-300">Carbs (g)</label>
              <input
                id="custom-carbs"
                name="carbs_g"
                type="number"
                formControlName="carbs_g"
                min="0"
                max="1000"
                class="w-full px-2.5 py-2 min-h-[36px] bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
              />
            </div>

            <div class="space-y-1">
              <label for="custom-fat" class="block text-[10px] text-slate-300">Total Fat (g)</label>
              <input
                id="custom-fat"
                name="fat_g"
                type="number"
                formControlName="fat_g"
                min="0"
                max="1000"
                class="w-full px-2.5 py-2 min-h-[36px] bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
              />
            </div>

            <div class="space-y-1">
              <label for="custom-satfat" class="block text-[10px] text-slate-300">Sat Fat (g)</label>
              <input
                id="custom-satfat"
                name="satFat_g"
                type="number"
                formControlName="satFat_g"
                min="0"
                max="500"
                class="w-full px-2.5 py-2 min-h-[36px] bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
              />
            </div>

            <div class="space-y-1">
              <label for="custom-sugar" class="block text-[10px] text-slate-300">Sugars (g)</label>
              <input
                id="custom-sugar"
                name="sugar_g"
                type="number"
                formControlName="sugar_g"
                min="0"
                max="1000"
                class="w-full px-2.5 py-2 min-h-[36px] bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
              />
            </div>

            <div class="space-y-1">
              <label for="custom-fiber" class="block text-[10px] text-slate-300">Dietary Fiber (g)</label>
              <input
                id="custom-fiber"
                name="fiber_g"
                type="number"
                formControlName="fiber_g"
                min="0"
                max="500"
                class="w-full px-2.5 py-2 min-h-[36px] bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
              />
            </div>
          </div>

          <div class="flex items-center justify-between gap-3 pt-2 flex-wrap">
            <div role="status" aria-live="polite" class="text-xs text-emerald-400 font-medium min-h-[18px]">
              {{ statusAnnouncement() }}
            </div>

            <button
              type="submit"
              class="px-4 py-2 min-h-[38px] rounded-lg bg-[#FFCB05] text-slate-950 font-bold hover:bg-amber-400 transition text-xs active:scale-95 shadow-sm"
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
  @ViewChild('nameInput') private nameInput?: ElementRef<HTMLInputElement>;
  @ViewChild('caloriesInput') private caloriesInput?: ElementRef<HTMLInputElement>;
  @ViewChild('sodiumInput') private sodiumInput?: ElementRef<HTMLInputElement>;

  private readonly fb = inject(FormBuilder);
  readonly cartService = inject(TrayCartService);

  readonly presets = SALAD_PRESETS;
  readonly nameErrorVisible = signal<boolean>(false);
  readonly statusAnnouncement = signal<string>('');

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

  getPresetId(preset: SaladPreset): string {
    return `sc-preset-${preset.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  }

  addPreset(preset: SaladPreset): void {
    const item: MenuItem = {
      id: this.getPresetId(preset),
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
      tags: preset.tags || [],
      allergens: preset.allergens || []
    };
    this.cartService.addItem(item, 1.0);
  }

  onNameBlur(): void {
    const ctrl = this.customForm.controls.name;
    if (ctrl.dirty && ctrl.invalid) {
      this.nameErrorVisible.set(true);
    }
  }

  onNameInput(): void {
    if (this.nameErrorVisible() && this.customForm.controls.name.valid) {
      this.nameErrorVisible.set(false);
    }
  }

  onSubmitCustom(): void {
    if (this.customForm.invalid) {
      this.customForm.markAllAsTouched();
      if (this.customForm.controls.name.invalid) {
        this.nameErrorVisible.set(true);
        this.nameInput?.nativeElement.focus();
      } else if (this.customForm.controls.calories.invalid) {
        this.caloriesInput?.nativeElement.focus();
      } else if (this.customForm.controls.sodium_mg.invalid) {
        this.sodiumInput?.nativeElement.focus();
      }
      return;
    }

    const v = this.customForm.value;
    const sanitizeNum = (val: unknown, max = 10000): number => {
      const n = Number(val);
      if (Number.isNaN(n) || !Number.isFinite(n) || n < 0) return 0;
      return Math.min(n, max);
    };

    const cleanName = (v.name || 'Custom Food Item').trim().slice(0, 100);
    const item: MenuItem = {
      id: `sc-custom-${Date.now()}`,
      name: cleanName,
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
      tags: ['Custom'],
      allergens: []
    };

    this.cartService.addItem(item, 1.0);
    this.nameErrorVisible.set(false);
    this.statusAnnouncement.set(`Added "${cleanName}" to your Daily Food Tray.`);

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
