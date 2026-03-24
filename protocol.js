/**
 * ElectroChem Protocol V1 — protocol.js
 * Binary frame builder / parser for ECP v1.0
 * Little-endian, COBS framing for UART, raw frames for BLE
 */

'use strict';

// ─── Constants ──────────────────────────────────────────────────────────────
const ECP = {
  MAGIC0: 0xEC,
  MAGIC1: 0x50,
  VER_MAJOR: 1,
  VER_MINOR: 0,
  HOST_ID: 0x01,
  DEVICE_ID_NODE: 0x10,
  BROADCAST: 0xFF,

  FLAG_ACK_REQ: 0x01,
  FLAG_ACK:     0x02,
  FLAG_IS_ERR:  0x04,
  FLAG_FRAG:    0x08,
  FLAG_STREAM:  0x10,

  MSG_HELLO_REQ:      0x0001,
  MSG_HELLO_RSP:      0x0002,
  MSG_PING:           0x0003,
  MSG_PONG:           0x0004,
  MSG_TIME_SYNC_REQ:  0x0005,
  MSG_TIME_SYNC_RSP:  0x0006,
  MSG_SET_DAC_REQ:    0x0100,
  MSG_SET_DAC_RSP:    0x0101,
  MSG_CFG_CH_REQ:     0x0110,
  MSG_CFG_CH_RSP:     0x0111,
  MSG_GET_CFG_REQ:    0x0112,
  MSG_GET_CFG_RSP:    0x0113,
  MSG_START_MEAS_REQ: 0x0200,
  MSG_START_MEAS_RSP: 0x0201,
  MSG_STOP_MEAS_REQ:  0x0202,
  MSG_STOP_MEAS_RSP:  0x0203,
  MSG_GET_STATUS_REQ: 0x0204,
  MSG_GET_STATUS_RSP: 0x0205,
  MSG_DATA_FRAME:     0x0300,
  MSG_DATA_PULL_REQ:  0x0301,
  MSG_DATA_PULL_RSP:  0x0302,
  MSG_STATS_REQ:      0x0303,
  MSG_STATS_RSP:      0x0304,
  MSG_EVENT:          0x0500,

  TLV_DEVICE_ID:    0x01,
  TLV_FW_VERSION:   0x02,
  TLV_CAP_BITS:     0x03,
  TLV_MAX_PAYLOAD:  0x04,
  TLV_RESULT_CODE:  0x05,
  TLV_RESULT_MSG:   0x06,
  TLV_TIME_US:      0x07,
  TLV_CHANNEL_ID:   0x08,
  TLV_SIGNAL_ID:    0x09,
  TLV_DAC_CODE:     0x0A,
  TLV_DAC_VOLT_F32: 0x0B,
  TLV_ADC_RATE_SPS: 0x0C,
  TLV_PGA_GAIN:     0x0D,
  TLV_RTIA_OHM:     0x0E,
  TLV_MODE_ID:      0x0F,
  TLV_BIAS_VOLT_F32:0x10,
  TLV_FILTER_CFG:   0x11,
  TLV_STREAM_ID:    0x12,
  TLV_DURATION_MS:  0x13,

  FMT_U16: 0, FMT_I16: 1, FMT_I32: 2, FMT_F32: 3,
  UNIT_CODE: 0, UNIT_V: 1, UNIT_A: 2, UNIT_OHM: 3, UNIT_CUSTOM: 4,

  MODE_CA:  0x01,
  MODE_CV:  0x02,
  MODE_DPV: 0x03,
  MODE_SWV: 0x04,
  MODE_POT: 0x05,

  RC_OK:              0x0000,
  RC_UNKNOWN_MSG:     0x0001,
  RC_BAD_CRC:         0x0002,
  RC_BAD_LEN:         0x0003,
  RC_UNSUPPORTED_VER: 0x0004,
  RC_INVALID_PARAM:   0x0100,
  RC_BUSY:            0x0101,
  RC_NOT_CONFIGURED:  0x0102,
  RC_HW_FAULT:        0x0103,

  HEADER_LEN: 17,
  MAX_PAYLOAD_LEN: 4096,

  // Temporary compatibility switches: allow communication with firmware that does not implement CRC yet.
  CRC_VERIFY: true,
  ALLOW_FRAME_WITHOUT_CRC32: true,
};

// ─── CRC-16/CCITT-FALSE ──────────────────────────────────────────────────────
function crc16_ccitt(buf, offset, len) {
  let crc = 0xFFFF;
  for (let i = offset; i < offset + len; i++) {
    crc ^= (buf[i] << 8);
    for (let j = 0; j < 8; j++)
      crc = (crc & 0x8000) ? (((crc << 1) ^ 0x1021) & 0xFFFF) : ((crc << 1) & 0xFFFF);
  }
  return crc;
}

// ─── CRC-32/ISO-HDLC ────────────────────────────────────────────────────────
const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32_iso_hdlc(buf, offset, len) {
  let crc = 0xFFFFFFFF;
  for (let i = offset; i < offset + len; i++)
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ─── COBS ───────────────────────────────────────────────────────────────────
function cobsEncode(data) {
  const out = [0];
  let codeIdx = 0, code = 1;
  for (let i = 0; i < data.length; i++) {
    if (data[i] === 0) {
      out[codeIdx] = code; codeIdx = out.length; out.push(0); code = 1;
    } else {
      out.push(data[i]); code++;
      if (code === 0xFF) { out[codeIdx] = code; codeIdx = out.length; out.push(0); code = 1; }
    }
  }
  out[codeIdx] = code;
  return new Uint8Array(out);
}

function cobsDecode(data) {
  const out = [];
  let i = 0;
  while (i < data.length) {
    const code = data[i++];
    if (code === 0) break;
    for (let j = 1; j < code && i < data.length; j++) out.push(data[i++]);
    if (code < 0xFF && i < data.length) out.push(0);
  }
  if (out.length > 0 && out[out.length - 1] === 0) out.pop();
  return new Uint8Array(out);
}

// ─── TLV Builder ────────────────────────────────────────────────────────────
class TLVBuilder {
  constructor() { this._chunks = []; }
  _pushRaw(type, valueBytes) {
    const hdr = new Uint8Array(3);
    hdr[0] = type;
    new DataView(hdr.buffer).setUint16(1, valueBytes.length, true);
    this._chunks.push(hdr, valueBytes);
    return this;
  }
  u8(type, v)  { return this._pushRaw(type, new Uint8Array([v])); }
  u16(type, v) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v, true); return this._pushRaw(type, b); }
  u32(type, v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v, true); return this._pushRaw(type, b); }
  f32(type, v) { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, v, true); return this._pushRaw(type, b); }
  str(type, s) { return this._pushRaw(type, new TextEncoder().encode(s)); }
  build() {
    const total = this._chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of this._chunks) { out.set(c, off); off += c.length; }
    return out;
  }
}

// ─── TLV Parser ─────────────────────────────────────────────────────────────
function parseTLV(buf, offset, end) {
  const result = {};
  let i = offset;
  while (i + 3 <= end) {
    const type = buf[i];
    const len  = new DataView(buf.buffer, buf.byteOffset + i + 1, 2).getUint16(0, true);
    i += 3;
    if (i + len > end) break;
    const val = buf.slice(i, i + len);
    const dv  = new DataView(val.buffer, val.byteOffset, val.byteLength);
    switch (type) {
      case ECP.TLV_DEVICE_ID:    result.deviceId   = new TextDecoder().decode(val); break;
      case ECP.TLV_FW_VERSION:   result.fwVersion  = new TextDecoder().decode(val); break;
      case ECP.TLV_CAP_BITS:     result.capBits    = dv.getUint32(0, true); break;
      case ECP.TLV_MAX_PAYLOAD:  result.maxPayload = dv.getUint16(0, true); break;
      case ECP.TLV_RESULT_CODE:  result.resultCode = dv.getUint16(0, true); break;
      case ECP.TLV_RESULT_MSG:   result.resultMsg  = new TextDecoder().decode(val); break;
      case ECP.TLV_CHANNEL_ID:   result.channelId  = val[0]; break;
      case ECP.TLV_SIGNAL_ID:    result.signalId   = dv.getUint16(0, true); break;
      case ECP.TLV_ADC_RATE_SPS: result.adcRateSps = dv.getUint32(0, true); break;
      case ECP.TLV_PGA_GAIN:     result.pgaGain    = val[0]; break;
      case ECP.TLV_RTIA_OHM:     result.rtiaOhm    = dv.getUint32(0, true); break;
      case ECP.TLV_MODE_ID:      result.modeId     = val[0]; break;
      case ECP.TLV_BIAS_VOLT_F32:result.biasVolt   = dv.getFloat32(0, true); break;
      case ECP.TLV_STREAM_ID:    result.streamId   = val[0]; break;
      case ECP.TLV_DURATION_MS:  result.durationMs = dv.getUint32(0, true); break;
      case ECP.TLV_DAC_CODE:     result.dacCode    = dv.getUint16(0, true); break;
      case ECP.TLV_DAC_VOLT_F32: result.dacVolt    = dv.getFloat32(0, true); break;
      default: break;
    }
    i += len;
  }
  return result;
}

// ─── Frame Builder ───────────────────────────────────────────────────────────
let _msgIdCounter = 1;
function nextMsgId() { return (_msgIdCounter++ & 0xFFFF); }
let _seqCounter = 0;
function nextSeq()   { return (_seqCounter++ & 0xFFFF); }

function buildFrame(opts) {
  const payload    = opts.payload || new Uint8Array(0);
  const msgId      = opts.msgId  !== undefined ? opts.msgId  : nextMsgId();
  const seq        = opts.seq    !== undefined ? opts.seq    : nextSeq();
  const payloadLen = payload.length;

  const header = new Uint8Array(ECP.HEADER_LEN);
  const hdv    = new DataView(header.buffer);
  header[0] = ECP.MAGIC0;
  header[1] = ECP.MAGIC1;
  header[2] = ECP.VER_MAJOR;
  header[3] = ECP.VER_MINOR;
  header[4] = opts.flags;
  header[5] = ECP.HOST_ID;
  header[6] = ECP.DEVICE_ID_NODE;
  hdv.setUint16(7,  opts.msgType, true);
  hdv.setUint16(9,  msgId,        true);
  hdv.setUint16(11, seq,          true);
  hdv.setUint16(13, payloadLen,   true);
  hdv.setUint16(15, crc16_ccitt(header, 0, 15), true);

  const frameBody = new Uint8Array(ECP.HEADER_LEN + payloadLen);
  frameBody.set(header, 0);
  frameBody.set(payload, ECP.HEADER_LEN);
  const fcrc  = crc32_iso_hdlc(frameBody, 0, frameBody.length);
  const frame = new Uint8Array(ECP.HEADER_LEN + payloadLen + 4);
  frame.set(frameBody, 0);
  new DataView(frame.buffer).setUint32(ECP.HEADER_LEN + payloadLen, fcrc, true);
  return frame;
}

function buildUARTFrame(opts) {
  const raw  = buildFrame(opts);
  const cobs = cobsEncode(raw);
  const out  = new Uint8Array(cobs.length + 1);
  out.set(cobs, 0);
  out[cobs.length] = 0x00;
  return out;
}

// ─── Frame Parser ────────────────────────────────────────────────────────────
function parseFrame(raw) {
  if (raw.length < ECP.HEADER_LEN) return null;
  if (raw[0] !== ECP.MAGIC0 || raw[1] !== ECP.MAGIC1) return null;

  const hdv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const hcrcCalc = crc16_ccitt(raw, 0, 15);
  const hcrcRecv = hdv.getUint16(15, true);
  if (ECP.CRC_VERIFY && hcrcCalc !== hcrcRecv) return null;

  const verMajor   = raw[2];
  const verMinor   = raw[3];
  const flags      = raw[4];
  const src        = raw[5];
  const dst        = raw[6];
  const msgType    = hdv.getUint16(7,  true);
  const msgId      = hdv.getUint16(9,  true);
  const seq        = hdv.getUint16(11, true);
  const payloadLen = hdv.getUint16(13, true);

  if (verMajor !== ECP.VER_MAJOR) return null;
  if (dst !== ECP.HOST_ID && dst !== ECP.BROADCAST) return null;
  if (payloadLen > ECP.MAX_PAYLOAD_LEN) return null;

  const fragHeaderLen = (flags & ECP.FLAG_FRAG) ? 4 : 0;
  const bodyLenNoCrc = ECP.HEADER_LEN + fragHeaderLen + payloadLen;
  const bodyLenWithCrc = bodyLenNoCrc + 4;
  if (raw.length < bodyLenNoCrc) return null;

  const hasFrameCrc32 = raw.length >= bodyLenWithCrc;
  if (ECP.CRC_VERIFY) {
    if (!hasFrameCrc32) return null;
    const fcrcCalc = crc32_iso_hdlc(raw, 0, bodyLenNoCrc);
    const fcrcRecv = hdv.getUint32(bodyLenNoCrc, true);
    if (fcrcCalc !== fcrcRecv) return null;
  } else if (!hasFrameCrc32 && !ECP.ALLOW_FRAME_WITHOUT_CRC32) {
    return null;
  }

  let payloadOffset = ECP.HEADER_LEN;
  let fragInfo = null;
  if (flags & ECP.FLAG_FRAG) {
    const fdv = new DataView(raw.buffer, raw.byteOffset + ECP.HEADER_LEN, 4);
    fragInfo = { fragId: fdv.getUint16(0, true), fragIdx: raw[ECP.HEADER_LEN + 2], fragCnt: raw[ECP.HEADER_LEN + 3] };
    payloadOffset += 4;
    if (fragInfo.fragCnt === 0 || fragInfo.fragIdx >= fragInfo.fragCnt) return null;
  }

  const payloadEnd = payloadOffset + payloadLen;
  const payload = raw.slice(payloadOffset, payloadEnd);
  return { verMajor, verMinor, flags, src, dst, msgType, msgId, seq, payload, fragInfo };
}

// ─── Data Frame Parser ───────────────────────────────────────────────────────
function parseDataFrame(payload) {
  if (payload.length < 20) return null;
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const streamId  = payload[0];
  const channelId = payload[1];
  const signalId  = dv.getUint16(2, true);
  const format    = payload[4];
  const unit      = payload[5];
  const ts0_us    = dv.getBigUint64(6, true);
  const dt_us     = dv.getUint32(14, true);
  const n         = dv.getUint16(18, true);

  const samples = [];
  let off = 20;
  const bps = (format === ECP.FMT_U16 || format === ECP.FMT_I16) ? 2 : 4;
  for (let i = 0; i < n; i++) {
    if (off + bps > payload.length) break;
    let v;
    switch (format) {
      case ECP.FMT_U16: v = dv.getUint16(off, true);  break;
      case ECP.FMT_I16: v = dv.getInt16(off,  true);  break;
      case ECP.FMT_I32: v = dv.getInt32(off,  true);  break;
      case ECP.FMT_F32: v = dv.getFloat32(off, true); break;
      default: v = 0;
    }
    samples.push(v);
    off += bps;
  }
  return { streamId, channelId, signalId, format, unit, ts0_us, dt_us, n, samples };
}

// ─── UART Receive Buffer ─────────────────────────────────────────────────────
class UARTFrameReceiver {
  constructor(onFrame) {
    this._buf = [];
    this._onFrame = onFrame;
  }
  feed(chunk) {
    for (const byte of chunk) {
      if (byte === 0x00) {
        if (this._buf.length > 0) {
          try {
            const decoded = cobsDecode(new Uint8Array(this._buf));
            const frame   = parseFrame(decoded);
            if (frame) this._onFrame(frame);
          } catch (e) { /* discard malformed */ }
          this._buf = [];
        }
      } else {
        this._buf.push(byte);
      }
    }
  }
  reset() { this._buf = []; }
}

// ─── High-level Command Builders ─────────────────────────────────────────────
const ECPCmd = {
  hello(maxPayload = 512, uart = true) {
    const payload = new TLVBuilder().u16(ECP.TLV_MAX_PAYLOAD, maxPayload).build();
    const opts = { flags: ECP.FLAG_ACK_REQ, msgType: ECP.MSG_HELLO_REQ, payload };
    return uart ? buildUARTFrame(opts) : buildFrame(opts);
  },
  ping(uart = true) {
    const opts = { flags: ECP.FLAG_ACK_REQ, msgType: ECP.MSG_PING, payload: new Uint8Array(0) };
    return uart ? buildUARTFrame(opts) : buildFrame(opts);
  },
  cfgChannel({ channelId, modeId, pgaGain, rtiaOhm, adcRateSps, biasVolt, uart = true }) {
    const b = new TLVBuilder().u8(ECP.TLV_CHANNEL_ID, channelId);
    if (modeId     !== undefined) b.u8(ECP.TLV_MODE_ID,       modeId);
    if (pgaGain    !== undefined) b.u8(ECP.TLV_PGA_GAIN,      pgaGain);
    if (rtiaOhm    !== undefined) b.u32(ECP.TLV_RTIA_OHM,     rtiaOhm);
    if (adcRateSps !== undefined) b.u32(ECP.TLV_ADC_RATE_SPS, adcRateSps);
    if (biasVolt   !== undefined) b.f32(ECP.TLV_BIAS_VOLT_F32, biasVolt);
    const opts = { flags: ECP.FLAG_ACK_REQ, msgType: ECP.MSG_CFG_CH_REQ, payload: b.build() };
    return uart ? buildUARTFrame(opts) : buildFrame(opts);
  },
  setDac({ channelId, dacVolt, uart = true }) {
    const b = new TLVBuilder().u8(ECP.TLV_CHANNEL_ID, channelId).f32(ECP.TLV_DAC_VOLT_F32, dacVolt);
    const opts = { flags: ECP.FLAG_ACK_REQ, msgType: ECP.MSG_SET_DAC_REQ, payload: b.build() };
    return uart ? buildUARTFrame(opts) : buildFrame(opts);
  },
  startMeas({ channelId, streamId, signalId, durationMs, uart = true }) {
    const b = new TLVBuilder().u8(ECP.TLV_CHANNEL_ID, channelId);
    if (streamId   !== undefined) b.u8(ECP.TLV_STREAM_ID,   streamId);
    if (signalId   !== undefined) b.u16(ECP.TLV_SIGNAL_ID,  signalId);
    if (durationMs !== undefined) b.u32(ECP.TLV_DURATION_MS, durationMs);
    const opts = { flags: ECP.FLAG_ACK_REQ, msgType: ECP.MSG_START_MEAS_REQ, payload: b.build() };
    return uart ? buildUARTFrame(opts) : buildFrame(opts);
  },
  stopMeas({ channelId, uart = true } = {}) {
    const b = new TLVBuilder();
    if (channelId !== undefined) b.u8(ECP.TLV_CHANNEL_ID, channelId);
    const opts = { flags: ECP.FLAG_ACK_REQ, msgType: ECP.MSG_STOP_MEAS_REQ, payload: b.build() };
    return uart ? buildUARTFrame(opts) : buildFrame(opts);
  },
  getStatus(uart = true) {
    const opts = { flags: ECP.FLAG_ACK_REQ, msgType: ECP.MSG_GET_STATUS_REQ, payload: new Uint8Array(0) };
    return uart ? buildUARTFrame(opts) : buildFrame(opts);
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const UNIT_LABELS = ['code', 'V', 'A', 'Ω', 'custom'];

function formatSampleValue(v, unit) {
  if (unit === ECP.UNIT_A) {
    const ua = v * 1e6;
    if (Math.abs(ua) < 1000) return `${ua.toFixed(3)} µA`;
    return `${(v * 1e3).toFixed(4)} mA`;
  }
  if (unit === ECP.UNIT_V) {
    const mv = v * 1e3;
    if (Math.abs(mv) < 10000) return `${mv.toFixed(3)} mV`;
    return `${v.toFixed(5)} V`;
  }
  return `${v.toFixed(5)}`;
}

function unitLabel(unit) { return UNIT_LABELS[unit] || 'custom'; }

const RESULT_STRINGS = {
  0x0000:'OK', 0x0001:'UNKNOWN_MSG', 0x0002:'BAD_CRC', 0x0003:'BAD_LEN',
  0x0004:'UNSUPPORTED_VER', 0x0100:'INVALID_PARAM', 0x0101:'BUSY',
  0x0102:'NOT_CONFIGURED', 0x0103:'HW_FAULT', 0x0200:'INTERNAL_TIMEOUT', 0x0201:'STORAGE_FULL',
};
function resultString(code) { return RESULT_STRINGS[code] || `ERR(0x${code.toString(16).padStart(4,'0')})`; }
