/**
 * ECP v1 Protocol Client
 * Handles communication with electrochemical workstation devices
 */

import {
  Frame,
  FrameHeader,
  MsgType,
  FrameFlags,
  NODE_ID_HOST,
  NODE_ID_DEVICE,
  ECP_VERSION_MAJOR,
  ECP_VERSION_MINOR,
  TlvType,
  ResultCode,
  ChannelConfig,
  DeviceInfo,
  DataFramePayload,
  DataFormat,
} from './types';
import { encodeFrameForUart, decodeFrameFromUart } from './frame';
import { TlvEncoder, TlvDecoder } from './tlv';

export interface ProtocolClientOptions {
  onDataFrame?: (data: DataFramePayload) => void;
  onEvent?: (eventData: any) => void;
  onError?: (error: Error) => void;
}

export class ProtocolClient {
  private msgIdCounter: number = 1;
  private seqCounter: number = 0;
  private pendingRequests: Map<number, (frame: Frame) => void> = new Map();
  private receiveBuffer: number[] = [];

  constructor(private options: ProtocolClientOptions = {}) {}

  // ========================================================================
  // Frame Creation Helpers
  // ========================================================================

  private createHeader(
    msgType: MsgType,
    flags: number,
    payloadLen: number,
    msgId?: number
  ): FrameHeader {
    const actualMsgId = msgId ?? this.msgIdCounter++;
    if (this.msgIdCounter > 0xFFFF) {
      this.msgIdCounter = 1;
    }

    return {
      magic: [0xEC, 0x50],
      verMajor: ECP_VERSION_MAJOR,
      verMinor: ECP_VERSION_MINOR,
      flags,
      src: NODE_ID_HOST,
      dst: NODE_ID_DEVICE,
      msgType,
      msgId: actualMsgId,
      seq: this.seqCounter++,
      payloadLen,
      headerCrc16: 0, // Will be calculated during encoding
    };
  }

  private createFrame(msgType: MsgType, payload: Uint8Array, flags: number = FrameFlags.ACK_REQ): Frame {
    return {
      header: this.createHeader(msgType, flags, payload.length),
      payload,
      frameCrc32: 0, // Will be calculated during encoding
    };
  }

  // ========================================================================
  // Send/Receive
  // ========================================================================

  encodeMessage(msgType: MsgType, payload: Uint8Array, flags: number = FrameFlags.ACK_REQ): Uint8Array {
    const frame = this.createFrame(msgType, payload, flags);
    return encodeFrameForUart(frame);
  }

  handleReceivedData(data: Uint8Array): void {
    // Add to receive buffer
    for (let i = 0; i < data.length; i++) {
      this.receiveBuffer.push(data[i]);

      // Check for frame delimiter (0x00)
      if (data[i] === 0x00) {
        this.processFrame();
      }
    }
  }

  private processFrame(): void {
    if (this.receiveBuffer.length === 0) {
      return;
    }

    try {
      const frameData = new Uint8Array(this.receiveBuffer);
      this.receiveBuffer = [];

      const frame = decodeFrameFromUart(frameData);
      this.handleFrame(frame);
    } catch (error) {
      if (this.options.onError) {
        this.options.onError(error as Error);
      }
    }
  }

  private handleFrame(frame: Frame): void {
    // Check if this is a response to a pending request
    if (frame.header.flags & FrameFlags.ACK) {
      const handler = this.pendingRequests.get(frame.header.msgId);
      if (handler) {
        this.pendingRequests.delete(frame.header.msgId);
        handler(frame);
        return;
      }
    }

    // Handle data frames and events
    switch (frame.header.msgType) {
      case MsgType.DATA_FRAME:
        this.handleDataFrame(frame);
        break;

      case MsgType.EVENT:
        this.handleEvent(frame);
        break;
    }
  }

  private handleDataFrame(frame: Frame): void {
    if (!this.options.onDataFrame) {
      return;
    }

    try {
      const payload = this.parseDataFramePayload(frame.payload);
      this.options.onDataFrame(payload);
    } catch (error) {
      if (this.options.onError) {
        this.options.onError(error as Error);
      }
    }
  }

  private handleEvent(frame: Frame): void {
    if (this.options.onEvent) {
      this.options.onEvent(frame.payload);
    }
  }

  private parseDataFramePayload(data: Uint8Array): DataFramePayload {
    let offset = 0;

    const streamId = data[offset++];
    const channelId = data[offset++];
    const signalId = data[offset] | (data[offset + 1] << 8);
    offset += 2;
    const format = data[offset++] as DataFormat;
    const unit = data[offset++];

    // Read timestamp (u64)
    const ts0_us = BigInt(
      data[offset] |
      (data[offset + 1] << 8) |
      (data[offset + 2] << 16) |
      (data[offset + 3] << 24)
    ) | (BigInt(
      data[offset + 4] |
      (data[offset + 5] << 8) |
      (data[offset + 6] << 16) |
      (data[offset + 7] << 24)
    ) << 32n);
    offset += 8;

    const dt_us = data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
    offset += 4;

    const n = data[offset] | (data[offset + 1] << 8);
    offset += 2;

    // Parse samples based on format
    const samples: number[] = [];
    for (let i = 0; i < n; i++) {
      switch (format) {
        case DataFormat.U16_RAW_ADC:
          samples.push(data[offset] | (data[offset + 1] << 8));
          offset += 2;
          break;

        case DataFormat.I16: {
          const value = data[offset] | (data[offset + 1] << 8);
          samples.push(value >= 0x8000 ? value - 0x10000 : value);
          offset += 2;
          break;
        }

        case DataFormat.I32: {
          const value = data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
          samples.push(value);
          offset += 4;
          break;
        }

        case DataFormat.F32: {
          const floatView = new Float32Array(data.buffer.slice(data.byteOffset + offset, data.byteOffset + offset + 4));
          samples.push(floatView[0]);
          offset += 4;
          break;
        }
      }
    }

    return {
      streamId,
      channelId,
      signalId,
      format,
      unit,
      ts0_us,
      dt_us,
      n,
      samples,
    };
  }

  // ========================================================================
  // Protocol Commands
  // ========================================================================

  async sendHello(): Promise<DeviceInfo> {
    const encoder = new TlvEncoder();
    encoder.writeU16(TlvType.MAX_PAYLOAD, 1024);

    const payload = encoder.build();
    const message = this.encodeMessage(MsgType.HELLO_REQ, payload);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(this.msgIdCounter - 1);
        reject(new Error('Hello timeout'));
      }, 3000);

      this.pendingRequests.set(this.msgIdCounter - 1, (frame) => {
        clearTimeout(timeout);

        try {
          const decoder = new TlvDecoder(frame.payload);
          const deviceInfo: DeviceInfo = {
            deviceId: '',
            fwVersion: '',
            capBits: 0,
            maxPayload: 0,
          };

          while (decoder.hasMore()) {
            const tlv = decoder.readNext();
            if (!tlv) break;

            switch (tlv.type) {
              case TlvType.DEVICE_ID:
                deviceInfo.deviceId = decoder.readString(tlv);
                break;
              case TlvType.FW_VERSION:
                deviceInfo.fwVersion = decoder.readString(tlv);
                break;
              case TlvType.CAP_BITS:
                deviceInfo.capBits = decoder.readU32(tlv);
                break;
              case TlvType.MAX_PAYLOAD:
                deviceInfo.maxPayload = decoder.readU16(tlv);
                break;
            }
          }

          resolve(deviceInfo);
        } catch (error) {
          reject(error);
        }
      });

      // Note: actual sending is done by the transport layer
      // This method just prepares the message
    });
  }

  createConfigChannelMessage(config: ChannelConfig): Uint8Array {
    const encoder = new TlvEncoder();
    encoder.writeU8(TlvType.CHANNEL_ID, config.channelId);

    if (config.modeId !== undefined) {
      encoder.writeU8(TlvType.MODE_ID, config.modeId);
    }
    if (config.pgaGain !== undefined) {
      encoder.writeU8(TlvType.PGA_GAIN, config.pgaGain);
    }
    if (config.rtiaOhm !== undefined) {
      encoder.writeU32(TlvType.RTIA_OHM, config.rtiaOhm);
    }
    if (config.adcRateSps !== undefined) {
      encoder.writeU32(TlvType.ADC_RATE_SPS, config.adcRateSps);
    }
    if (config.biasVoltF32 !== undefined) {
      encoder.writeF32(TlvType.BIAS_VOLT_F32, config.biasVoltF32);
    }
    if (config.filterCfg !== undefined) {
      encoder.writeBytes(TlvType.FILTER_CFG, config.filterCfg);
    }

    const payload = encoder.build();
    return this.encodeMessage(MsgType.CFG_CHANNEL_REQ, payload);
  }

  createStartMeasurementMessage(
    channelId: number,
    streamId?: number,
    signalId?: number,
    durationMs?: number
  ): Uint8Array {
    const encoder = new TlvEncoder();
    encoder.writeU8(TlvType.CHANNEL_ID, channelId);

    if (streamId !== undefined) {
      encoder.writeU8(TlvType.STREAM_ID, streamId);
    }
    if (signalId !== undefined) {
      encoder.writeU16(TlvType.SIGNAL_ID, signalId);
    }
    if (durationMs !== undefined) {
      encoder.writeU32(TlvType.DURATION_MS, durationMs);
    }

    const payload = encoder.build();
    return this.encodeMessage(MsgType.START_MEAS_REQ, payload);
  }

  createStopMeasurementMessage(channelId?: number): Uint8Array {
    const encoder = new TlvEncoder();

    if (channelId !== undefined) {
      encoder.writeU8(TlvType.CHANNEL_ID, channelId);
    }

    const payload = encoder.build();
    return this.encodeMessage(MsgType.STOP_MEAS_REQ, payload);
  }
}
