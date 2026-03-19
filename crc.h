#pragma once
#include <cstdint>
#include <cstddef>

// CRC-16/CCITT-FALSE: poly=0x1021, init=0xFFFF, refin=false, refout=false, xorout=0x0000
// Used for ECP HeaderCrc16 (covers first 15 bytes of header)
uint16_t crc16_ccitt(const uint8_t *data, size_t length);

// CRC-32/ISO-HDLC: poly=0x04C11DB7, init=0xFFFFFFFF, refin=true, refout=true, xorout=0xFFFFFFFF
// Used for ECP FrameCrc32 (covers header + payload)
uint32_t crc32_iso_hdlc(const uint8_t *data, size_t length);
