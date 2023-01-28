import {ChangeDetectionStrategy, Component} from '@angular/core';
import {delayWhen, expand, filter, map, Observable, of, shareReplay, switchMap, tap} from "rxjs";
import {fromPromise} from "rxjs/internal/observable/innerFrom";
import {finalize} from "rxjs/operators";
import {doOnUnsubscribe} from "../observable.util";
import {LoupedeckDevices} from "./devices";


/*
abstract class BaseUsbDevice {
  device: USBDevice | undefined;
  abstract getVendorId(): number;

  async request(): Promise<void> {
    this.device = await navigator.usb.requestDevice({filters: [{vendorId: this.getVendorId()}]})
  }
}

class LoupedeckDevice extends BaseUsbDevice{
  override getVendorId(): number {
    return 0x2ec2;
  }
}

*/

abstract class DeviceAdapter {

  getDevice(): USBDevice {
    return this.device;
  }

  protected abstract getConfiguration(): number;
  protected abstract getInterface(): number;
  protected abstract getAlternate(): number;
  protected abstract getEndpointNumber(): number

  abstract init(): Promise<void>;
  abstract destroy(): Promise<void>;

  constructor(private device: USBDevice) {
  }

  getPacketSize(): number {
    return this.device.configurations[this.getConfiguration()].interfaces[this.getInterface()].alternates[this.getAlternate()].endpoints[this.getEndpointNumber()].packetSize
  }

  protected writeData(data: BufferSource):Promise<USBOutTransferResult>{
    return this.getDevice().transferOut(this.getEndpointNumber(), data);
  }

  protected readData(length = this.getPacketSize()):Promise<USBInTransferResult>{
    return this.getDevice().transferIn(this.getEndpointNumber(), length);
  }

}


class LoupedeckDeviceAdapter extends DeviceAdapter{

  private WS_UPGRADE_HEADER = `GET /index.html\nHTTP/1.1\nConnection: Upgrade\nUpgrade: websocket\nSec-WebSocket-Key: 123abc\n\n`
  private WS_UPGRADE_RESPONSE = 'HTTP/1.1'


  constructor(device: USBDevice) {
    super(device)
  }

  async destroy(): Promise<void> {
    await this.getDevice().close();
  }

  getAlternate(): number {
    return 0x00;
  }

  getConfiguration(): number {
    return 0x01;
  }

  getEndpointNumber(): number {
    return 0x01;
  }

  getInterface(): number {
    return 0x01;
  }

  private async handShake() {
    await this.writeData(new TextEncoder().encode(this.WS_UPGRADE_HEADER))
    const {data} = await this.readData();
    this.checkHandshakeResponse(data);

  }

  private checkHandshakeResponse(data: DataView | undefined) {
    const response = new TextDecoder("ascii").decode(data);
    if (!response.startsWith(this.WS_UPGRADE_RESPONSE)) {
      throw new Error(`Invalid handshake response: ${response}`)
    }
  }

  async init(): Promise<void> {
    await this.getDevice().open();
    await this.getDevice().reset();
    await this.getDevice().selectConfiguration(this.getConfiguration());
    await this.getDevice().claimInterface(this.getInterface());
    await this.getDevice().selectAlternateInterface(this.getInterface(),this.getAlternate());
    await this.handShake();
  }

  public readData$(): Observable<USBInTransferResult> {
    return fromPromise(this.readData()).pipe(expand(()=>this.readData()))
  }


}


//
// class LoupedeckDevice {
//   private static loupedeckVendorId = 0x2ec2;
//   public device$: Observable<USBDevice>;
//
//   constructor() {
//     this.device$ = LoupedeckDevice.buildDeviceInterface$();
//   }
//
//   // todo: add ability to forget the device on unsubscribe()
//   private static getDevice$(): Observable<USBDevice> {
//     return fromPromise(navigator.usb.requestDevice({filters: [{vendorId: this.loupedeckVendorId}]}));
//   }
//
//   /**
//    * Open the device on subscribe, automatically close it on unsubscribe
//    */
//   private static captureDevice$(): Observable<USBDevice> {
//     let capturedDevice: USBDevice;
//     return this.getDevice$().pipe(
//       tap((device) => capturedDevice = device),
//       tap((device) => console.log("Device captured:", device)),
//       delayWhen((device) => fromPromise(device.open())),
//       delayWhen((device) => fromPromise(device.reset())),
//
//       // doOnUnsubscribe(() => capturedDevice.close()) // fixme: unsubscribe is called even if I don't unsubscribe… why this ?
//     )
//   }
//
//   private static writeData(device: USBDevice, data: BufferSource):Promise<USBOutTransferResult>{
//     return device.transferOut(0x01, data);
//   }
//   private static readData(device: USBDevice, length = 512):Promise<USBInTransferResult>{
//     return device.transferIn(0x01, length);
//
//   }
//
//   private static async handShake(device: USBDevice) {
//     await this.writeData(device, new TextEncoder().encode(WS_UPGRADE_HEADER))
//     const {data} = await this.readData(device, 512);
//     this.checkHandshakeResponse(data);
//
//   }
//
//   private static checkHandshakeResponse(data: DataView | undefined) {
//     const response = new TextDecoder("ascii").decode(data);
//     if (!response.startsWith(WS_UPGRADE_RESPONSE)) {
//       throw new Error(`Invalid handshake response: ${response}`)
//     }
//   }
//
//   private static buildDeviceInterface$(): Observable<USBDevice> {
//     return this.captureDevice$().pipe(
//       delayWhen((device) => fromPromise(device.selectConfiguration(1))),
//       delayWhen((device) => fromPromise(device.claimInterface(1))),
//       delayWhen((device)=> fromPromise(device.selectAlternateInterface(1,0))),
//       delayWhen((device) => fromPromise(this.handShake(device))),
//     );
//   }
//
//
//   public readRawData$(): Observable<USBInTransferResult> {
//     return this.device$.pipe(
//       map(((device) => [device, null])),
//       expand(async ([device]) => {
//         const data = await LoupedeckDevice.readData(device!, 512)
//         return ([device, data])
//       }),
//       map(([, data]) => data as USBInTransferResult),
//       filter((data)=> !!data)
//     )
//   }
//
// }


@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'loupedeck';

    public devices = new LoupedeckDevices();
    public devices$ = this.devices.getDevices$();

   public readData$ = this.buildData();


   buildData(){

     return this.devices.getDevices$()
       .pipe(
         map(([first])=>first),
         filter((device)=>!!device),
         switchMap((device)=> new LoupedeckDeviceAdapter(device).readData$()));
   }



  async onDiscoverClicked():Promise<void> {
    await this.devices.requestDevice()
  }

  async onForgetClicked(): Promise<void> {
  await this.devices.forgetAllDevices();
  }
}

