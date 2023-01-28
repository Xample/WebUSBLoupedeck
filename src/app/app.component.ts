import {Component} from '@angular/core';
import {delayWhen, Observable, repeat, shareReplay, switchMap, tap} from "rxjs";
import {fromPromise} from "rxjs/internal/observable/innerFrom";
import {doOnUnsubscribe} from "../observable.util";


class LoupedeckDevice {
  private static loupedeckVendorId = 0x2ec2;
  private device$: Observable<USBDevice>;

  constructor() {
    this.device$ = LoupedeckDevice.buildDeviceInterface$();
  }

  // todo: add ability to forget the device on unsubscribe()
  private static getDevice$(): Observable<USBDevice> {
    return fromPromise(navigator.usb.requestDevice({filters: [{vendorId: this.loupedeckVendorId}]}));
  }

  /**
   * Open the device on subscribe, automatically close it on unsubscribe
   */
  private static captureDevice$(): Observable<USBDevice> {
    let capturedDevice: USBDevice;
    return this.getDevice$().pipe(
      tap((device) => capturedDevice = device),
      delayWhen((device) => fromPromise(device.open())),
      //doOnUnsubscribe(() => {capturedDevice.close()})
    )
  }

  private static buildDeviceInterface$(): Observable<USBDevice> {
    return this.captureDevice$().pipe(
      delayWhen((device) => fromPromise(device.selectConfiguration(1))),
      delayWhen((device) => fromPromise(device.claimInterface(1))),
      shareReplay({refCount: true, bufferSize: 1}),
    );
  }

  read$() {

    return this.device$.pipe(
      switchMap((device) => {
        return fromPromise(device.transferIn(0x01, 512))
      }),
      repeat())
  }
}


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'loupedeck';

  async onStartClicked() {

    const loupedeck = new LoupedeckDevice();
    loupedeck.read$().subscribe((value)=>console.log(value),()=>console.log("error"))

  }
}

