#pragma once
#include <QByteArray>

// COBS encode: returns encoded data (no trailing 0x00 frame delimiter).
// Caller must append 0x00 as the UART frame delimiter after the returned data.
QByteArray cobs_encode(const QByteArray &input);

// COBS decode: input is the data between two 0x00 frame delimiters (the
// delimiter itself must NOT be included).  Returns the original data, or an
// empty QByteArray on error.
QByteArray cobs_decode(const QByteArray &input);
