import {BehaviorSubject, fromEvent, merge, Observable, of, switchMap} from "rxjs";

abstract class Devices {
  reloadList$ = new BehaviorSubject<void>(undefined);
  abstract getVendorId(): number;
  constructor() {
  }

  /**
   * Returns the list of requested devices
   */
  private async getAllDevices(){
    return await navigator.usb.getDevices();
  }

  async getDevices(): Promise<USBDevice[]> {
    const allDevices = await this.getAllDevices();
    return allDevices.filter((device)=> device.vendorId === this.getVendorId())
  }

  async requestDevice(): Promise<USBDevice> {
    const requestedDevice = await navigator.usb.requestDevice({filters: [{vendorId: this.getVendorId()}]});
    this.reloadList();
    return requestedDevice;
  }

  async forgetAllDevices(): Promise<void>{
    const devices = await this.getDevices();
    await Promise.all(devices.map((device)=> device.forget()));
    this.reloadList();
  }

  private reloadList() {
    this.reloadList$.next();
  }

  deviceConnected$(): Observable<USBConnectionEvent>{
    return fromEvent<USBConnectionEvent>(navigator.usb,"connect")
  }

  deviceDisconnected$(): Observable<USBConnectionEvent>{
    return fromEvent<USBConnectionEvent>(navigator.usb,"disconnect")
  }


  getDevices$(): Observable<USBDevice[]> {
    return merge(this.deviceConnected$(), this.deviceDisconnected$(), this.reloadList$).pipe(switchMap(()=>this.getDevices()))
  }

}

export class LoupedeckDevices extends Devices{
  getVendorId(): number {
    return 0x2ec2;
  }

}
