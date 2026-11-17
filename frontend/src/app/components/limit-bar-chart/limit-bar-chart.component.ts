import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TrayCartService } from '../../services/tray-cart.service';
import { PercentDailyValue } from '../../models/nutrition.model';

@Component({
  selector: 'app-limit-bar-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div id="resultsChartCard" class="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-6 shadow-xl">
      <!-- Header with Status Pill and Mode Switcher -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-base font-bold text-white font-display">FDA Daily Recommended Limit Bar</h2>
            <!-- Sodium Status Pill -->
            <span
              class="text-xs px-2.5 py-0.5 rounded-full font-bold border font-mono tracking-wide"
              [ngClass]="{
                'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-sm shadow-rose-500/20': cartService.sodiumAlertState() === 'exceeded',
                'bg-amber-500/20 text-amber-300 border-amber-500/40': cartService.sodiumAlertState() === 'warning',
                'bg-emerald-500/10 text-emerald-400 border-emerald-500/30': cartService.sodiumAlertState() === 'ok'
              }"
            >
              {{ getSodiumStatusLabel() }}
            </span>
          </div>
          <p class="text-xs text-slate-400 mt-1">
            2,000 kcal FDA Standard Benchmark • Visualizing Daily Intake vs Recommended Ceilings &amp; Floors
          </p>
        </div>

        <!-- View Mode Toggle -->
        <div class="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg shrink-0 self-start sm:self-auto">
          <button
            (click)="viewMode.set('bars')"
            class="px-3 py-1 rounded text-xs font-semibold transition"
            [ngClass]="{
              'bg-[#FFCB05] text-slate-950 font-bold': viewMode() === 'bars',
              'text-slate-400 hover:text-white': viewMode() !== 'bars'
            }"
          >
            📊 %DV Bars
          </button>
          <button
            (click)="viewMode.set('summary')"
            class="px-3 py-1 rounded text-xs font-semibold transition"
            [ngClass]="{
              'bg-[#FFCB05] text-slate-950 font-bold': viewMode() === 'summary',
              'text-slate-400 hover:text-white': viewMode() !== 'summary'
            }"
          >
            📋 Macro Cards
          </button>
        </div>
      </div>

      <!-- Top Offender Alert Callout (when sodium or other ceiling exceeds or nears limit) -->
      <div
        *ngIf="cartService.topOffenders().length > 0"
        class="p-4 rounded-xl border bg-slate-950/90 space-y-2.5 transition"
        [ngClass]="{
          'border-rose-500/50 shadow-md shadow-rose-950/40': cartService.sodiumAlertState() === 'exceeded',
          'border-amber-500/40': cartService.sodiumAlertState() !== 'exceeded'
        }"
      >
        <div class="flex items-center gap-2">
          <span class="text-lg">⚠️</span>
          <h3 class="text-xs font-bold uppercase tracking-wider text-white">
            Top Offender Analysis (Ceiling Limit Alert)
          </h3>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
          <div
            *ngFor="let offender of cartService.topOffenders()"
            class="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs flex items-center justify-between gap-3"
          >
            <div class="min-w-0">
              <span class="text-[10px] text-slate-400 font-bold uppercase tracking-wide">
                #1 Contributor to {{ offender.metricLabel }}
              </span>
              <p class="font-semibold text-slate-100 truncate font-display">{{ offender.itemName }}</p>
            </div>
            <div class="text-right shrink-0 font-mono">
              <div class="font-bold text-rose-400">{{ offender.amountContributed }} {{ getUnit(offender.metricKey) }}</div>
              <div class="text-[10px] text-slate-400">
                {{ offender.percentOfDailyLimit }}% of DV ({{ offender.percentOfTotal }}% of tray)
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- %DV Vertical Bar Chart View -->
      <div *ngIf="viewMode() === 'bars'" class="space-y-4">
        <!-- Chart Canvas Area (Height 260px) -->
        <div class="relative h-64 bg-slate-950/70 border border-slate-800 rounded-xl p-4 pt-6 flex items-end justify-between gap-2 overflow-x-auto">
          <!-- 100% FDA Limit Guideline (at 66.6% height because scale is 0–150%) -->
          <div
            class="absolute left-0 right-0 border-b-2 border-dashed border-rose-500/60 pointer-events-none flex items-center justify-between px-3 z-10"
            style="bottom: 66.6%;"
          >
            <span class="text-[9px] font-mono font-bold tracking-wider px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
              100% FDA DAILY VALUE LIMIT
            </span>
            <span class="text-[9px] font-mono text-rose-400/80">
              Max Safe Healthy Ceiling
            </span>
          </div>

          <!-- Vertical Bars for Each Nutrient -->
          <div
            *ngFor="let metric of cartService.percentDailyValues()"
            class="flex-1 h-full flex flex-col justify-end items-center group relative min-w-[38px]"
          >
            <!-- Percentage Value Badge at Top of Bar -->
            <span
              class="text-[11px] font-mono font-bold mb-1 transition-colors"
              [ngClass]="{
                'text-rose-400': metric.isCeiling && metric.percent >= 100,
                'text-amber-400': metric.isCeiling && metric.percent >= 80 && metric.percent < 100,
                'text-emerald-400': !metric.isCeiling && metric.percent >= 100,
                'text-slate-300': metric.percent < 80
              }"
            >
              {{ metric.percent }}%
            </span>

            <!-- Bar Track Column -->
            <div class="w-full max-w-[34px] bg-slate-900 rounded-t overflow-hidden flex items-end h-full border border-slate-800/80 relative">
              <!-- Visual Bar Fill -->
              <div
                [style.height.%]="metric.visualHeightPct"
                class="w-full transition-all duration-500 rounded-t"
                [ngClass]="getBarColor(metric)"
              ></div>
            </div>

            <!-- Metric Label Below Bar -->
            <span class="text-[11px] text-slate-400 mt-2 font-medium truncate max-w-full text-center">
              {{ metric.label }}
            </span>

            <!-- Tooltip Hover Bubble -->
            <div class="opacity-0 group-hover:opacity-100 pointer-events-none absolute bottom-full mb-2 bg-slate-900 border border-slate-700 text-slate-100 text-[10px] rounded px-2 py-1 shadow-lg font-mono whitespace-nowrap z-20 transition">
              <div>{{ metric.label }}: {{ metric.value }} / {{ metric.limit }} {{ metric.unit }}</div>
              <div class="text-slate-400">Limit: {{ metric.limit }}{{ metric.unit }} ({{ metric.isCeiling ? 'Ceiling' : 'Target' }})</div>
            </div>
          </div>
        </div>

        <!-- Legend and Explanations -->
        <div class="flex items-center justify-between text-[11px] text-slate-400 flex-wrap gap-2 pt-1 font-mono">
          <div class="flex items-center gap-3">
            <span class="flex items-center gap-1.5">
              <span class="w-3 h-3 rounded bg-emerald-500"></span>
              <span>&lt;80% (Within Ceiling)</span>
            </span>
            <span class="flex items-center gap-1.5">
              <span class="w-3 h-3 rounded bg-amber-400"></span>
              <span>80–99% (Near Limit)</span>
            </span>
            <span class="flex items-center gap-1.5">
              <span class="w-3 h-3 rounded bg-rose-500"></span>
              <span>&ge;100% (Limit Exceeded)</span>
            </span>
          </div>
          <span class="text-slate-500">*Chart scaled 0–150% DV (100% at dashed line)</span>
        </div>
      </div>

      <!-- Macro Cards / Summary View -->
      <div *ngIf="viewMode() === 'summary'" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div
          *ngFor="let metric of cartService.percentDailyValues()"
          class="p-3.5 rounded-xl bg-slate-950 border transition flex items-center justify-between"
          [ngClass]="{
            'border-rose-500/60 bg-rose-950/10': metric.isCeiling && metric.percent >= 100,
            'border-amber-500/40': metric.isCeiling && metric.percent >= 80 && metric.percent < 100,
            'border-slate-800': metric.percent < 80
          }"
        >
          <div>
            <div class="text-xs text-slate-400 font-medium">{{ metric.label }}</div>
            <div class="text-sm font-bold text-white font-mono mt-0.5">
              {{ metric.value }} <span class="text-xs text-slate-500 font-normal">/ {{ metric.limit }} {{ metric.unit }}</span>
            </div>
            <div class="text-[10px] text-slate-500 mt-0.5">
              Type: {{ metric.isCeiling ? 'Strict Ceiling Limit' : 'Target / Daily Floor' }}
            </div>
          </div>

          <div class="text-right">
            <span
              class="text-base font-bold font-mono"
              [ngClass]="{
                'text-rose-400': metric.isCeiling && metric.percent >= 100,
                'text-amber-400': metric.isCeiling && metric.percent >= 80 && metric.percent < 100,
                'text-emerald-400': !metric.isCeiling && metric.percent >= 100,
                'text-slate-200': metric.percent < 80
              }"
            >
              {{ metric.percent }}%
            </span>
            <div class="text-[10px] uppercase font-mono font-bold tracking-wider" [ngClass]="getStatusTextClass(metric)">
              {{ metric.status }}
            </div>
          </div>
        </div>
      </div>
    </div>
  `
})
export class LimitBarChartComponent {
  readonly cartService = inject(TrayCartService);
  readonly viewMode = signal<'bars' | 'summary'>('bars');

  getSodiumStatusLabel(): string {
    const pct = this.cartService.sodiumPercent();
    const state = this.cartService.sodiumAlertState();
    if (state === 'exceeded') return `EXCEEDED SODIUM (${pct}%)`;
    if (state === 'warning') return `Sodium Near Limit (${pct}%)`;
    return `Sodium Within Limit (${pct}%)`;
  }

  getBarColor(metric: PercentDailyValue): string {
    if (metric.isCeiling) {
      if (metric.percent >= 100) return 'bg-rose-500 shadow-md shadow-rose-500/40';
      if (metric.percent >= 80) return 'bg-amber-400 shadow-sm shadow-amber-400/30';
      return 'bg-emerald-500';
    } else {
      if (metric.percent >= 100) return 'bg-emerald-400 shadow-sm shadow-emerald-400/30';
      return 'bg-sky-500';
    }
  }

  getStatusTextClass(metric: PercentDailyValue): string {
    if (metric.status === 'exceeded') return 'text-rose-400';
    if (metric.status === 'warning') return 'text-amber-400';
    if (metric.status === 'achieved') return 'text-emerald-400';
    return 'text-slate-400';
  }

  getUnit(metricKey: string): string {
    if (metricKey.includes('_mg')) return 'mg';
    if (metricKey.includes('calories')) return 'kcal';
    return 'g';
  }
}
