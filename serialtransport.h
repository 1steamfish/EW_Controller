#pragma once
#include <QObject>
#include <QSerialPort>
#include <QByteArray>

// ----------------------------------------------------------------
// SerialTransport – wraps QSerialPort with COBS framing.
//
// Sending  :  call send(cobsFrame) where cobsFrame is already
//             COBS-encoded with a trailing 0x00 delimiter
//             (i.e. the output of EcpCodec::buildFrame).
//
// Receiving:  the class accumulates incoming bytes, splits on
//             0x00 delimiter, COBS-decodes each chunk, and
//             emits frameReceived(rawFrame).
// ----------------------------------------------------------------
class SerialTransport : public QObject
{
    Q_OBJECT
public:
    explicit SerialTransport(QObject *parent = nullptr);
    ~SerialTransport();

    bool   open(const QString &portName, int baudRate);
    void   close();
    bool   isOpen() const;
    QString portName() const;

    // Send a complete COBS frame (including trailing 0x00 delimiter)
    void send(const QByteArray &cobsFrame);

signals:
    // Emitted for every successfully decoded ECP frame
    void frameReceived(const QByteArray &rawFrame);
    void errorOccurred(const QString &msg);

private slots:
    void onReadyRead();
    void onErrorOccurred(QSerialPort::SerialPortError err);

private:
    void processRxBuffer();

    QSerialPort *m_serial;
    QByteArray   m_rxBuf;
};
