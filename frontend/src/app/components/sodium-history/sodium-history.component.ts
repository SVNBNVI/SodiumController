import {
  Component,
  inject,
  computed,
  signal,
  effect,
  AfterViewInit,
  ViewChild,
  ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TrayCartService } from '../../services/tray-cart.service';

@Component({
  selector: 'app-sodium-history',
  standalone: true,
  imports: [CommonModule],
  template: `
    <dialog
      #historyDialog
      [attr.closedby]="'any'"
      aria-labelledby="sodium-history-title"
      (close)="onNativeClose()"
      class="bg-slate-900 text-slate-100 border border-slate-800 rounded-2xl max-w-2xl w-[calc(100%-2rem)] p-6 space-y-5 shadow-2xl max-h-[90vh] open:flex open:flex-col m-auto"
    >
      <!-- Modal Header -->
      <div class="flex items-start justify-between gap-4 border-b border-slate-800 pb-4 shrink-0">
        <div class="flex items-center gap-3">
          <div
            aria-hidden="true"
            class="w-10 h-10 rounded-xl bg-[#00274C] border border-[#FFCB05] flex items-center justify-center text-lg text-[#FFCB05] font-black shadow-md shadow-blue-950/50"
          >
            📅
          </div>
          <div>
            <h2 id="sodium-history-title" class="text-lg font-bold text-white font-display flex items-center gap-2 flex-wrap">
              <span>Multi-Day Sodium Intake History</span>
              <span class="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20 font-mono">
                Up to 14 Days
              </span>
            </h2>
            <p class="text-xs text-slate-400">
              Automatic date-stamped archive against your {{ cartService.sodiumLimit() | number }} mg daily sodium ceiling
            </p>
          </div>
        </div>

        <form method="dialog">
          <button
            type="submit"
            value="dismiss"
            aria-label="Close history dialog"
            class="text-slate-400 hover:text-white p-1.5 min-w-[32px] min-h-[32px] rounded-lg hover:bg-slate-800 transition flex items-center justify-center"
          >
            <svg aria-hidden="true" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </form>
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
            {{ avgSodium() }} <span class="text-xs text-slate-400 font-normal">mg</span>
          </div>
        </div>
        <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center">
          <div class="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Exceeded Ceiling</div>
          <div class="text-lg font-extrabold font-mono mt-0.5" [ngClass]="exceededCount() > 0 ? 'text-rose-400' : 'text-emerald-400'">
            {{ exceededCount() }} <span class="text-xs text-slate-400 font-normal">days</span>
          </div>
        </div>
      </div>

      <!-- Scrollable History List -->
      <div class="overflow-y-auto sc-scroller space-y-3 pr-1 max-h-[380px] flex-1">
        <div
          *ngIf="entries().length === 0"
          class="p-8 text-center rounded-xl bg-slate-950/60 border border-dashed border-slate-800 text-slate-400 space-y-2"
        >
          <span aria-hidden="true" class="text-3xl block">📋</span>
          <p class="text-sm font-semibold text-slate-200">No History Recorded Yet</p>
          <p class="text-xs text-slate-400 max-w-md mx-auto">
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
          <div class="flex items-center justify-between gap-3 flex-wrap">
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
            <div class="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800" aria-hidden="true">
              <div
                class="h-full rounded-full transition-all duration-500"
                [style.width.%]="Math.min(100, getSodiumPct(entry.totalSodium_mg))"
                [ngClass]="getBarColor(entry.totalSodium_mg)"
              ></div>
            </div>
            <div class="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>0 mg</span>
              <span class="text-rose-400/90">Ceiling: {{ cartService.sodiumLimit() | number }} mg</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal Footer (reserves confirmation space without shifting controls under pointer) -->
      <div class="space-y-2 border-t border-slate-800 pt-3 shrink-0">
        <p
          id="clear-history-warning"
          class="text-[11px] text-rose-300 font-medium"
          [style.visibility]="confirmingClear() ? 'visible' : 'hidden'"
        >
          Permanently delete all archived multi-day sodium history from this browser?
        </p>

        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <button
              *ngIf="cartService.history().length > 0 && !confirmingClear()"
              type="button"
              (click)="requestClearHistory()"
              class="text-xs px-2.5 py-1.5 min-h-[34px] rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 transition font-medium"
            >
              Clear History
            </button>

            <ng-container *ngIf="confirmingClear()">
              <button
                type="button"
                (click)="cancelClearHistory()"
                aria-describedby="clear-history-warning"
                class="text-xs px-3 py-1.5 min-h-[34px] rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 transition font-medium"
              >
                Keep History
              </button>
              <button
                type="button"
                (click)="confirmClearHistory()"
                class="text-xs px-3 py-1.5 min-h-[34px] rounded-lg bg-rose-600 text-white hover:bg-rose-500 transition font-bold"
              >
                Confirm Delete
              </button>
            </ng-container>
          </div>

          <form method="dialog">
            <button
              type="submit"
              value="close"
              autofocus
              class="px-4 py-2 min-h-[36px] rounded-lg bg-[#FFCB05] text-slate-950 font-bold hover:bg-amber-400 transition text-xs shadow-md shadow-amber-500/20"
            >
              Close
            </button>
          </form>
        </div>
      </div>
    </dialog>
  `
})
export class SodiumHistoryComponent implements AfterViewInit {
  @ViewChild('historyDialog') private dialogRef?: ElementRef<HTMLDialogElement>;

  readonly cartService = inject(TrayCartService);
  readonly Math = Math;
  readonly confirmingClear = signal<boolean>(false);

  readonly entries = computed(() => this.cartService.fullHistoryWithToday());

  readonly avgSodium = computed(() => {
    const list = this.entries();
    if (list.length === 0) return 0;
    const sum = list.reduce((acc, cur) => acc + cur.totalSodium_mg, 0);
    return Math.round(sum / list.length);
  });

  readonly exceededCount = computed(() => {
    const limit = this.cartService.sodiumLimit();
    return this.entries().filter((e) => e.totalSodium_mg >= limit).length;
  });

  constructor() {
    effect(() => {
      const shouldOpen = this.cartService.isHistoryOpen();
      const dialog = this.dialogRef?.nativeElement;
      if (!dialog) return;

      if (shouldOpen && !dialog.open) {
        this.confirmingClear.set(false);
        dialog.showModal();
      } else if (!shouldOpen && dialog.open) {
        dialog.close();
      }
    });
  }

  ngAfterViewInit(): void {
    const dialog = this.dialogRef?.nativeElement;
    if (!dialog) return;

    // Sync initial open state if opened prior to view initialization
    if (this.cartService.isHistoryOpen() && !dialog.open) {
      dialog.showModal();
    }

    // Fallback for browsers without declarative <dialog closedby="any"> support (e.g. Safari)
    if (typeof HTMLDialogElement !== 'undefined' && !('closedBy' in HTMLDialogElement.prototype)) {
      const isOutside = (e: PointerEvent): boolean => {
        if (e.target !== dialog) return false;
        const r = dialog.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      let pressedOutside = false;
      dialog.addEventListener('pointerdown', (e: PointerEvent) => {
        pressedOutside = isOutside(e);
      });
      dialog.addEventListener('pointerup', (e: PointerEvent) => {
        if (pressedOutside && isOutside(e)) {
          dialog.close();
        }
        pressedOutside = false;
      });
    }
  }

  onNativeClose(): void {
    const dialog = this.dialogRef?.nativeElement;
    if (dialog) {
      dialog.returnValue = '';
    }
    this.confirmingClear.set(false);
    this.cartService.closeHistory();
  }

  getSodiumPct(mg: number): number {
    const limit = this.cartService.sodiumLimit();
    return limit > 0 ? Math.round((mg / limit) * 100) : 0;
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
    const pct = this.getSodiumPct(this.avgSodium());
    if (pct >= 100) return 'text-rose-400';
    if (pct >= 80) return 'text-amber-400';
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

  requestClearHistory(): void {
    this.confirmingClear.set(true);
  }

  cancelClearHistory(): void {
    this.confirmingClear.set(false);
  }

  confirmClearHistory(): void {
    this.cartService.clearHistory();
    this.confirmingClear.set(false);
  }
}
