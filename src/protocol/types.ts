/**
 * ElectroChem Protocol V1 - TypeScript Implementation
 *
 * This module implements the ECP v1 protocol for communication with
 * electrochemical workstation devices.
 */

// ============================================================================
// Constants
// ============================================================================

export const ECP_MAGIC = [0xEC, 0x50] as const; // 'EC' 'P'
export const ECP_VERSION_MAJOR = 1;
export const ECP_VERSION_MINOR = 0;

export const HEADER_SIZE = 17;

// Node IDs
export const NODE_ID_HOST = 0x01;
export const NODE_ID_DEVICE = 0x10;
export const NODE_ID_BROADCAST = 0xFF;

// ============================================================================
// Flags
// ============================================================================

export enum FrameFlags {
  ACK_REQ = 0x01,   // Request acknowledgment
  ACK = 0x02,       // This is an acknowledgment
  IS_ERR = 0x04,    // Error response
  FRAG = 0x08,      // Fragmentation enabled
  STREAM = 0x10,    // Data stream
}

// ============================================================================
// Message Types
// ============================================================================

export enum MsgType {
  // System/Link Management (0x0000-0x00FF)
  HELLO_REQ = 0x0001,
  HELLO_RSP = 0x0002,
  PING = 0x0003,
  PONG = 0x0004,
  TIME_SYNC_REQ = 0x0005,
  TIME_SYNC_RSP = 0x0006,

  // Configuration (0x0100-0x01FF)
  SET_DAC_REQ = 0x0100,
  SET_DAC_RSP = 0x0101,
  CFG_CHANNEL_REQ = 0x0110,
  CFG_CHANNEL_RSP = 0x0111,
  GET_CFG_REQ = 0x0112,
  GET_CFG_RSP = 0x0113,

  // Measurement Control (0x0200-0x02FF)
  START_MEAS_REQ = 0x0200,
  START_MEAS_RSP = 0x0201,
  STOP_MEAS_REQ = 0x0202,
  STOP_MEAS_RSP = 0x0203,
  GET_STATUS_REQ = 0x0204,
  GET_STATUS_RSP = 0x0205,

  // Data (0x0300-0x03FF)
  DATA_FRAME = 0x0300,
  DATA_PULL_REQ = 0x0301,
  DATA_PULL_RSP = 0x0302,
  STATS_REQ = 0x0303,
  STATS_RSP = 0x0304,

  // Events/Alarms (0x0500-0x05FF)
  EVENT = 0x0500,
}

// ============================================================================
// TLV Types
// ============================================================================

export enum TlvType {
  // General (0x01-0x07)
  DEVICE_ID = 0x01,
  FW_VERSION = 0x02,
  CAP_BITS = 0x03,
  MAX_PAYLOAD = 0x04,
  RESULT_CODE = 0x05,
  RESULT_MSG = 0x06,
  TIME_US = 0x07,

  // Channel/Signal/Parameters (0x08-0x13)
  CHANNEL_ID = 0x08,
  SIGNAL_ID = 0x09,
  DAC_CODE = 0x0A,
  DAC_VOLT_F32 = 0x0B,
  ADC_RATE_SPS = 0x0C,
  PGA_GAIN = 0x0D,
  RTIA_OHM = 0x0E,
  MODE_ID = 0x0F,
  BIAS_VOLT_F32 = 0x10,
  FILTER_CFG = 0x11,
  STREAM_ID = 0x12,
  DURATION_MS = 0x13,
}

// ============================================================================
// Result Codes
// ============================================================================

export enum ResultCode {
  OK = 0x0000,
  UNKNOWN_MSG = 0x0001,
  BAD_CRC = 0x0002,
  BAD_LEN = 0x0003,
  UNSUPPORTED_VER = 0x0004,
  INVALID_PARAM = 0x0100,
  BUSY = 0x0101,
  NOT_CONFIGURED = 0x0102,
  HW_FAULT = 0x0103,
  INTERNAL_TIMEOUT = 0x0200,
  STORAGE_FULL = 0x0201,
}

// ============================================================================
// Data Format
// ============================================================================

export enum DataFormat {
  U16_RAW_ADC = 0,
  I16 = 1,
  I32 = 2,
  F32 = 3,
}

export enum DataUnit {
  CODE = 0,    // Raw code
  VOLT = 1,    // Voltage (V)
  AMPERE = 2,  // Current (A)
  OHM = 3,     // Resistance (Ω)
  CUSTOM = 4,  // Custom unit
}

// ============================================================================
// Signal IDs
// ============================================================================

export enum SignalId {
  GLUCOSE = 0x0001,
  LACTATE = 0x0002,
  POTASSIUM = 0x0003,
  SODIUM = 0x0004,
  RAW_ELECTROCHEM = 0x00FF,
}

// ============================================================================
// Mode IDs (Measurement Methods)
// ============================================================================

export enum ModeId {
  OCP = 0x01,        // Open Circuit Potential
  CA = 0x02,         // Chronoamperometry (计时电流法)
  CV = 0x03,         // Cyclic Voltammetry
  DPV = 0x04,        // Differential Pulse Voltammetry
  SWV = 0x05,        // Square Wave Voltammetry
  EIS = 0x06,        // Electrochemical Impedance Spectroscopy
}

// ============================================================================
// Frame Header
// ============================================================================

export interface FrameHeader {
  magic: number[];
  verMajor: number;
  verMinor: number;
  flags: number;
  src: number;
  dst: number;
  msgType: number;
  msgId: number;
  seq: number;
  payloadLen: number;
  headerCrc16: number;
}

// ============================================================================
// Fragment Header
// ============================================================================

export interface FragmentHeader {
  fragId: number;
  fragIdx: number;
  fragCnt: number;
}

// ============================================================================
// Frame
// ============================================================================

export interface Frame {
  header: FrameHeader;
  fragmentHeader?: FragmentHeader;
  payload: Uint8Array;
  frameCrc32: number;
}

// ============================================================================
// TLV
// ============================================================================

export interface Tlv {
  type: number;
  length: number;
  value: Uint8Array;
}

// ============================================================================
// Data Frame Payload
// ============================================================================

export interface DataFramePayload {
  streamId: number;
  channelId: number;
  signalId: number;
  format: DataFormat;
  unit: DataUnit;
  ts0_us: bigint;
  dt_us: number;
  n: number;
  samples: number[];
}

// ============================================================================
// Channel Configuration
// ============================================================================

export interface ChannelConfig {
  channelId: number;
  modeId?: ModeId;
  pgaGain?: number;
  rtiaOhm?: number;
  adcRateSps?: number;
  biasVoltF32?: number;
  filterCfg?: Uint8Array;
}

// ============================================================================
// Device Info
// ============================================================================

export interface DeviceInfo {
  deviceId: string;
  fwVersion: string;
  capBits: number;
  maxPayload: number;
  supportedSignals?: number[];
}
