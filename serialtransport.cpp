#include "serialtransport.h"
#include "cobs.h"

#include <QSerialPortInfo>

SerialTransport::SerialTransport(QObject *parent)
    : QObject(parent)
    , m_serial(new QSerialPort(this))
{
    connect(m_serial, &QSerialPort::readyRead,
            this,     &SerialTransport::onReadyRead);
    connect(m_serial, &QSerialPort::errorOccurred,
            this,     &SerialTransport::onErrorOccurred);
}

SerialTransport::~SerialTransport()
{
    close();
}

bool SerialTransport::open(const QString &portName, int baudRate)
{
    if (m_serial->isOpen())
        m_serial->close();

    m_rxBuf.clear();
    m_serial->setPortName(portName);
    m_serial->setBaudRate(baudRate);
    m_serial->setDataBits(QSerialPort::Data8);
    m_serial->setParity(QSerialPort::NoParity);
    m_serial->setStopBits(QSerialPort::OneStop);
    m_serial->setFlowControl(QSerialPort::NoFlowControl);

    if (!m_serial->open(QIODevice::ReadWrite)) {
        emit errorOccurred(m_serial->errorString());
        return false;
    }
    return true;
}

void SerialTransport::close()
{
    if (m_serial->isOpen())
        m_serial->close();
    m_rxBuf.clear();
}

bool SerialTransport::isOpen() const
{
    return m_serial->isOpen();
}

QString SerialTransport::portName() const
{
    return m_serial->portName();
}

void SerialTransport::send(const QByteArray &cobsFrame)
{
    if (!m_serial->isOpen())
        return;
    m_serial->write(cobsFrame);
}

void SerialTransport::onReadyRead()
{
    m_rxBuf.append(m_serial->readAll());
    processRxBuffer();
}

void SerialTransport::processRxBuffer()
{
    // Split on 0x00 COBS frame delimiters
    int delimPos;
    while ((delimPos = m_rxBuf.indexOf('\x00')) != -1) {
        QByteArray encoded = m_rxBuf.left(delimPos);
        m_rxBuf.remove(0, delimPos + 1); // remove chunk + delimiter

        if (encoded.isEmpty())
            continue; // ignore spurious delimiters

        QByteArray raw = cobs_decode(encoded);
        if (!raw.isEmpty())
            emit frameReceived(raw);
    }
}

void SerialTransport::onErrorOccurred(QSerialPort::SerialPortError err)
{
    if (err != QSerialPort::NoError)
        emit errorOccurred(m_serial->errorString());
}
