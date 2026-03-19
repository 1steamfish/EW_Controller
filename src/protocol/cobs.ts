/**
 * COBS (Consistent Overhead Byte Stuffing) encoding/decoding
 * Used for UART framing in ECP v1
 */

/**
 * COBS encode - removes all 0x00 bytes and adds framing
 */
export function cobsEncode(data: Uint8Array): Uint8Array {
  const encoded = new Uint8Array(data.length + Math.ceil(data.length / 254) + 1);
  let readIndex = 0;
  let writeIndex = 1;
  let codeIndex = 0;
  let code = 1;

  while (readIndex < data.length) {
    if (data[readIndex] === 0) {
      encoded[codeIndex] = code;
      code = 1;
      codeIndex = writeIndex++;
      readIndex++;
    } else {
      encoded[writeIndex++] = data[readIndex++];
      code++;
      if (code === 0xFF) {
        encoded[codeIndex] = code;
        code = 1;
        codeIndex = writeIndex++;
      }
    }
  }

  encoded[codeIndex] = code;

  return encoded.slice(0, writeIndex);
}

/**
 * COBS decode
 */
export function cobsDecode(data: Uint8Array): Uint8Array {
  const decoded = new Uint8Array(data.length);
  let readIndex = 0;
  let writeIndex = 0;

  while (readIndex < data.length) {
    const code = data[readIndex++];

    if (code === 0) {
      throw new Error('COBS decode error: unexpected zero');
    }

    for (let i = 1; i < code && readIndex < data.length; i++) {
      decoded[writeIndex++] = data[readIndex++];
    }

    if (code < 0xFF && readIndex < data.length) {
      decoded[writeIndex++] = 0;
    }
  }

  return decoded.slice(0, writeIndex);
}
