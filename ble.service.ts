import { Injectable } from '@angular/core';
import { OnDestroy, OnInit } from '@angular/core';
import { Platform, ToastController } from '@ionic/angular';
import { Device } from '@capacitor/device';
import { BluetoothLE  } from '@awesome-cordova-plugins/bluetooth-le/ngx';
import { BehaviorSubject } from 'rxjs';

import { SHA256, AES, enc } from 'crypto-js';


interface DiscoveredDevice {
  address: string;
  name?: string;
  isConnected?: boolean;
  connectedThisSession?: boolean;
  lastConnectedTime?: any;
}



@Injectable({
  providedIn: 'root'
})
export class BleService implements OnInit, OnDestroy {


  deviceInfo: any = null;
  serviceUUID: string = '';
  characteristicUUID: string = '';

  textMessage: string = '';

  services: any = null;
  subscription: any = null;
  scanSubscription: any = null;
  isAdvertising: boolean = false;
  isAdvertising$ = new BehaviorSubject<boolean>(false);
  discoveredDevices: Array<DiscoveredDevice> = [];
  discoveredDevices$ = new BehaviorSubject<Array<any>>([]);
  syncedDevices: Array<any> = [];
  syncedDevices$ = new BehaviorSubject<Array<any>>([]);
  dataReceived: Array<any> = [];
  dataReceived$ = new BehaviorSubject<Array<any>>([]);

  dataToReadCharacteristicUUID: string = '';
  dataToWriteCharacteristicUUID: string = '';

  connectedDevice: any = null;
  valueToWrite: string = '';
  isConnected: boolean = false;
  hasConnected: boolean = false;
  writeError: boolean = false;

  private MAX_BYTES_PER_PARCEL:number = 20;
  private MAX_PACKET_NUMBER:number = 9999;

  bufferText:string = '';
  bufferHash:string = '';
  bufferTimestamp:any = null;
  BLEbuffer:any = [];
  bufferLog:any = [];
  transferCompleted:boolean = true;
  secretKey = '649ee847-835c-493a-8139-a2bed251bf25';
  receivedParcelQty:number = 0;

  parcelSize:number = this.MAX_BYTES_PER_PARCEL - 4; // 4 bytes reserved for parcel number
  parcels:any = [];
  encodedParcels:any = '';
  JSONencodedParcels:string = '';


  constructor(
    private platform: Platform,
    private bluetoothle: BluetoothLE,
    private toastCtrl: ToastController
  ) { }


  async ngOnInit() {
    this.platform.ready().then(() => {
      this.checkPermissions();
      this.init();


      this.syncedDevices = [
        {
          id: 1,
          address: '00:11:22:33:44:55',
          name: 'Device 1',
          connected: false,
          connectedThisSession: false,
          lastConnectedTime: null
        },
        {
          id: 2,
          address: '66:77:88:99:AA:BB',
          name: 'Device 2',
          connected: false,
          connectedThisSession: false,
          lastConnectedTime: null
        },
        {
          id: 3,
          address: 'CC:DD:EE:FF:GG:HH',
          name: 'Device 3',
          connected: false,
          connectedThisSession: false,
          lastConnectedTime: null
        }
      ];
      this.syncedDevices$.next(this.syncedDevices);
    });
  }

  async init() {
    this.deviceInfo = await Device.getInfo();

    this.serviceUUID = 'ACACFC5A-0E91-445A-B6C3-9653814EA776';
    this.characteristicUUID = 'ACACFC5B-0E91-445A-B6C3-9653814EA776';

    this.dataToReadCharacteristicUUID = 'ACACFC5C-0E91-445A-B6C3-9653814EA776';
    this.dataToWriteCharacteristicUUID = 'ACACFC5D-0E91-445A-B6C3-9653814EA776';

    this.bluetoothle.initialize({
      request: true,
      statusReceiver: false,
      restoreKey: "bluetoothleplugin"
    }).subscribe(async (data: any) => {
      console.log('initialize success: ', data);
      //await this.checkInitialization();
    }, async (error: any) => {
      console.error('initialize error: ', error.message);
    });
  }



  async initializePeripheral() {
    this.bluetoothle.initializePeripheral({ request: true, "restoreKey": "bluetoothleplugin" }).subscribe(async (data: any) => {
      console.log('BLE data stream: ', data);
      if (data.status === 'writeRequested' && data.value != '') {

        await this.receivePackage(data.value);

        // probably superfluous
        this.dataReceived.push({
          name: data.name,
          address: data.address,
          text: this.textMessage
        });
        this.dataReceived$.next(this.dataReceived);

      } else if (data.status === 'readRequested') {
        let text = '"networks":[{"network":[{"ssid":"FiOS-EXNOY","algorithm":"WPA","password":"malt0804dad7848set","isHiddenSSID":"false"}],"connected": true},{"network":[{"ssid":"SomeOtherWifi","algorithm":"WPA","password":"awifipasswordhere","isHiddenSSID":"false"}],"connected": true},{"network":[{"ssid":"Netgear","algorithm":"WPA","password":"casd2121xaasax141231t","isHiddenSSID":"false"}],"connected": false}]';
        let value = await this.encodeText(text);
        let params = {
          requestId: data.requestId,
          address: data.address,
          value: value
        };
        this.bluetoothle.respond(params).then((success) => {
          console.log('read respond: ', success);
        }, (error) => {
          console.error('respond error', error.message);
        }).catch();
      }

    }, async (error: any) => {
      console.error('initializePeripheral error: ', error.message);
    });
  }



  async checkPermissions(){
    let adapterInfo = await this.bluetoothle.getAdapterInfo();
    console.log('adapter info: ' + JSON.stringify(adapterInfo));
    let hasPermission = await this.bluetoothle.hasPermission();
    console.log('hasPermission: ' + JSON.stringify(hasPermission));

    if(!hasPermission.hasPermission) {
      await this.bluetoothle.requestPermission().then((success: any) => {
          console.log('requestPermission: ' + JSON.stringify(success));
      });
    }

    let hasPermissionBtAdvertise = await this.bluetoothle.hasPermissionBtAdvertise();
    console.log('hasPermissionBtAdvertise: ' + JSON.stringify(hasPermissionBtAdvertise));
    if(!hasPermissionBtAdvertise.hasPermission) {
      await this.bluetoothle.requestPermissionBtAdvertise().then((success: any) => {
        console.log('requestPermissionAdvertise: ' + JSON.stringify(success));
      });
      hasPermissionBtAdvertise = await this.bluetoothle.hasPermissionBtAdvertise();
      console.log('hasPermissionBtAdvertise: ' + JSON.stringify(hasPermissionBtAdvertise));
    }

    let hasPermissionBtConnect = await this.bluetoothle.hasPermissionBtConnect();
    console.log('hasPermissionBtConnect: ' + JSON.stringify(hasPermissionBtConnect));
    if(!hasPermissionBtConnect.hasPermission) {
      await this.bluetoothle.requestPermissionBtConnect().then((success: any) => {
        console.log('requestPermissionBtConnect: ' + JSON.stringify(success));
      });
      hasPermissionBtConnect = await this.bluetoothle.hasPermissionBtConnect();
      console.log('hasPermissionBtConnect: ' + JSON.stringify(hasPermissionBtConnect));
    }

    let hasPermissionBtScan = await this.bluetoothle.hasPermissionBtScan();
    console.log('hasPermissionBtScan: ' + JSON.stringify(hasPermissionBtScan));
    if(!hasPermissionBtScan.hasPermission) {
      await this.bluetoothle.requestPermissionBtScan().then((success: any) => {
        console.log('requestPermissionBtScan: ' + JSON.stringify(success));
      });
      hasPermissionBtScan = await this.bluetoothle.hasPermissionBtScan();
      console.log('hasPermissionBtScan: ' + JSON.stringify(hasPermissionBtScan));
    }
  }

  async checkInitialization() {
    let isInitialized = await this.bluetoothle.isInitialized().then(async (data) => {
      console.log('isInitialized: ' + JSON.stringify(data));
      console.log(data.isInitialized);
    });
    console.log('isInitialized: ' + JSON.stringify(isInitialized));
    return isInitialized;
  }


  async updateSyncedDeviceAddress(deviceId:any, newAddress:any) {
    let index = this.syncedDevices.findIndex(d => d.id === deviceId);
    if (index >= 0) {
      this.syncedDevices[index].address = newAddress;
      return this.syncedDevices$.next(this.syncedDevices);
    }
  }




  async addService(){
    await this.bluetoothle.addService({
      "service": this.serviceUUID,
      "characteristics": [
          {
              "uuid": this.dataToReadCharacteristicUUID,
              "properties": {
                read: true,
                notify: true,
              },
              "permissions": {
                read: true,
              }
          },
          {
              "uuid": this.dataToWriteCharacteristicUUID,
              "properties": {
                write: true,
                indicate: true,
                writeWithoutResponse: true,
                writeNoResponse: true
              },
              "permissions": {
                read: true,
                write: true
              }
          }

        ]
    }).then((data:any) => {
      console.log('addService success: ' , data);
    }, (error:any) => {
      console.error('addService error: ' , error.message);
    });
  }

  async toggleAdvertising() {
    if (!this.isAdvertising) {
        let params = {
          services: [this.serviceUUID],
          service: this.serviceUUID,
          name: this.deviceInfo.name,
          includeDeviceName: false,
          includeTxPowerLevel: false,
          connectable: true,
          timeout: 0
        };
        await this.bluetoothle.startAdvertising(params).then((data:any) => {
            console.log('startAdvertising success: ' , data)
          }, (error:any) => {
            console.error('startAdvertising error: ' , error.message)
        });
        this.isAdvertising = true;
    } else {
        await this.bluetoothle.stopAdvertising();
        this.isAdvertising = false;
    }
  }





  async retrievePairedDevices(){
    this.bluetoothle.retrieveConnected().then(async (data: any) => {
        console.log('paired devices: ', data);
        let msg = 'paired devices: ' + JSON.stringify(data);
        await this.presentToast(msg);
    }, async (error) => {
      console.error('retrieveConnected: ', error);
      await this.presentToast(error.msg, 'middle');

    });
  }




  // scan for devices
  async startScan() {

    if(this.scanSubscription) {
      await this.stopScan();
    }

    let old_results = this.discoveredDevices;
    this.discoveredDevices = [];
    this.discoveredDevices$.next(this.discoveredDevices);
    this.scanSubscription = this.bluetoothle.startScan({
      services: [this.serviceUUID],
      allowDuplicates: false,
      scanMode: this.bluetoothle.SCAN_MODE_LOW_LATENCY,
      matchMode: this.bluetoothle.MATCH_MODE_AGGRESSIVE,
      matchNum: this.bluetoothle.MATCH_NUM_MAX_ADVERTISEMENT,
      callbackType: this.bluetoothle.CALLBACK_TYPE_ALL_MATCHES
    }).subscribe(async (scanData) => {
      console.log('startScan success: ', scanData);
      //let msg = 'startScan success: ' + JSON.stringify(scanData);
      //await this.presentToast(msg);

      if (scanData.status === 'scanResult') {
        //cycle through discovered devices and check if it's already in the array
        //if it is, don't add it again

        let original = true;
        for(let discoveredDevice of this.discoveredDevices) {
          if(discoveredDevice.address === scanData.address){
            original = false;
            break;
          }
        }
        if (original === true) {
          this.discoveredDevices.push(scanData);
          this.discoveredDevices$.next(this.discoveredDevices);

          //check if device is present in prior list of synced devices (old_results)

          for(let old_result of old_results) { //cycle through old results
            if(old_result.address === scanData.address){ //if the old result matches the new result
              //if it is, update the session connected status in the new list to whatever it was in the old list
              let index = this.discoveredDevices.findIndex(d => d.address === scanData.address);
              if (index >= 0) {
                this.discoveredDevices[index].connectedThisSession = old_result.connectedThisSession;
                this.discoveredDevices[index].isConnected = old_result.isConnected;
                this.discoveredDevices$.next(this.discoveredDevices);
              }
              break;
            }
          }


        }
      } else if (scanData.status === 'scanStarted') {
          console.log('scan started');
      } else if (scanData.status === 'scanStopped') {
          console.log('scan stopped');
      }
      console.log('scanData: ' , scanData);
      console.log('this.discoveredDevices: ' ,  this.discoveredDevices);


    }, async (error) => {

      console.error('startScan error: ', error);
      let msg = 'startScan error: ' + JSON.stringify(error);
      await this.presentToast(msg);
    });
  }




  async stopScan() {
    this.bluetoothle.stopScan().then(data => {
        console.log(data);
        this.subscription.unsubscribe();
    });
  }


  async connectOrReconnectDevice(device: any) {
    console.log('connect to: ', device);
    let index = this.discoveredDevices.findIndex(d => d.address === device.address);
    if (index >= 0) {
      let address = device.address;
      if(this.discoveredDevices[index].isConnected === true){
        // do nothing
        console.log('already connected to this device');
        await this.presentToast('already connected to this device');
      }
      else if(this.discoveredDevices[index].connectedThisSession === true) {
        //connect via reconnect
        console.log('previously connected to this device');
        this.bluetoothle.reconnect({ address }).subscribe(async data => {
          await this.handleConnectionResult(data);
        });
      } else {
        //connect via connect
        console.log('never connected to this device');
        this.bluetoothle.connect({ address }).subscribe(async data => {
          await this.handleConnectionResult(data);
        });
      }
    }
  }

  async handleConnectionResult(data:any) {
    if (data.status === 'connected') {
      this.isConnected = true;
      this.connectedDevice = data;

      let index = this.discoveredDevices.findIndex(d => d.address === data.address);
      if (index >= 0) {
        this.discoveredDevices[index].connectedThisSession = true;
        this.discoveredDevices[index].isConnected = true;
        this.discoveredDevices$.next(this.discoveredDevices);
      }

      this.bluetoothle.discover({ address: data.address }).then(discoveryData => {
        console.log('discoveryData: ', discoveryData);
        if (discoveryData.status === 'discovered') {
          this.services = discoveryData.services;
          console.log('services' , this.services);
        }
      });
    } else if (data.status === 'disconnected') {

      let index = this.discoveredDevices.findIndex(d => d.address === data.address);
      if (index >= 0) {
        this.discoveredDevices[index].connectedThisSession = true;
        this.discoveredDevices[index].isConnected = false;
        this.discoveredDevices$.next(this.discoveredDevices);
      }
    }
  }










  async writeValue() {


    let parcels = await this.packageData(this.valueToWrite);
    this.encodedParcels = parcels;
    this.JSONencodedParcels = JSON.stringify(this.encodedParcels);
    console.log(parcels);

    parcels.forEach(async parcel => {
        // Call your method here, passing in the parcel as a parameter
        this.bluetoothle.write({
          address: this.connectedDevice.address,
          service: this.serviceUUID,
          characteristic: this.dataToWriteCharacteristicUUID,
          value: parcel,
          type: 'noResponse'
        }).then(async output => {
          console.log('write output: ', output);
          let msg = 'write output: ' + JSON.stringify(output);
          this.presentToast(msg);
        }, async error => {
          console.error(error);
          this.presentToast(error.msg, 'middle');
        });
        console.log('parcel: ' , parcel);
    });
  }



  async readValue(device:any) {
    this.bluetoothle.read({
        address: device.address,
        service: this.serviceUUID,
        characteristic: this.dataToReadCharacteristicUUID
    }).then(async data => {
      console.log(data);
      if(data.status === 'read'){
        let val = data.value;
        this.textMessage = this.bluetoothle.bytesToString(this.bluetoothle.encodedStringToBytes(data.value));
        console.log(this.textMessage);
        this.presentToast(this.textMessage);
        this.dataReceived.push({
          name: data.name,
          address: data.address,
          text: this.textMessage
        });
        this.dataReceived$.next(this.dataReceived);
      }
    }, async error => {
      console.error(error);
      this.presentToast(error, 'middle');
    });

  }









  async packageData(text:string){
    let current_time = Math.floor(Date.now() / 1000);

    //encrypt
    //text = await this.encryptText(text);

    let signature_text = text + current_time.toString();
    let sha265_hash = await this.createSHA256Hash(signature_text);
    let parcels = await this.divideCorpusIntoParcels(text, sha265_hash);

    let packageQty = parcels.length + 1;
    let headerInfo = '0001p:' + packageQty + ',' + current_time;
    let encodedHeader = await this.encodeText(headerInfo);
    parcels.unshift(encodedHeader);

    await this.storePackage(this.deviceInfo.id, current_time, parcels);
    console.log('this.parcels', this.parcels);

    return parcels;

  }



  async storePackage(device_uuid: string, current_time: number, parcels: any) {
    let deviceExists = false;
    for (let i = 0; i < this.parcels.length; i++) {
      if (this.parcels[i].hasOwnProperty(device_uuid)) {
        this.parcels[i][device_uuid].parcels.push({
          'current_time': current_time,
          'parcels': [parcels]
        });
        deviceExists = true;
        break;
      }
    }
    if (!deviceExists) {
      const receivedPackage:any = {};
      receivedPackage[device_uuid] = {
        'current_time': current_time,
        'parcels': [parcels]
      };
      this.parcels.push(receivedPackage);
    }
  }



  async encodeText(string:string){
    let bytes = this.bluetoothle.stringToBytes(string);
    return this.bluetoothle.bytesToEncodedString(bytes);
    //return await this.bluetoothle.encodeUnicode(string);
  }



  async decodeText(encodedString:string){
    let bytes = this.bluetoothle.encodedStringToBytes(encodedString);
    return this.bluetoothle.bytesToString(bytes);
    //return await this.bluetoothle.decodeUnicode(encodedString);
  }


  async encryptText(string:string){
    // Encrypt the data using the PSK
    return AES.encrypt(string, this.secretKey).toString();
  }

  async decryptText(string:string){
    return AES.decrypt(string, this.secretKey).toString(enc.Utf8);
  }

  async createSHA256Hash(string:string){
    return SHA256(string).toString();
  }




  async divideCorpusIntoParcels(corpus: string, hash:string){
    let parcels = [];
    let parcelNumber = 2;

    while (corpus.length > 0) {
      let parcel = corpus.substring(0, this.parcelSize - 1);
      parcel = parcelNumber.toString().padStart(4, '0') + parcel;
      //console.log('corpus parcel: ', parcel);
      let bytes = this.bluetoothle.stringToBytes(parcel);
      let encodedParcel = this.bluetoothle.bytesToEncodedString(bytes);
      parcels.push(encodedParcel);

      corpus = corpus.substring(this.parcelSize - 1);
      //console.log('remaining corpus: ', corpus);
      parcelNumber++;
    }

    //console.log('parcelNumber: ', parcelNumber);
    //console.log('hash.length: ', hash.length);

    while (hash.length > 0) {
      let parcel = hash.substring(0, this.parcelSize - 1);
      parcel = parcelNumber.toString().padStart(4, '0') + parcel;
      //console.log('hash parcel: ', parcel);
      let bytes = this.bluetoothle.stringToBytes(parcel);
      let encodedParcel = this.bluetoothle.bytesToEncodedString(bytes);
      parcels.push(encodedParcel);

      hash = hash.substring(this.parcelSize - 1);
      parcelNumber++;
    }
    return parcels;
  }



  async receivePackage(receivedParcel:string){
    //console.log('receivedParcel: ' , receivedParcel);
    let receivedParcelQty:any = 0;
    let decodedParcel = await this.decodeText(receivedParcel);
    console.log(decodedParcel);

    //first four are digits then it's a proper message
    //if the message is number 1 it's got the package size and timestamp
    //otherwise, add to current buffer string until current packet count is complete or 1 second for each packet has passed
    // if the latter, check inventory of packets and resend the missing one(s)
    // when completed, assemble final string and echo
    if (decodedParcel.substring(0, 4).match(/^\d+$/)) {

      // start function that waits five seconds and fires sync / no await

      let parcelId = decodedParcel.substring(0, 4);
      let parcelData = decodedParcel.substring(4);
      //console.log('parcelId', parcelId);
      //console.log('parcelData', parcelData);

      if (parcelId === "0001") {
        this.bufferText = '';
        let parts = parcelData.split(",");
        this.bufferTimestamp = parts[1];
        console.log('bufferTimestamp: ', this.bufferTimestamp);
        //console.log('parts[0]: ', parts[0]);

        this.receivedParcelQty = parseInt(parts[0].substring(2));
        console.log('receivedParcelQty: ', this.receivedParcelQty)
        this.BLEbuffer.push({
          parcelId: parcelId,
          timestamp: this.bufferTimestamp,
          parcels: this.receivedParcelQty
        });
      }
      else if (parseInt(parcelId) <= this.receivedParcelQty){
        //console.log('added to array');
        this.BLEbuffer.push({
          parcelId: parcelId,
          parcelData: parcelData
        });
        this.bufferText = this.bufferText + parcelData;
      }

      console.log(this.bufferText);
      if (parseInt(parcelId) === this.receivedParcelQty) {
        this.transferCompleted = true;

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        const bytes = encoder.encode(this.bufferText);
        const last64bytes = bytes.slice(-64);
        const allBefore = bytes.slice(0,-64);

        this.bufferHash = decoder.decode(last64bytes);
        this.bufferText = decoder.decode(allBefore);

        console.log('this.bufferText: ' , this.bufferText);
        console.log('this.bufferHash: ' , this.bufferHash);

        let verified = await this.verifyHash(this.bufferText, this.bufferTimestamp, this.bufferHash);
        console.log('verified' , verified);
        if(verified){
          //console.log('...decrypting bufferText...');
          //this.bufferText = await this.decryptText(this.bufferText);
          //console.log('this.bufferText: ' , this.bufferText);
        }
      }
    } else {
      console.error('Did not start with a number: ' , decodedParcel);
    }

  }


  async verifyHash(text:string, stamp:number, hash:string){
    let corpus = text + stamp.toString();
    let newHash = await this.createSHA256Hash(corpus);
    if(hash === newHash) {
      return true;
    } else {
      return false;
    }
  }









  async presentToast(msg:string, position?: 'top' | 'middle' | 'bottom') {
    position = (position ? position : 'bottom');
    const toast = await this.toastCtrl.create({
      message: msg,
      duration: 1500,
      position: position
    });
    await toast.present();
  }




  //
  // REPLACE
  //
  ngOnDestroy(): void {
    throw new Error('Method not implemented.');
  }

}
