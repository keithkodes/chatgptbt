import { Component, OnDestroy, OnInit } from '@angular/core';
import { Platform } from '@ionic/angular';
import { Device } from '@capacitor/device';
import { BehaviorSubject } from 'rxjs';

import { BleService } from '../ble.service';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage {


  constructor(private platform: Platform, private ble: BleService) { }

  async ngOnInit() {
    this.platform.ready().then(() => {



    });
  }



}
