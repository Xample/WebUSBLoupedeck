import {ChangeDetectionStrategy, Component} from '@angular/core';
import {expand, filter, map, Observable, retry, switchMap, tap} from "rxjs";
import {fromPromise} from "rxjs/internal/observable/innerFrom";
import {LoupedeckDevices} from "./devices";

function promiseWithTimeout<T>(
  promise: Promise<T>,
  ms: number,
  timeoutError = new Error('Promise timed out')
): Promise<T> {
  // create a promise that rejects in milliseconds
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(timeoutError);
    }, ms);
  });

  // returns a race between timeout and the passed promise
  return Promise.race<T>([promise, timeout]);
}


abstract class DeviceAdapter {

  constructor(private device: USBDevice) {
  }

  getDevice(): USBDevice {
    return this.device;
  }

  abstract init(): Promise<this>;

  abstract destroy(): Promise<void>;

  getPacketSize(): number {
    return this.device.configuration!.interfaces[this.getInterface()].alternates[this.getAlternate()].endpoints[this.getEndpointNumber()].packetSize
  }

  public readData$(): Observable<USBInTransferResult> {
    return fromPromise(this.readData()).pipe(expand(() => this.readData()))
  }

  protected abstract getConfiguration(): number;

  protected abstract getInterface(): number;

  protected abstract getAlternate(): number;

  protected abstract getEndpointNumber(): number

  protected writeData(data: BufferSource): Promise<USBOutTransferResult> {
    return this.getDevice().transferOut(this.getEndpointNumber(), data);
  }

  protected readData(length = this.getPacketSize()): Promise<USBInTransferResult> {
    return this.getDevice().transferIn(this.getEndpointNumber(), length);
  }

}


class LoupedeckDeviceAdapter extends DeviceAdapter {

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

  async init(): Promise<this> {
    await this.getDevice().open();
    await this.getDevice().selectConfiguration(this.getConfiguration());
    await this.getDevice().claimInterface(this.getInterface());

    await this.getDevice().selectAlternateInterface(this.getInterface(), this.getAlternate());

    try {
      await promiseWithTimeout(this.handShake(), 500);
    } catch {
      await this.getDevice().reset();
      console.log("Handshake failed, resetting and retry");
      await this.handShake()
    }

    return this;
  }

  private async handShake() {
    await this.writeData(new TextEncoder().encode(this.WS_UPGRADE_HEADER))
    const {data} = await this.readData();
    this.checkHandshakeResponse(data);
  }

  private checkHandshakeResponse(data: DataView | undefined) {
    const response = new TextDecoder("ascii").decode(data);
    console.log("Response", response);
    if (!response.startsWith(this.WS_UPGRADE_RESPONSE)) {
      throw new Error(`Invalid handshake response: ${response}`)
    }
  }
}

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

  public chunks$: Observable<USBInTransferResult> = this.buildData$();


  buildData$(): Observable<USBInTransferResult> {

    return this.devices.getDevices$()
      .pipe(
        map(([first]) => first),
        filter((device) => !!device),
        map((device) => new LoupedeckDeviceAdapter(device)),
        switchMap((device) => device.init()),
        switchMap((device) => device.readData$()),
        tap(() => {
        }, (error) => {
          console.log(error)
        }),
        // retry up to 3 times if an error occurs.
        retry(3));
  }

  public decodeAsHex(data: DataView | undefined): string {
    return this.utf8ToHex((new TextDecoder().decode(data)));
  }

  async onDiscoverClicked(): Promise<void> {
    await this.devices.requestDevice()
  }

  async onForgetClicked(): Promise<void> {
    await this.devices.forgetAllDevices();
  }

  private utf8ToHex(str: string) {
    return Array.from(str).map(c =>
      c.charCodeAt(0) < 128 ? c.charCodeAt(0).toString(16) :
        encodeURIComponent(c).replace(/\%/g, '').toLowerCase()
    ).join('');
  }
}

