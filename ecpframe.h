#pragma once

// ============================================================
// ECP (ElectroChem Protocol) v1 – Frame & Type Definitions
// ============================================================

#include <cstdint>
#include <QByteArray>
#include <QVector>

// --------------- Frame constants ----------------------------

constexpr uint8_t ECP_MAGIC0    = 0xEC;
constexpr uint8_t ECP_MAGIC1    = 0x50;   // Example 18.1: "EC 50"
constexpr uint8_t ECP_VER_MAJOR = 1;
constexpr uint8_t ECP_VER_MINOR = 0;
constexpr uint8_t ECP_NODE_HOST   = 0x01;
constexpr uint8_t ECP_NODE_DEVICE = 0x10;
constexpr uint8_t ECP_NODE_BCAST  = 0xFF;
constexpr int     ECP_HEADER_SIZE = 17;

// --------------- Flags (bit positions) ----------------------

namespace EcpFlag {
constexpr uint8_t ACK_REQ = (1u << 0);
constexpr uint8_t ACK     = (1u << 1);
constexpr uint8_t IS_ERR  = (1u << 2);
constexpr uint8_t FRAG    = (1u << 3);
constexpr uint8_t STREAM  = (1u << 4);
} // namespace EcpFlag

// --------------- Message types ------------------------------

namespace EcpMsgType {
// System / link management
constexpr uint16_t HELLO_REQ        = 0x0001;
constexpr uint16_t HELLO_RSP        = 0x0002;
constexpr uint16_t PING_REQ         = 0x0003;
constexpr uint16_t PONG_RSP         = 0x0004;
constexpr uint16_t TIME_SYNC_REQ    = 0x0005;
constexpr uint16_t TIME_SYNC_RSP    = 0x0006;
// Configuration
constexpr uint16_t SET_DAC_REQ      = 0x0100;
constexpr uint16_t SET_DAC_RSP      = 0x0101;
constexpr uint16_t CFG_CHANNEL_REQ  = 0x0110;
constexpr uint16_t CFG_CHANNEL_RSP  = 0x0111;
constexpr uint16_t GET_CFG_REQ      = 0x0112;
constexpr uint16_t GET_CFG_RSP      = 0x0113;
// Measurement control
constexpr uint16_t START_MEAS_REQ   = 0x0200;
constexpr uint16_t START_MEAS_RSP   = 0x0201;
constexpr uint16_t STOP_MEAS_REQ    = 0x0202;
constexpr uint16_t STOP_MEAS_RSP    = 0x0203;
constexpr uint16_t GET_STATUS_REQ   = 0x0204;
constexpr uint16_t GET_STATUS_RSP   = 0x0205;
// Data
constexpr uint16_t DATA_FRAME       = 0x0300;
constexpr uint16_t DATA_PULL_REQ    = 0x0301;
constexpr uint16_t DATA_PULL_RSP    = 0x0302;
constexpr uint16_t STATS_REQ        = 0x0303;
constexpr uint16_t STATS_RSP        = 0x0304;
// Events
constexpr uint16_t EVENT            = 0x0500;
} // namespace EcpMsgType

// --------------- TLV type tags ------------------------------

namespace EcpTlv {
constexpr uint8_t DEVICE_ID     = 0x01;
constexpr uint8_t FW_VERSION    = 0x02;
constexpr uint8_t CAP_BITS      = 0x03;
constexpr uint8_t MAX_PAYLOAD   = 0x04;
constexpr uint8_t RESULT_CODE   = 0x05;
constexpr uint8_t RESULT_MSG    = 0x06;
constexpr uint8_t TIME_US       = 0x07;
constexpr uint8_t CHANNEL_ID    = 0x08;
constexpr uint8_t SIGNAL_ID     = 0x09;
constexpr uint8_t DAC_CODE      = 0x0A;
constexpr uint8_t DAC_VOLT_F32  = 0x0B;
constexpr uint8_t ADC_RATE_SPS  = 0x0C;
constexpr uint8_t PGA_GAIN      = 0x0D;
constexpr uint8_t RTIA_OHM      = 0x0E;
constexpr uint8_t MODE_ID       = 0x0F;
constexpr uint8_t BIAS_VOLT_F32 = 0x10;
constexpr uint8_t FILTER_CFG    = 0x11;
constexpr uint8_t STREAM_ID     = 0x12;
constexpr uint8_t DURATION_MS   = 0x13;
} // namespace EcpTlv

// --------------- Mode IDs -----------------------------------

namespace EcpMode {
constexpr uint8_t OCP = 0x01; // 开路电位法
constexpr uint8_t CA  = 0x02; // 计时电流法
constexpr uint8_t CV  = 0x03; // 循环伏安法
constexpr uint8_t DPV = 0x04; // 差分脉冲伏安法
constexpr uint8_t SWV = 0x05; // 方波伏安法
constexpr uint8_t LSV = 0x06; // 线性扫描伏安法
} // namespace EcpMode

// --------------- Signal IDs ---------------------------------

namespace EcpSignal {
constexpr uint16_t GLUCOSE   = 0x0001;
constexpr uint16_t LACTATE   = 0x0002;
constexpr uint16_t K         = 0x0003;
constexpr uint16_t NA        = 0x0004;
constexpr uint16_t RAW_ECHEM = 0x00FF;
} // namespace EcpSignal

// --------------- Data format codes --------------------------

namespace EcpFormat {
constexpr uint8_t U16 = 0; // Raw ADC code, 2 bytes
constexpr uint8_t I16 = 1; // Signed 16-bit,  2 bytes
constexpr uint8_t I32 = 2; // Signed 32-bit,  4 bytes
constexpr uint8_t F32 = 3; // float32,         4 bytes
} // namespace EcpFormat

// --------------- Unit codes ---------------------------------

namespace EcpUnit {
constexpr uint8_t CODE   = 0;
constexpr uint8_t VOLT   = 1;
constexpr uint8_t AMP    = 2;
constexpr uint8_t OHM    = 3;
constexpr uint8_t CUSTOM = 4;
} // namespace EcpUnit

// --------------- Result codes -------------------------------

namespace EcpResult {
constexpr uint16_t OK               = 0x0000;
constexpr uint16_t UNKNOWN_MSG      = 0x0001;
constexpr uint16_t BAD_CRC          = 0x0002;
constexpr uint16_t BAD_LEN          = 0x0003;
constexpr uint16_t UNSUPPORTED_VER  = 0x0004;
constexpr uint16_t INVALID_PARAM    = 0x0100;
constexpr uint16_t BUSY             = 0x0101;
constexpr uint16_t NOT_CONFIGURED   = 0x0102;
constexpr uint16_t HW_FAULT         = 0x0103;
constexpr uint16_t INTERNAL_TIMEOUT = 0x0200;
constexpr uint16_t STORAGE_FULL     = 0x0201;
} // namespace EcpResult

// --------------- Packed header struct (17 bytes) ------------

#pragma pack(push, 1)
struct EcpRawHeader {
    uint8_t  magic[2];
    uint8_t  verMajor;
    uint8_t  verMinor;
    uint8_t  flags;
    uint8_t  src;
    uint8_t  dst;
    uint16_t msgType;
    uint16_t msgId;
    uint16_t seq;
    uint16_t payloadLen;
    uint16_t headerCrc16;
};
static_assert(sizeof(EcpRawHeader) == 17, "EcpRawHeader must be 17 bytes");
#pragma pack(pop)

// --------------- Parsed frame -------------------------------

struct EcpFrame {
    uint8_t    flags    = 0;
    uint8_t    src      = 0;
    uint8_t    dst      = 0;
    uint16_t   msgType  = 0;
    uint16_t   msgId    = 0;
    uint16_t   seq      = 0;
    QByteArray payload;
    bool       valid    = false;
};

// --------------- TLV entry ----------------------------------

struct EcpTlvEntry {
    uint8_t    type;
    QByteArray value;
};

// --------------- Parsed DATA_FRAME payload ------------------

struct EcpDataPayload {
    uint8_t  streamId   = 0;
    uint8_t  channelId  = 0;
    uint16_t signalId   = 0;
    uint8_t  format     = EcpFormat::F32;
    uint8_t  unit       = EcpUnit::AMP;
    uint64_t ts0_us     = 0;
    uint32_t dt_us      = 0;
    QVector<double> samples;
};
