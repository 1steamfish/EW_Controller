#pragma once
#include "ecpframe.h"
#include <QByteArray>
#include <QVector>
#include <QString>

// ----------------------------------------------------------------
// EcpCodec – builds and parses ECP v1 frames
//
// For UART transport:
//   buildFrame()  returns  COBS(raw_frame) + 0x00
//   parseFrame()  expects  raw_frame (COBS-decoded, delimiter removed)
// ----------------------------------------------------------------
class EcpCodec
{
public:
    // Build a complete UART frame: COBS(header|payload|crc32) + 0x00
    // src defaults to Host, dst defaults to Device.
    static QByteArray buildFrame(uint16_t    msgType,
                                 uint8_t     flags,
                                 uint16_t    msgId,
                                 uint16_t    seq,
                                 const QByteArray &payload,
                                 uint8_t     src = ECP_NODE_HOST,
                                 uint8_t     dst = ECP_NODE_DEVICE);

    // Parse a raw frame (after COBS decode, delimiter stripped).
    // Returns true and fills @frame on success.
    static bool parseFrame(const QByteArray &raw, EcpFrame &frame);

    // ---- TLV builders ----------------------------------------
    static QByteArray tlvU8  (uint8_t type, uint8_t  val);
    static QByteArray tlvU16 (uint8_t type, uint16_t val);
    static QByteArray tlvU32 (uint8_t type, uint32_t val);
    static QByteArray tlvF32 (uint8_t type, float    val);
    static QByteArray tlvStr (uint8_t type, const QString &str);

    // ---- TLV parser ------------------------------------------
    // Returns all TLV entries found in @payload.  Unknown types are kept.
    static QVector<EcpTlvEntry> parseTlv(const QByteArray &payload);

    // Convenience: look up a single TLV value (returns default-constructed
    // QByteArray if not present)
    static QByteArray tlvGet(const QVector<EcpTlvEntry> &entries, uint8_t type);

    // ---- DATA_FRAME payload parser ---------------------------
    static bool parseDataFrame(const QByteArray &payload, EcpDataPayload &out);

private:
    static void appendLE16(QByteArray &buf, uint16_t v);
    static void appendLE32(QByteArray &buf, uint32_t v);
    static uint16_t readLE16(const uint8_t *d, int offset);
    static uint32_t readLE32(const uint8_t *d, int offset);
};
