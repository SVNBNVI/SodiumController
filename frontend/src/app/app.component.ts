import { Component, inject, effect, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderStatusComponent } from './components/header-status/header-status.component';
import { MenuBrowserComponent } from './components/menu-browser/menu-browser.component';
import { SaladBarEstimatorComponent } from './components/salad-bar-estimator/salad-bar-estimator.component';
import { FoodTrayCartComponent } from './components/food-tray-cart/food-tray-cart.component';
import { LimitBarChartComponent } from './components/limit-bar-chart/limit-bar-chart.component';
import { SodiumHistoryComponent } from './components/sodium-history/sodium-history.component';
import { MenuSyncService } from './services/menu-sync.service';
import { TrayCartService } from './services/tray-cart.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    HeaderStatusComponent,
    MenuBrowserComponent,
    SaladBarEstimatorComponent,
    FoodTrayCartComponent,
    LimitBarChartComponent,
    SodiumHistoryComponent
  ],
  templateUrl: './app.component.html'
})
export class AppComponent implements AfterViewInit {
  @ViewChild('mobileTrayDialog') private mobileSheetRef?: ElementRef<HTMLDialogElement>;

  readonly menuSync = inject(MenuSyncService);
  readonly cartService = inject(TrayCartService);
  readonly Math = Math;

  constructor() {
    effect(() => {
      const shouldOpen = this.cartService.isMobileSheetOpen();
      const dialog = this.mobileSheetRef?.nativeElement;
      if (!dialog) return;

      if (shouldOpen && !dialog.open) {
        dialog.showModal();
      } else if (!shouldOpen && dialog.open) {
        dialog.close();
      }
    });
  }

  ngAfterViewInit(): void {
    const dialog = this.mobileSheetRef?.nativeElement;
    if (!dialog) return;

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

  onMobileSheetClose(): void {
    const dialog = this.mobileSheetRef?.nativeElement;
    if (dialog) {
      dialog.returnValue = '';
    }
    this.cartService.closeMobileSheet();
  }
}
