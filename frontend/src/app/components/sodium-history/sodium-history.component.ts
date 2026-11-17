import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TrayCartService } from '../../services/tray-cart.service';

@Component({
  selector: 'app-sodium-history',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      *ngIf="cartService.isHistoryOpen()"
      class="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity animate-in fade-in"
      (click)="onBackdropClick($event)"
    >
      <div
        class="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] flex flex-col relative"
        (click)="$event.stopPropagation()"
      >
        <!-- Modal Header -->
        <div class="flex items-start justify-between gap-4 border-b border-slate-800 pb-4 shrink-0">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-[#00274C] border border-[#FFCB05] flex items-center justify-center text-lg text-[#FFCB05] font-black shadow-md shadow-blue-950/50">
              📅
            </div>
            <div>
              <h2 class="text-lg font-bold text-white font-display flex items-center gap-2">
                Multi-Day Sodium Intake History
                <span class="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20 font-mono">
                  Up to 14 Days
                </span>
              </h2>
              <p class="text-xs text-slate-400">
                Automatic date-stamped archive against the 2,300 mg FDA daily ceiling limit
              </p>
            </div>
          </div>
          <button
            (click)="cartService.closeHistory()"
            class="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            aria-label="Close"
          >
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Metric Summary Chips -->
        <div class="grid grid-cols-3 gap-3 shrink-0">
          <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center">
            <div class="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Recorded Days</div>
            <div class="text-lg font-extrabold text-white font-mono mt-0.5">
              {{ entries().length }}
            </div>
          </div>
          <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center">
            <div class="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Avg Daily Sodium</div>
            <div class="text-lg font-extrabold font-mono mt-0.5" [ngClass]="getAvgColorClass()">
              {{ avgSodium() }} <span class="text-xs text-slate-500 font-normal">mg</span>
            </div>
          </div>
          <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center">
            <div class="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Exceeded Ceiling</div>
            <div class="text-lg font-extrabold font-mono mt-0.5" [ngClass]="exceededCount() > 0 ? 'text-rose-400' : 'text-emerald-400'">
              {{ exceededCount() }} <span class="text-xs text-slate-500 font-normal">days</span>
            </div>
          </div>
        </div>

        <!-- Scrollable History List -->
        <div class="overflow-y-auto space-y-3 pr-1 max-h-[420px] flex-1">
          <div
            *ngIf="entries().length === 0"
            class="p-8 text-center rounded-xl bg-slate-950/60 border border-dashed border-slate-800 text-slate-400 space-y-2"
          >
            <span class="text-3xl block">📋</span>
            <p class="text-sm font-semibold text-slate-200">No History Recorded Yet</p>
            <p class="text-xs text-slate-500 max-w-md mx-auto">
              Add food items to your meal tray today! At Detroit midnight rollover, today's summary will automatically archive into your multi-day history trend.
            </p>
          </div>

          <div
            *ngFor="let entry of entries()"
            class="p-3.5 rounded-xl bg-slate-950 border transition space-y-2.5"
            [ngClass]="{
              'border-rose-500/50 bg-rose-950/10': getSodiumPct(entry.totalSodium_mg) >= 100,
              'border-amber-500/40': getSodiumPct(entry.totalSodium_mg) >= 80 && getSodiumPct(entry.totalSodium_mg) < 100,
              'border-slate-800': getSodiumPct(entry.totalSodium_mg) < 80
            }"
          >
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2">
                <span class="font-bold text-sm text-slate-100 font-mono">{{ formatDate(entry.date) }}</span>
                <span
                  *ngIf="entry.isLiveToday"
                  class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold uppercase tracking-wider animate-pulse"
                >
                  Live Today
                </span>
              </div>
              <div class="flex items-center gap-2 font-mono text-xs">
                <span class="text-slate-400">{{ entry.itemsCount }} items • {{ entry.totalCalories }} kcal</span>
                <span
                  class="px-2 py-0.5 rounded-full font-bold text-[11px] border"
                  [ngClass]="getStatusBadgeClass(entry.totalSodium_mg)"
                >
                  {{ entry.totalSodium_mg }} mg ({{ getSodiumPct(entry.totalSodium_mg) }}%)
                </span>
              </div>
            </div>

            <!-- Sodium Progress Bar -->
            <div class="space-y-1">
              <div class="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                <div
                  class="h-full rounded-full transition-all duration-500"
                  [style.width.%]="Math.min(100, getSodiumPct(entry.totalSodium_mg))"
                  [ngClass]="getBarColor(entry.totalSodium_mg)"
                ></div>
              </div>
              <div class="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>0 mg</span>
                <span class="text-rose-400/80">FDA Limit: 2,300 mg</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="flex items-center justify-between gap-3 border-t border-slate-800 pt-4 shrink-0">
          <button
            *ngIf="cartService.history().length > 0"
            (click)="onClearHistory()"
            class="text-xs text-rose-400/80 hover:text-rose-300 hover:underline transition"
          >
            Clear History
          </button>
          <div *ngIf="cartService.history().length === 0"></div>

          <button
            (click)="cartService.closeHistory()"
            class="px-4 py-2 rounded-lg bg-[#FFCB05] text-slate-950 font-bold hover:bg-amber-400 transition text-xs shadow-md shadow-amber-500/20"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  `
})
export class SodiumHistoryComponent {
  readonly cartService = inject(TrayCartService);
  readonly Math = Math;

  readonly entries = computed(() => this.cartService.fullHistoryWithToday());

  readonly avgSodium = computed(() => {
    const list = this.entries();
    if (list.length === 0) return 0;
    const sum = list.reduce((acc, cur) => acc + cur.totalSodium_mg, 0);
    return Math.round(sum / list.length);
  });

  readonly exceededCount = computed(() => {
    return this.entries().filter((e) => e.totalSodium_mg >= 2300).length;
  });

  getSodiumPct(mg: number): number {
    return Math.round((mg / 2300) * 100);
  }

  getBarColor(mg: number): string {
    const pct = this.getSodiumPct(mg);
    if (pct >= 100) return 'bg-rose-500 shadow-sm shadow-rose-500/50';
    if (pct >= 80) return 'bg-amber-400';
    return 'bg-emerald-500';
  }

  getStatusBadgeClass(mg: number): string {
    const pct = this.getSodiumPct(mg);
    if (pct >= 100) return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
    if (pct >= 80) return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
  }

  getAvgColorClass(): string {
    const avg = this.avgSodium();
    if (avg >= 2300) return 'text-rose-400';
    if (avg >= 1840) return 'text-amber-400';
    return 'text-emerald-400';
  }

  formatDate(dateStr: string): string {
    try {
      const [year, month, day] = dateStr.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.cartService.closeHistory();
    }
  }

  onClearHistory(): void {
    if (confirm('Are you sure you want to clear your stored sodium history?')) {
      this.cartService.clearHistory();
    }
  }
}
