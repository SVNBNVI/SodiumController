import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TrayCartService } from '../../services/tray-cart.service';

@Component({
  selector: 'app-food-tray-cart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg sticky top-20">
      <!-- Tray Header -->
      <div class="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-base">🍱</span>
          <div>
            <h2 class="text-sm font-bold text-white font-display">Daily Food Tray</h2>
            <p class="text-[11px] text-slate-400">Items logged for today's intake</p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-slate-800 text-[#FFCB05] border border-slate-700">
            {{ cartService.cartCount() }} items
          </span>
          <button
            *ngIf="cartService.cartCount() > 0"
            (click)="clearTray()"
            class="text-[11px] text-rose-400 hover:text-rose-300 font-medium transition px-2 py-1 hover:bg-rose-950/30 rounded"
          >
            Clear
          </button>
        </div>
      </div>

      <!-- Tray Items List -->
      <div class="p-3 divide-y divide-slate-800/80 max-h-[420px] overflow-y-auto">
        <!-- Empty State -->
        <div *ngIf="cartService.cartCount() === 0" class="py-10 px-4 text-center">
          <div class="w-12 h-12 mx-auto rounded-full bg-slate-800/80 flex items-center justify-center text-xl mb-3 text-slate-500">
            🛒
          </div>
          <p class="text-xs font-medium text-slate-300">Your Food Tray is empty</p>
          <p class="text-[11px] text-slate-500 mt-1 max-w-[220px] mx-auto">
            Click <strong>+ Add to Tray</strong> on any Bursley menu dish or salad scoop to check your %DV limits.
          </p>
        </div>

        <!-- Cart Row -->
        <div
          *ngFor="let item of cartService.cart()"
          class="py-3 first:pt-1 last:pb-1 flex items-start justify-between gap-3"
        >
          <div class="flex-1 min-w-0">
            <h4 class="text-xs font-semibold text-white leading-tight truncate font-display">{{ item.name }}</h4>
            <div class="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap font-mono">
              <span>{{ item.station }}</span>
              <span>•</span>
              <span class="text-slate-300 font-semibold">{{ (item.calories * item.qty).toFixed(0) }} kcal</span>
              <span>•</span>
              <span
                class="font-semibold"
                [ngClass]="{
                  'text-rose-400': (item.sodium_mg * item.qty) >= 800,
                  'text-amber-400': (item.sodium_mg * item.qty) >= 400 && (item.sodium_mg * item.qty) < 800,
                  'text-emerald-400': (item.sodium_mg * item.qty) < 400
                }"
              >
                {{ (item.sodium_mg * item.qty).toFixed(0) }}mg Na
              </span>
            </div>
          </div>

          <!-- Quantity Stepper Controls -->
          <div class="flex items-center gap-1 shrink-0 bg-slate-950 border border-slate-800 rounded-lg p-0.5">
            <button
              (click)="updateQty(item.id, -0.5)"
              class="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition flex items-center justify-center"
              title="Decrease by 0.5x"
            >
              -
            </button>
            <span class="w-9 text-center font-mono text-[11px] font-bold text-white">
              {{ item.qty }}x
            </span>
            <button
              (click)="updateQty(item.id, 0.5)"
              class="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition flex items-center justify-center"
              title="Increase by 0.5x"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <!-- Tray Quick Summary Footer -->
      <div *ngIf="cartService.cartCount() > 0" class="p-3 bg-slate-950/90 border-t border-slate-800 space-y-2">
        <div class="flex items-center justify-between text-xs">
          <span class="text-slate-400">Total Servings:</span>
          <span class="font-mono font-bold text-white">{{ cartService.totalServings() }}x</span>
        </div>
        <div class="flex items-center justify-between text-xs">
          <span class="text-slate-400">Tray Calories:</span>
          <span class="font-mono font-bold text-white">{{ cartService.totalNutrients().calories.toFixed(0) }} kcal</span>
        </div>
        <div class="flex items-center justify-between text-xs">
          <span class="text-slate-400 font-semibold">Tray Sodium:</span>
          <span
            class="font-mono font-bold text-sm"
            [ngClass]="{
              'text-rose-400': cartService.sodiumAlertState() === 'exceeded',
              'text-amber-400': cartService.sodiumAlertState() === 'warning',
              'text-emerald-400': cartService.sodiumAlertState() === 'ok'
            }"
          >
            {{ cartService.totalNutrients().sodium_mg.toFixed(0) }} / 2,300 mg
          </span>
        </div>
      </div>
    </div>
  `
})
export class FoodTrayCartComponent {
  readonly cartService = inject(TrayCartService);

  updateQty(id: string, delta: number): void {
    this.cartService.updateQty(id, delta);
  }

  clearTray(): void {
    this.cartService.clearTray();
  }
}
