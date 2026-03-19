#include "cobs.h"
#include <cstdint>

// Consistent Overhead Byte Stuffing (COBS)
// Reference: Cheshire & Baker, "Consistent Overhead Byte Stuffing", IEEE/ACM
// Transactions on Networking, Aug 1999.

QByteArray cobs_encode(const QByteArray &input)
{
    // Worst-case output size: input.size() + input.size()/254 + 1
    QByteArray out;
    out.resize(input.size() + input.size() / 254 + 2);

    auto *src = reinterpret_cast<const uint8_t *>(input.constData());
    auto *dst = reinterpret_cast<uint8_t *>(out.data());

    int   outLen  = 0;
    int   codeIdx = 0;  // index of the current overhead code byte
    uint8_t code  = 1;  // distance to next zero (or end)

    dst[codeIdx] = 0;  // placeholder
    outLen = 1;

    for (int i = 0; i < input.size(); ++i) {
        if (src[i] == 0x00) {
            // Flush current block
            dst[codeIdx] = code;
            codeIdx = outLen;
            dst[outLen++] = 0; // placeholder for next block
            code = 1;
        } else {
            dst[outLen++] = src[i];
            ++code;
            if (code == 0xFF) {
                // Maximum block size reached – close without appending zero
                dst[codeIdx] = code;
                codeIdx = outLen;
                dst[outLen++] = 0; // placeholder
                code = 1;
            }
        }
    }
    dst[codeIdx] = code; // write last code byte

    out.resize(outLen);
    return out;
}

QByteArray cobs_decode(const QByteArray &input)
{
    if (input.isEmpty())
        return {};

    QByteArray out;
    out.reserve(input.size());

    const auto *src = reinterpret_cast<const uint8_t *>(input.constData());
    const int len = input.size();
    int i = 0;

    while (i < len) {
        uint8_t code = src[i++];
        if (code == 0)
            return {}; // 0x00 must not appear inside COBS-encoded data

        // Copy (code-1) data bytes
        for (uint8_t j = 1; j < code; ++j) {
            if (i >= len)
                return {}; // truncated packet
            out.append(static_cast<char>(src[i++]));
        }

        // Append a zero byte after the block, UNLESS:
        //   • code == 0xFF  (no zero follows by COBS convention)
        //   • this was the last block (i >= len)
        if (code < 0xFF && i < len)
            out.append('\x00');
    }

    return out;
}
