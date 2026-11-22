import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TrayCartService } from '../../services/tray-cart.service';
import { MenuSyncService } from '../../services/menu-sync.service';
import { TrayItem } from '../../models/nutrition.model';

@Component({
  selector: 'app-food-tray-cart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
      <!-- Tray Header -->
      <div class="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span aria-hidden="true" class="text-sm">🍱</span>
          <h2 class="text-sm font-bold text-white font-display">My Food Tray</h2>
          <span class="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-800 text-[#FFCB05] border border-slate-700">
            {{ cartService.cartCount() }}
          </span>
        </div>

        <div class="flex items-center gap-1.5">
          <button
            *ngIf="cartService.cartCount() > 0"
            type="button"
            (click)="copySummary()"
            class="text-[11px] text-slate-300 hover:text-white font-medium transition px-2 py-1 min-h-[28px] bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg"
          >
            {{ copiedFeedback() ? 'Copied!' : 'Copy' }}
          </button>
          <button
            *ngIf="cartService.cartCount() > 0"
            type="button"
            (click)="clearTray()"
            class="text-[11px] text-rose-400 hover:text-rose-300 font-medium transition px-2 py-1 min-h-[28px] hover:bg-rose-950/30 rounded-lg"
          >
            Clear
          </button>
        </div>
      </div>

      <!-- Tray Items List -->
      <div class="p-3 max-h-[260px] overflow-y-auto sc-scroller sc-contained-scroll">
        <!-- Empty State -->
        <div *ngIf="cartService.cartCount() === 0" class="py-5 px-3 text-center">
          <p class="text-xs font-medium text-slate-300">No dishes logged yet</p>
          <p class="text-[11px] text-slate-400 mt-0.5">
            Tap <strong>+ Add</strong> on any <strong>{{ menuSync.selectedHall().name }}</strong> dish — limits above update instantly!
          </p>
        </div>

        <!-- Cart Rows -->
        <ul
          *ngIf="cartService.cartCount() > 0"
          role="list"
          class="divide-y divide-slate-800/80 m-0 p-0 list-none"
        >
          <li
            *ngFor="let item of cartService.cart(); trackBy: trackByTrayItem"
            class="py-2.5 first:pt-0.5 last:pb-0.5 flex items-center justify-between gap-2"
          >
            <div class="flex-1 min-w-0">
              <h4 class="text-xs font-semibold text-white leading-tight truncate font-display">{{ item.name }}</h4>
              <div class="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap font-mono">
                <span class="text-slate-300 font-semibold">{{ (item.calories * item.qty).toFixed(0) }} kcal</span>
                <span aria-hidden="true">•</span>
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

            <!-- Quantity Stepper & Direct Remove -->
            <div class="flex items-center gap-1 shrink-0">
              <div class="flex items-center gap-0.5 bg-slate-950 border border-slate-800 rounded-lg p-0.5">
                <button
                  type="button"
                  (click)="updateQty(item.id, -1)"
                  [attr.aria-label]="'Decrease ' + item.name + ' by 1 serving'"
                  class="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition flex items-center justify-center"
                >
                  &minus;
                </button>
                <span class="w-8 text-center font-mono text-[11px] font-bold text-white">
                  {{ item.qty }}x
                </span>
                <button
                  type="button"
                  (click)="updateQty(item.id, 1)"
                  [attr.aria-label]="'Increase ' + item.name + ' by 1 serving'"
                  class="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition flex items-center justify-center"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                (click)="removeItem(item.id)"
                [attr.aria-label]="'Remove ' + item.name + ' from tray'"
                class="w-6 h-6 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition flex items-center justify-center text-sm"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </div>
          </li>
        </ul>
      </div>
    </div>
  `
})
export class FoodTrayCartComponent {
  readonly cartService = inject(TrayCartService);
  readonly menuSync = inject(MenuSyncService);
  readonly copiedFeedback = signal<boolean>(false);

  updateQty(id: string, delta: number): void {
    this.cartService.updateQty(id, delta);
  }

  removeItem(id: string): void {
    this.cartService.removeItem(id);
  }

  clearTray(): void {
    this.cartService.clearTray();
  }

  trackByTrayItem(_index: number, item: TrayItem): string {
    return item.id;
  }

  async copySummary(): Promise<void> {
    const text = this.cartService.buildShareSummary(this.menuSync.selectedHall().name);
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        this.copiedFeedback.set(true);
        setTimeout(() => this.copiedFeedback.set(false), 2500);
      }
    } catch {
      /* ignore clipboard permission errors */
    }
  }
}
