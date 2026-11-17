import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderStatusComponent } from './components/header-status/header-status.component';
import { MenuBrowserComponent } from './components/menu-browser/menu-browser.component';
import { SaladBarEstimatorComponent } from './components/salad-bar-estimator/salad-bar-estimator.component';
import { FoodTrayCartComponent } from './components/food-tray-cart/food-tray-cart.component';
import { LimitBarChartComponent } from './components/limit-bar-chart/limit-bar-chart.component';
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
    LimitBarChartComponent
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  readonly menuSync = inject(MenuSyncService);
  readonly cartService = inject(TrayCartService);
}
