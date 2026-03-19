/**
 * ECP v1 Frame Encoder/Decoder
 */

import { crc16CcittFalse, crc32IsoHdlc } from './crc';
import { cobsEncode, cobsDecode } from './cobs';
import {
  Frame,
  FrameHeader,
  FragmentHeader,
  ECP_MAGIC,
  ECP_VERSION_MAJOR,
  ECP_VERSION_MINOR,
  HEADER_SIZE,
} from './types';

// ============================================================================
// Utility functions for binary data
// ============================================================================

function writeU8(buffer: Uint8Array, offset: number, value: number): number {
  buffer[offset] = value & 0xFF;
  return offset + 1;
}

function writeU16LE(buffer: Uint8Array, offset: number, value: number): number {
  buffer[offset] = value & 0xFF;
  buffer[offset + 1] = (value >> 8) & 0xFF;
  return offset + 2;
}

function writeU32LE(buffer: Uint8Array, offset: number, value: number): number {
  buffer[offset] = value & 0xFF;
  buffer[offset + 1] = (value >> 8) & 0xFF;
  buffer[offset + 2] = (value >> 16) & 0xFF;
  buffer[offset + 3] = (value >> 24) & 0xFF;
  return offset + 4;
}

function readU8(buffer: Uint8Array, offset: number): number {
  return buffer[offset];
}

function readU16LE(buffer: Uint8Array, offset: number): number {
  return buffer[offset] | (buffer[offset + 1] << 8);
}

function readU32LE(buffer: Uint8Array, offset: number): number {
  return (
    buffer[offset] |
    (buffer[offset + 1] << 8) |
    (buffer[offset + 2] << 16) |
    (buffer[offset + 3] << 24)
  ) >>> 0;
}

// ============================================================================
// Frame Encoder
// ============================================================================

export function encodeFrame(frame: Frame): Uint8Array {
  // Calculate total size
  const fragmentHeaderSize = frame.fragmentHeader ? 4 : 0;
  const totalSize = HEADER_SIZE + fragmentHeaderSize + frame.payload.length + 4; // +4 for CRC32

  const buffer = new Uint8Array(totalSize);
  let offset = 0;

  // Write header
  offset = writeU8(buffer, offset, ECP_MAGIC[0]);
  offset = writeU8(buffer, offset, ECP_MAGIC[1]);
  offset = writeU8(buffer, offset, frame.header.verMajor);
  offset = writeU8(buffer, offset, frame.header.verMinor);
  offset = writeU8(buffer, offset, frame.header.flags);
  offset = writeU8(buffer, offset, frame.header.src);
  offset = writeU8(buffer, offset, frame.header.dst);
  offset = writeU16LE(buffer, offset, frame.header.msgType);
  offset = writeU16LE(buffer, offset, frame.header.msgId);
  offset = writeU16LE(buffer, offset, frame.header.seq);
  offset = writeU16LE(buffer, offset, frame.payload.length);

  // Calculate and write header CRC16
  const headerCrc16 = crc16CcittFalse(buffer.slice(0, 15));
  offset = writeU16LE(buffer, offset, headerCrc16);

  // Write fragment header if present
  if (frame.fragmentHeader) {
    offset = writeU16LE(buffer, offset, frame.fragmentHeader.fragId);
    offset = writeU8(buffer, offset, frame.fragmentHeader.fragIdx);
    offset = writeU8(buffer, offset, frame.fragmentHeader.fragCnt);
  }

  // Write payload
  buffer.set(frame.payload, offset);
  offset += frame.payload.length;

  // Calculate and write frame CRC32
  const frameCrc32 = crc32IsoHdlc(buffer.slice(0, offset));
  writeU32LE(buffer, offset, frameCrc32);

  return buffer;
}

// ============================================================================
// Frame Decoder
// ============================================================================

export function decodeFrame(buffer: Uint8Array): Frame {
  if (buffer.length < HEADER_SIZE + 4) {
    throw new Error('Buffer too small for ECP frame');
  }

  let offset = 0;

  // Read and verify magic
  const magic = [readU8(buffer, offset++), readU8(buffer, offset++)];
  if (magic[0] !== ECP_MAGIC[0] || magic[1] !== ECP_MAGIC[1]) {
    throw new Error(`Invalid magic: expected [${ECP_MAGIC}], got [${magic}]`);
  }

  // Read header
  const verMajor = readU8(buffer, offset++);
  const verMinor = readU8(buffer, offset++);
  const flags = readU8(buffer, offset++);
  const src = readU8(buffer, offset++);
  const dst = readU8(buffer, offset++);
  const msgType = readU16LE(buffer, offset);
  offset += 2;
  const msgId = readU16LE(buffer, offset);
  offset += 2;
  const seq = readU16LE(buffer, offset);
  offset += 2;
  const payloadLen = readU16LE(buffer, offset);
  offset += 2;
  const headerCrc16 = readU16LE(buffer, offset);
  offset += 2;

  // Verify header CRC16
  const calculatedHeaderCrc = crc16CcittFalse(buffer.slice(0, 15));
  if (calculatedHeaderCrc !== headerCrc16) {
    throw new Error(
      `Header CRC mismatch: expected ${headerCrc16}, got ${calculatedHeaderCrc}`
    );
  }

  const header: FrameHeader = {
    magic,
    verMajor,
    verMinor,
    flags,
    src,
    dst,
    msgType,
    msgId,
    seq,
    payloadLen,
    headerCrc16,
  };

  // Read fragment header if present
  let fragmentHeader: FragmentHeader | undefined;
  if (flags & 0x08) {
    // FRAG flag
    fragmentHeader = {
      fragId: readU16LE(buffer, offset),
      fragIdx: readU8(buffer, offset + 2),
      fragCnt: readU8(buffer, offset + 3),
    };
    offset += 4;
  }

  // Read payload
  const payload = buffer.slice(offset, offset + payloadLen);
  offset += payloadLen;

  // Read and verify frame CRC32
  const frameCrc32 = readU32LE(buffer, offset);
  const calculatedFrameCrc = crc32IsoHdlc(buffer.slice(0, offset));
  if (calculatedFrameCrc !== frameCrc32) {
    throw new Error(
      `Frame CRC mismatch: expected ${frameCrc32}, got ${calculatedFrameCrc}`
    );
  }

  return {
    header,
    fragmentHeader,
    payload,
    frameCrc32,
  };
}

// ============================================================================
// UART Framing (COBS + 0x00 delimiter)
// ============================================================================

export function encodeFrameForUart(frame: Frame): Uint8Array {
  const frameData = encodeFrame(frame);
  const cobsEncoded = cobsEncode(frameData);

  // Add 0x00 delimiter
  const result = new Uint8Array(cobsEncoded.length + 1);
  result.set(cobsEncoded, 0);
  result[cobsEncoded.length] = 0x00;

  return result;
}

export function decodeFrameFromUart(buffer: Uint8Array): Frame {
  // Remove trailing 0x00 if present
  let data = buffer;
  if (buffer.length > 0 && buffer[buffer.length - 1] === 0x00) {
    data = buffer.slice(0, -1);
  }

  const cobsDecoded = cobsDecode(data);
  return decodeFrame(cobsDecoded);
}
