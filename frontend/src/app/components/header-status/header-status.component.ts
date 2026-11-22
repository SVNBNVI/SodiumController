import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MenuSyncService } from '../../services/menu-sync.service';
import { TrayCartService } from '../../services/tray-cart.service';

@Component({
  selector: 'app-header-status',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <header class="border-b border-slate-800 bg-slate-900/95 backdrop-blur sticky top-0 z-30">
      <div class="max-w-7xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
        <!-- Logo, App Title, and Dining Hall Selector -->
        <div class="flex items-center gap-2.5">
          <div
            aria-hidden="true"
            class="w-9 h-9 rounded-lg bg-[#00274C] border border-[#FFCB05] flex items-center justify-center font-black text-base text-[#FFCB05] shadow-md shadow-blue-950/50 select-none shrink-0"
          >
            SC
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <h1 class="text-base sm:text-lg font-bold tracking-tight text-white font-display">SodiumController</h1>
            <label for="diningHallSelect" class="visually-hidden">Dining Hall</label>
            <select
              id="diningHallSelect"
              name="diningHall"
              [ngModel]="menuSync.selectedHall().slug"
              (ngModelChange)="onHallChange($event)"
              class="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-[#FFCB05] border border-amber-500/30 font-semibold tracking-wide cursor-pointer appearance-none bg-no-repeat bg-right pr-6 min-h-[28px]"
              style="background-image: url('data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%226%22 viewBox=%220 0 10 6%22%3E%3Cpath d=%22M0 0l5 6 5-6z%22 fill=%22%23FFCB05%22/%3E%3C/svg%3E'); background-position: right 8px center; background-size: 8px 5px;"
            >
              <option *ngFor="let hall of menuSync.diningHalls" [value]="hall.slug" class="bg-slate-900 text-slate-200">
                {{ hall.name }}
              </option>
            </select>
          </div>
        </div>

        <!-- Sync Controls and History Trigger -->
        <div class="flex items-center gap-2 text-xs">
          <div class="flex items-center gap-1.5 px-2.5 py-1 min-h-[30px] rounded-lg bg-slate-800/90 border border-slate-700 text-slate-200">
            <span
              aria-hidden="true"
              class="w-2 h-2 rounded-full transition-colors duration-300 shrink-0"
              [ngClass]="{
                'bg-emerald-400 animate-pulse': menuSync.isLive(),
                'bg-amber-400': !menuSync.isLive()
              }"
            ></span>
            <span class="font-semibold whitespace-nowrap">
              {{ menuSync.syncStatus() }}
            </span>
          </div>

          <button
            type="button"
            (click)="reloadMenu()"
            [disabled]="menuSync.loading()"
            class="px-3 py-1.5 min-h-[30px] rounded-lg bg-[#FFCB05] text-slate-950 font-bold hover:bg-amber-400 transition flex items-center gap-1.5 disabled:opacity-50 active:scale-95"
          >
            <svg
              *ngIf="menuSync.loading()"
              aria-hidden="true"
              class="animate-spin w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            <span>Reload</span>
          </button>

          <button
            type="button"
            (click)="cartService.openHistory()"
            class="px-2.5 py-1.5 min-h-[30px] rounded-lg bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 font-medium transition flex items-center gap-1.5 active:scale-95"
          >
            <span aria-hidden="true">📅</span>
            <span>History</span>
            <span
              *ngIf="cartService.history().length > 0"
              class="px-1.5 py-0.5 rounded-full text-[10px] bg-[#FFCB05] text-slate-950 font-bold"
            >
              {{ cartService.history().length }}
            </span>
          </button>
        </div>
      </div>
    </header>
  `
})
export class HeaderStatusComponent {
  readonly menuSync = inject(MenuSyncService);
  readonly cartService = inject(TrayCartService);

  onHallChange(slug: string): void {
    const hall = this.menuSync.diningHalls.find((h) => h.slug === slug);
    if (hall) {
      this.menuSync.setHall(hall);
    }
  }

  reloadMenu(): void {
    this.menuSync.fetchSodiumJson(true);
  }
}
