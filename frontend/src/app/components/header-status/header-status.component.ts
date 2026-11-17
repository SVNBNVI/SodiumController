import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MenuSyncService } from '../../services/menu-sync.service';
import { TrayCartService } from '../../services/tray-cart.service';
import { DiningHall } from '../../models/nutrition.model';

@Component({
  selector: 'app-header-status',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <header class="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-30">
      <div class="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <!-- Logo and App Title -->
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-[#00274C] border border-[#FFCB05] flex items-center justify-center font-black text-lg text-[#FFCB05] shadow-md shadow-blue-950/50">
            SC
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h1 class="text-lg font-bold tracking-tight text-white font-display">SodiumController</h1>
              <!-- Section 6: Dining Hall Selector Dropdown -->
              <select
                [ngModel]="menuSync.selectedHall().slug"
                (ngModelChange)="onHallChange($event)"
                class="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-[#FFCB05] border border-amber-500/30 font-semibold tracking-wide cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#FFCB05] appearance-none bg-no-repeat bg-right pr-5"
                style="background-image: url('data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%226%22 viewBox=%220 0 10 6%22%3E%3Cpath d=%22M0 0l5 6 5-6z%22 fill=%22%23FFCB05%22/%3E%3C/svg%3E'); background-position: right 6px center; background-size: 8px 5px;"
              >
                <option *ngFor="let hall of menuSync.diningHalls" [value]="hall.slug" class="bg-slate-900 text-slate-200">
                  {{ hall.name }}
                </option>
              </select>
            </div>
            <p class="text-xs text-slate-400">Daily M|Dining Nutrition &amp; FDA Daily Limit Tracker</p>
          </div>
        </div>

        <!-- Sync Controls and Status -->
        <div class="flex items-center gap-2.5 text-xs">
          <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/90 border border-slate-700 text-slate-300">
            <span
              class="w-2.5 h-2.5 rounded-full transition-colors duration-300"
              [ngClass]="{
                'bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50': menuSync.isLive(),
                'bg-amber-400': !menuSync.isLive()
              }"
            ></span>
            <span class="font-medium truncate max-w-[280px] sm:max-w-none">
              {{ menuSync.syncStatus() }}
            </span>
          </div>

          <button
            (click)="reloadMenu()"
            [disabled]="menuSync.loading()"
            class="px-3.5 py-1.5 rounded-lg bg-[#FFCB05] text-slate-950 font-bold hover:bg-amber-400 transition flex items-center gap-1.5 disabled:opacity-50 shadow-sm shadow-amber-500/20 active:scale-95"
          >
            <svg *ngIf="menuSync.loading()" class="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            <span>Reload</span>
          </button>

          <button
            (click)="cartService.toggleHistory()"
            class="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 font-medium transition flex items-center gap-1.5 active:scale-95"
            title="View Multi-Day Sodium Intake History"
          >
            <span>📅 History</span>
            <span
              *ngIf="cartService.history().length > 0"
              class="px-1.5 py-0.2 rounded-full text-[10px] bg-[#FFCB05] text-slate-950 font-bold"
            >
              {{ cartService.history().length }}
            </span>
          </button>

          <button
            (click)="scrollToChart()"
            class="hidden sm:inline-flex px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 font-medium transition"
          >
            View %DV Chart &darr;
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

  scrollToChart(): void {
    const el = document.getElementById('resultsChartCard');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }
}
