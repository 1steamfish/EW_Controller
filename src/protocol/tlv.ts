/**
 * TLV (Type-Length-Value) encoding/decoding utilities
 */

import { Tlv, TlvType } from './types';

// ============================================================================
// TLV Encoding
// ============================================================================

export class TlvEncoder {
  private buffers: Uint8Array[] = [];

  writeU8(type: TlvType, value: number): this {
    const buffer = new Uint8Array(4); // T(1) + L(2) + V(1)
    buffer[0] = type;
    buffer[1] = 1; // length low byte
    buffer[2] = 0; // length high byte
    buffer[3] = value & 0xFF;
    this.buffers.push(buffer);
    return this;
  }

  writeU16(type: TlvType, value: number): this {
    const buffer = new Uint8Array(5); // T(1) + L(2) + V(2)
    buffer[0] = type;
    buffer[1] = 2; // length low byte
    buffer[2] = 0; // length high byte
    buffer[3] = value & 0xFF;
    buffer[4] = (value >> 8) & 0xFF;
    this.buffers.push(buffer);
    return this;
  }

  writeU32(type: TlvType, value: number): this {
    const buffer = new Uint8Array(7); // T(1) + L(2) + V(4)
    buffer[0] = type;
    buffer[1] = 4; // length low byte
    buffer[2] = 0; // length high byte
    buffer[3] = value & 0xFF;
    buffer[4] = (value >> 8) & 0xFF;
    buffer[5] = (value >> 16) & 0xFF;
    buffer[6] = (value >> 24) & 0xFF;
    this.buffers.push(buffer);
    return this;
  }

  writeF32(type: TlvType, value: number): this {
    const buffer = new Uint8Array(7); // T(1) + L(2) + V(4)
    buffer[0] = type;
    buffer[1] = 4; // length low byte
    buffer[2] = 0; // length high byte

    const floatView = new Float32Array([value]);
    const byteView = new Uint8Array(floatView.buffer);
    buffer[3] = byteView[0];
    buffer[4] = byteView[1];
    buffer[5] = byteView[2];
    buffer[6] = byteView[3];

    this.buffers.push(buffer);
    return this;
  }

  writeString(type: TlvType, value: string): this {
    const encoder = new TextEncoder();
    const valueBytes = encoder.encode(value);

    const buffer = new Uint8Array(3 + valueBytes.length); // T(1) + L(2) + V
    buffer[0] = type;
    buffer[1] = valueBytes.length & 0xFF;
    buffer[2] = (valueBytes.length >> 8) & 0xFF;
    buffer.set(valueBytes, 3);

    this.buffers.push(buffer);
    return this;
  }

  writeBytes(type: TlvType, value: Uint8Array): this {
    const buffer = new Uint8Array(3 + value.length); // T(1) + L(2) + V
    buffer[0] = type;
    buffer[1] = value.length & 0xFF;
    buffer[2] = (value.length >> 8) & 0xFF;
    buffer.set(value, 3);

    this.buffers.push(buffer);
    return this;
  }

  build(): Uint8Array {
    const totalLength = this.buffers.reduce((sum, buf) => sum + buf.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;

    for (const buf of this.buffers) {
      result.set(buf, offset);
      offset += buf.length;
    }

    return result;
  }
}

// ============================================================================
// TLV Decoding
// ============================================================================

export class TlvDecoder {
  private offset: number = 0;

  constructor(private data: Uint8Array) {}

  hasMore(): boolean {
    return this.offset < this.data.length;
  }

  readNext(): Tlv | null {
    if (!this.hasMore()) {
      return null;
    }

    const type = this.data[this.offset];
    const length = this.data[this.offset + 1] | (this.data[this.offset + 2] << 8);
    const value = this.data.slice(this.offset + 3, this.offset + 3 + length);

    this.offset += 3 + length;

    return { type, length, value };
  }

  readU8(tlv: Tlv): number {
    if (tlv.value.length !== 1) {
      throw new Error('Invalid U8 TLV length');
    }
    return tlv.value[0];
  }

  readU16(tlv: Tlv): number {
    if (tlv.value.length !== 2) {
      throw new Error('Invalid U16 TLV length');
    }
    return tlv.value[0] | (tlv.value[1] << 8);
  }

  readU32(tlv: Tlv): number {
    if (tlv.value.length !== 4) {
      throw new Error('Invalid U32 TLV length');
    }
    return (
      tlv.value[0] |
      (tlv.value[1] << 8) |
      (tlv.value[2] << 16) |
      (tlv.value[3] << 24)
    ) >>> 0;
  }

  readF32(tlv: Tlv): number {
    if (tlv.value.length !== 4) {
      throw new Error('Invalid F32 TLV length');
    }
    const floatView = new Float32Array(tlv.value.buffer.slice(tlv.value.byteOffset, tlv.value.byteOffset + 4));
    return floatView[0];
  }

  readString(tlv: Tlv): string {
    const decoder = new TextDecoder();
    return decoder.decode(tlv.value);
  }

  readBytes(tlv: Tlv): Uint8Array {
    return tlv.value;
  }
}
