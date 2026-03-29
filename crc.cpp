#include "crc.h"

// ----------------------------------------------------------------
// CRC-16/CCITT-FALSE
// poly=0x1021, init=0xFFFF, refin=false, refout=false, xorout=0x0000
// ----------------------------------------------------------------
uint16_t crc16_ccitt(const uint8_t *data, size_t length)
{
    uint16_t crc = 0xFFFF;
    for (size_t i = 0; i < length; ++i) {
        crc ^= static_cast<uint16_t>(data[i]) << 8;
        for (int b = 0; b < 8; ++b) {
            if (crc & 0x8000u)
                crc = static_cast<uint16_t>((crc << 1) ^ 0x1021u);
            else
                crc = static_cast<uint16_t>(crc << 1);
        }
    }
    return crc;
}

// ----------------------------------------------------------------
// CRC-32/ISO-HDLC  (standard "CRC-32b")
// poly=0x04C11DB7, init=0xFFFFFFFF, refin=true, refout=true, xorout=0xFFFFFFFF
// ----------------------------------------------------------------
static uint32_t s_crc32Table[256];
static bool     s_crc32TableReady = false;

static void buildCrc32Table()
{
    for (uint32_t i = 0; i < 256; ++i) {
        uint32_t c = i;
        for (int b = 0; b < 8; ++b) {
            if (c & 1u)
                c = 0xEDB88320u ^ (c >> 1);
            else
                c >>= 1;
        }
        s_crc32Table[i] = c;
    }
    s_crc32TableReady = true;
}

uint32_t crc32_iso_hdlc(const uint8_t *data, size_t length)
{
    if (!s_crc32TableReady)
        buildCrc32Table();

    uint32_t crc = 0xFFFFFFFFu;
    for (size_t i = 0; i < length; ++i)
        crc = s_crc32Table[(crc ^ data[i]) & 0xFFu] ^ (crc >> 8);
    return crc ^ 0xFFFFFFFFu;
}
