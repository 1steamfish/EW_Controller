/**
 * CRC calculation utilities for ECP v1
 */

/**
 * CRC-16/CCITT-FALSE
 * poly: 0x1021, init: 0xFFFF, xorout: 0x0000, refin: false, refout: false
 */
export function crc16CcittFalse(data: Uint8Array): number {
  let crc = 0xFFFF;

  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8;

    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
    }
  }

  return crc & 0xFFFF;
}

/**
 * CRC-32/ISO-HDLC
 * poly: 0x04C11DB7, init: 0xFFFFFFFF, refin: true, refout: true, xorout: 0xFFFFFFFF
 */
export function crc32IsoHdlc(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;

  for (let i = 0; i < data.length; i++) {
    let byte = data[i];

    // Reflect byte
    byte = ((byte & 0x55) << 1) | ((byte & 0xAA) >> 1);
    byte = ((byte & 0x33) << 2) | ((byte & 0xCC) >> 2);
    byte = ((byte & 0x0F) << 4) | ((byte & 0xF0) >> 4);

    crc ^= byte;

    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xEDB88320;
      } else {
        crc = crc >>> 1;
      }
    }
  }

  return (crc ^ 0xFFFFFFFF) >>> 0;
}
