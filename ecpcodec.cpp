#include "ecpcodec.h"
#include "crc.h"
#include "cobs.h"

#include <cstring>
#include <QString>

// ----------------------------------------------------------------
// Private helpers
// ----------------------------------------------------------------

void EcpCodec::appendLE16(QByteArray &buf, uint16_t v)
{
    buf.append(static_cast<char>(v & 0xFF));
    buf.append(static_cast<char>((v >> 8) & 0xFF));
}

void EcpCodec::appendLE32(QByteArray &buf, uint32_t v)
{
    buf.append(static_cast<char>(v        & 0xFF));
    buf.append(static_cast<char>((v >>  8) & 0xFF));
    buf.append(static_cast<char>((v >> 16) & 0xFF));
    buf.append(static_cast<char>((v >> 24) & 0xFF));
}

uint16_t EcpCodec::readLE16(const uint8_t *d, int offset)
{
    return static_cast<uint16_t>(d[offset]) |
           (static_cast<uint16_t>(d[offset + 1]) << 8);
}

uint32_t EcpCodec::readLE32(const uint8_t *d, int offset)
{
    return static_cast<uint32_t>(d[offset]) |
           (static_cast<uint32_t>(d[offset + 1]) <<  8) |
           (static_cast<uint32_t>(d[offset + 2]) << 16) |
           (static_cast<uint32_t>(d[offset + 3]) << 24);
}

// ----------------------------------------------------------------
// Frame builder
// ----------------------------------------------------------------

QByteArray EcpCodec::buildFrame(uint16_t msgType,
                                uint8_t  flags,
                                uint16_t msgId,
                                uint16_t seq,
                                const QByteArray &payload,
                                uint8_t  src,
                                uint8_t  dst)
{
    QByteArray raw;
    raw.reserve(ECP_HEADER_SIZE + payload.size() + 4);

    // --- Header (first 15 bytes before CRC) ---
    raw.append(static_cast<char>(ECP_MAGIC0));
    raw.append(static_cast<char>(ECP_MAGIC1));
    raw.append(static_cast<char>(ECP_VER_MAJOR));
    raw.append(static_cast<char>(ECP_VER_MINOR));
    raw.append(static_cast<char>(flags));
    raw.append(static_cast<char>(src));
    raw.append(static_cast<char>(dst));
    appendLE16(raw, msgType);
    appendLE16(raw, msgId);
    appendLE16(raw, seq);
    appendLE16(raw, static_cast<uint16_t>(payload.size()));

    // HeaderCrc16 covers the first 15 bytes
    uint16_t hcrc = crc16_ccitt(
        reinterpret_cast<const uint8_t *>(raw.constData()), 15);
    appendLE16(raw, hcrc);

    // --- Payload ---
    raw.append(payload);

    // --- FrameCrc32 covers header (17) + payload ---
    uint32_t fcrc = crc32_iso_hdlc(
        reinterpret_cast<const uint8_t *>(raw.constData()),
        static_cast<size_t>(raw.size()));
    appendLE32(raw, fcrc);

    // --- COBS encode + UART frame delimiter ---
    QByteArray out = cobs_encode(raw);
    out.append('\x00');
    return out;
}

// ----------------------------------------------------------------
// Frame parser
// ----------------------------------------------------------------

bool EcpCodec::parseFrame(const QByteArray &raw, EcpFrame &frame)
{
    // Minimum: header(17) + CRC32(4) = 21 bytes
    if (raw.size() < ECP_HEADER_SIZE + 4)
        return false;

    const auto *d = reinterpret_cast<const uint8_t *>(raw.constData());

    // Magic
    if (d[0] != ECP_MAGIC0 || d[1] != ECP_MAGIC1)
        return false;

    // Major version
    if (d[2] != ECP_VER_MAJOR)
        return false;

    // HeaderCrc16 (covers first 15 bytes)
    uint16_t hcrc_calc = crc16_ccitt(d, 15);
    uint16_t hcrc_recv = readLE16(d, 15);
    if (hcrc_calc != hcrc_recv)
        return false;

    uint16_t payloadLen = readLE16(d, 13);

    // Size consistency
    if (static_cast<int>(raw.size()) != ECP_HEADER_SIZE + payloadLen + 4)
        return false;

    // FrameCrc32 (covers header + payload)
    uint32_t fcrc_calc = crc32_iso_hdlc(d, static_cast<size_t>(ECP_HEADER_SIZE + payloadLen));
    uint32_t fcrc_recv = readLE32(d, ECP_HEADER_SIZE + payloadLen);
    if (fcrc_calc != fcrc_recv)
        return false;

    frame.flags   = d[4];
    frame.src     = d[5];
    frame.dst     = d[6];
    frame.msgType = readLE16(d, 7);
    frame.msgId   = readLE16(d, 9);
    frame.seq     = readLE16(d, 11);
    frame.payload = raw.mid(ECP_HEADER_SIZE, payloadLen);
    frame.valid   = true;
    return true;
}

// ----------------------------------------------------------------
// TLV builders
// ----------------------------------------------------------------

static QByteArray buildTlvRaw(uint8_t type, const QByteArray &value)
{
    QByteArray tlv;
    tlv.append(static_cast<char>(type));
    uint16_t len = static_cast<uint16_t>(value.size());
    tlv.append(static_cast<char>(len & 0xFF));
    tlv.append(static_cast<char>((len >> 8) & 0xFF));
    tlv.append(value);
    return tlv;
}

QByteArray EcpCodec::tlvU8(uint8_t type, uint8_t val)
{
    QByteArray v(1, static_cast<char>(val));
    return buildTlvRaw(type, v);
}

QByteArray EcpCodec::tlvU16(uint8_t type, uint16_t val)
{
    QByteArray v;
    appendLE16(v, val);
    return buildTlvRaw(type, v);
}

QByteArray EcpCodec::tlvU32(uint8_t type, uint32_t val)
{
    QByteArray v;
    appendLE32(v, val);
    return buildTlvRaw(type, v);
}

QByteArray EcpCodec::tlvF32(uint8_t type, float val)
{
    QByteArray v(4, '\0');
    std::memcpy(v.data(), &val, 4);
    return buildTlvRaw(type, v);
}

QByteArray EcpCodec::tlvStr(uint8_t type, const QString &str)
{
    return buildTlvRaw(type, str.toUtf8());
}

// ----------------------------------------------------------------
// TLV parser
// ----------------------------------------------------------------

QVector<EcpTlvEntry> EcpCodec::parseTlv(const QByteArray &payload)
{
    QVector<EcpTlvEntry> entries;
    const auto *d = reinterpret_cast<const uint8_t *>(payload.constData());
    int pos = 0;
    const int total = payload.size();

    while (pos + 3 <= total) {            // need at least T(1) + L(2)
        uint8_t  type = d[pos];
        uint16_t len  = static_cast<uint16_t>(d[pos + 1]) |
                        (static_cast<uint16_t>(d[pos + 2]) << 8);
        pos += 3;
        if (pos + len > total)
            break; // malformed – stop
        EcpTlvEntry e;
        e.type  = type;
        e.value = payload.mid(pos, len);
        entries.append(e);
        pos += len;
    }
    return entries;
}

QByteArray EcpCodec::tlvGet(const QVector<EcpTlvEntry> &entries, uint8_t type)
{
    for (const auto &e : entries)
        if (e.type == type)
            return e.value;
    return {};
}

// ----------------------------------------------------------------
// DATA_FRAME payload parser
// ----------------------------------------------------------------

bool EcpCodec::parseDataFrame(const QByteArray &payload, EcpDataPayload &out)
{
    // Fixed header: streamId(1)+channelId(1)+signalId(2)+format(1)+unit(1)
    //               +ts0(8)+dt(4)+N(2) = 20 bytes
    if (payload.size() < 20)
        return false;

    const auto *d = reinterpret_cast<const uint8_t *>(payload.constData());

    out.streamId  = d[0];
    out.channelId = d[1];
    out.signalId  = static_cast<uint16_t>(d[2]) | (static_cast<uint16_t>(d[3]) << 8);
    out.format    = d[4];
    out.unit      = d[5];

    uint64_t ts0 = 0;
    std::memcpy(&ts0, d + 6, 8);
    out.ts0_us = ts0;

    uint32_t dt = 0;
    std::memcpy(&dt, d + 14, 4);
    out.dt_us = dt;

    uint16_t n = static_cast<uint16_t>(d[18]) | (static_cast<uint16_t>(d[19]) << 8);

    // Determine per-sample byte size
    int ssize = 0;
    switch (out.format) {
    case EcpFormat::U16: ssize = 2; break;
    case EcpFormat::I16: ssize = 2; break;
    case EcpFormat::I32: ssize = 4; break;
    case EcpFormat::F32: ssize = 4; break;
    default: return false;
    }

    if (payload.size() < 20 + n * ssize)
        return false;

    out.samples.clear();
    out.samples.reserve(n);

    const uint8_t *s = d + 20;
    for (int i = 0; i < n; ++i) {
        double val = 0.0;
        switch (out.format) {
        case EcpFormat::U16: { uint16_t v; std::memcpy(&v, s, 2); val = v; s += 2; break; }
        case EcpFormat::I16: { int16_t  v; std::memcpy(&v, s, 2); val = v; s += 2; break; }
        case EcpFormat::I32: { int32_t  v; std::memcpy(&v, s, 4); val = v; s += 4; break; }
        case EcpFormat::F32: { float    v; std::memcpy(&v, s, 4); val = v; s += 4; break; }
        }
        out.samples.append(val);
    }

    return true;
}
