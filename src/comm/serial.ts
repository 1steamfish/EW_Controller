/**
 * WebSerial communication handler
 * Provides interface to communicate with electrochemical workstation via serial port
 */

import { ProtocolClient, ProtocolClientOptions } from '../protocol/client';

export class SerialCommunication {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private protocolClient: ProtocolClient;
  private isReading: boolean = false;

  constructor(options: ProtocolClientOptions = {}) {
    this.protocolClient = new ProtocolClient(options);
  }

  async connect(): Promise<void> {
    if (!('serial' in navigator)) {
      throw new Error('Web Serial API not supported in this browser');
    }

    try {
      // Request port from user
      this.port = await (navigator as any).serial.requestPort();

      // Open port with default settings for electrochemical workstation
      await this.port.open({
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none',
      });

      // Get reader and writer
      if (this.port.readable) {
        this.reader = this.port.readable.getReader();
      }
      if (this.port.writable) {
        this.writer = this.port.writable.getWriter();
      }

      // Start reading
      this.startReading();
    } catch (error) {
      throw new Error(`Failed to connect: ${error}`);
    }
  }

  async disconnect(): Promise<void> {
    this.isReading = false;

    if (this.reader) {
      await this.reader.cancel();
      this.reader.releaseLock();
      this.reader = null;
    }

    if (this.writer) {
      await this.writer.close();
      this.writer.releaseLock();
      this.writer = null;
    }

    if (this.port) {
      await this.port.close();
      this.port = null;
    }
  }

  private async startReading(): Promise<void> {
    if (!this.reader) {
      return;
    }

    this.isReading = true;

    try {
      while (this.isReading && this.reader) {
        const { value, done } = await this.reader.read();

        if (done) {
          break;
        }

        if (value) {
          this.protocolClient.handleReceivedData(value);
        }
      }
    } catch (error) {
      console.error('Error reading from serial port:', error);
    }
  }

  async send(data: Uint8Array): Promise<void> {
    if (!this.writer) {
      throw new Error('Serial port not connected');
    }

    await this.writer.write(data);
  }

  getProtocolClient(): ProtocolClient {
    return this.protocolClient;
  }

  isConnected(): boolean {
    return this.port !== null && this.port.readable !== null;
  }
}
