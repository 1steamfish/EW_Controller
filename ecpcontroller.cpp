#include "ecpcontroller.h"
#include "ecpcodec.h"

#include <QVariant>
#include <cstring>

// ----------------------------------------------------------------
// Construction / destruction
// ----------------------------------------------------------------

EcpController::EcpController(QObject *parent)
    : QObject(parent)
{}

EcpController::~EcpController()
{
    // Clean up any pending timers
    for (auto &p : m_pendingAcks)
        if (p.timer) {
            p.timer->stop();
            p.timer->deleteLater();
        }
    m_pendingAcks.clear();
}

void EcpController::setTransport(SerialTransport *transport)
{
    if (m_transport)
        disconnect(m_transport, nullptr, this, nullptr);
    m_transport = transport;
    if (m_transport)
        connect(m_transport, &SerialTransport::frameReceived,
                this,        &EcpController::onFrameReceived);
}

// ----------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------

void EcpController::sendReliable(uint16_t reqMsgType,
                                 uint16_t rspMsgType,
                                 uint16_t msgId,
                                 const QByteArray &payload)
{
    if (!m_transport)
        return;

    QByteArray cobsFrame = EcpCodec::buildFrame(
        reqMsgType, EcpFlag::ACK_REQ,
        msgId, allocSeq(), payload);

    m_transport->send(cobsFrame);

    // Set up retry bookkeeping
    PendingAck pa;
    pa.reqMsgType = reqMsgType;
    pa.rspMsgType = rspMsgType;
    pa.cobsFrame  = cobsFrame;
    pa.retries    = 0;

    auto *timer = new QTimer(this);
    timer->setSingleShot(true);
    timer->setProperty("msgId", static_cast<uint>(msgId));
    connect(timer, &QTimer::timeout, this, &EcpController::onRetryTimerFired);
    timer->start(k_timeoutMs);
    pa.timer = timer;

    m_pendingAcks.insert(msgId, pa);
}

// ----------------------------------------------------------------
// Commands
// ----------------------------------------------------------------

void EcpController::sendHello()
{
    uint16_t msgId = allocMsgId();
    QByteArray payload;
    payload += EcpCodec::tlvU16(EcpTlv::MAX_PAYLOAD, 512);
    sendReliable(EcpMsgType::HELLO_REQ, EcpMsgType::HELLO_RSP, msgId, payload);
}

void EcpController::sendPing()
{
    if (!m_transport)
        return;
    QByteArray payload; // no TLV needed
    QByteArray frame = EcpCodec::buildFrame(
        EcpMsgType::PING_REQ, EcpFlag::ACK_REQ,
        allocMsgId(), allocSeq(), payload);
    m_transport->send(frame);
}

void EcpController::sendCfgChannel(uint8_t  channelId,
                                   uint8_t  modeId,
                                   uint8_t  pgaGain,
                                   uint32_t rtiaOhm,
                                   uint32_t adcRateSps,
                                   float    biasVolt,
                                   float    dacVolt)
{
    QByteArray payload;
    payload += EcpCodec::tlvU8 (EcpTlv::CHANNEL_ID,    channelId);
    payload += EcpCodec::tlvU8 (EcpTlv::MODE_ID,       modeId);
    payload += EcpCodec::tlvU8 (EcpTlv::PGA_GAIN,      pgaGain);
    payload += EcpCodec::tlvU32(EcpTlv::RTIA_OHM,      rtiaOhm);
    payload += EcpCodec::tlvU32(EcpTlv::ADC_RATE_SPS,  adcRateSps);
    payload += EcpCodec::tlvF32(EcpTlv::BIAS_VOLT_F32, biasVolt);
    payload += EcpCodec::tlvF32(EcpTlv::DAC_VOLT_F32,  dacVolt);

    uint16_t msgId = allocMsgId();
    sendReliable(EcpMsgType::CFG_CHANNEL_REQ,
                 EcpMsgType::CFG_CHANNEL_RSP,
                 msgId, payload);
}

void EcpController::sendStartMeas(uint8_t  channelId,
                                  uint8_t  streamId,
                                  uint16_t signalId,
                                  uint32_t durationMs)
{
    QByteArray payload;
    payload += EcpCodec::tlvU8 (EcpTlv::CHANNEL_ID,   channelId);
    payload += EcpCodec::tlvU8 (EcpTlv::STREAM_ID,    streamId);
    payload += EcpCodec::tlvU16(EcpTlv::SIGNAL_ID,    signalId);
    payload += EcpCodec::tlvU32(EcpTlv::DURATION_MS,  durationMs);

    uint16_t msgId = allocMsgId();
    sendReliable(EcpMsgType::START_MEAS_REQ,
                 EcpMsgType::START_MEAS_RSP,
                 msgId, payload);
}

void EcpController::sendStopMeas(uint8_t channelId)
{
    QByteArray payload;
    payload += EcpCodec::tlvU8(EcpTlv::CHANNEL_ID, channelId);

    uint16_t msgId = allocMsgId();
    sendReliable(EcpMsgType::STOP_MEAS_REQ,
                 EcpMsgType::STOP_MEAS_RSP,
                 msgId, payload);
}

void EcpController::sendGetStatus()
{
    uint16_t msgId = allocMsgId();
    sendReliable(EcpMsgType::GET_STATUS_REQ,
                 EcpMsgType::GET_STATUS_RSP,
                 msgId, {});
}

// ----------------------------------------------------------------
// Frame reception
// ----------------------------------------------------------------

void EcpController::onFrameReceived(const QByteArray &rawFrame)
{
    EcpFrame frame;
    if (!EcpCodec::parseFrame(rawFrame, frame))
        return;
    dispatchFrame(frame);
}

void EcpController::dispatchFrame(const EcpFrame &frame)
{
    switch (frame.msgType) {
    case EcpMsgType::HELLO_RSP:        handleHelloRsp(frame);     break;
    case EcpMsgType::PONG_RSP:         handlePongRsp(frame);      break;
    case EcpMsgType::CFG_CHANNEL_RSP:  handleCfgChRsp(frame);     break;
    case EcpMsgType::START_MEAS_RSP:   handleStartMeasRsp(frame); break;
    case EcpMsgType::STOP_MEAS_RSP:    handleStopMeasRsp(frame);  break;
    case EcpMsgType::GET_STATUS_RSP:   handleStatusRsp(frame);    break;
    case EcpMsgType::DATA_FRAME:       handleDataFrame(frame);    break;
    default: break;
    }
}

// ----------------------------------------------------------------
// Response handlers
// ----------------------------------------------------------------

void EcpController::handleHelloRsp(const EcpFrame &f)
{
    // ACK – stop pending timer
    auto it = m_pendingAcks.begin();
    while (it != m_pendingAcks.end()) {
        if (it->rspMsgType == EcpMsgType::HELLO_RSP) {
            if (it->timer) { it->timer->stop(); it->timer->deleteLater(); }
            it = m_pendingAcks.erase(it);
            break;
        } else ++it;
    }

    auto tlvs = EcpCodec::parseTlv(f.payload);
    QString deviceId  = QString::fromUtf8(EcpCodec::tlvGet(tlvs, EcpTlv::DEVICE_ID));
    QString fwVersion = QString::fromUtf8(EcpCodec::tlvGet(tlvs, EcpTlv::FW_VERSION));

    QByteArray capRaw = EcpCodec::tlvGet(tlvs, EcpTlv::CAP_BITS);
    uint32_t capBits = 0;
    if (capRaw.size() >= 4)
        std::memcpy(&capBits, capRaw.constData(), 4);

    QByteArray maxRaw = EcpCodec::tlvGet(tlvs, EcpTlv::MAX_PAYLOAD);
    uint16_t maxPayload = 512;
    if (maxRaw.size() >= 2)
        std::memcpy(&maxPayload, maxRaw.constData(), 2);

    emit helloResponse(deviceId, fwVersion, capBits, maxPayload);
}

void EcpController::handlePongRsp(const EcpFrame &f)
{
    auto tlvs = EcpCodec::parseTlv(f.payload);
    QByteArray tsRaw = EcpCodec::tlvGet(tlvs, EcpTlv::TIME_US);
    uint64_t ts = 0;
    if (tsRaw.size() >= 8)
        std::memcpy(&ts, tsRaw.constData(), 8);
    emit pingResponse(ts);
}

void EcpController::handleCfgChRsp(const EcpFrame &f)
{
    auto it = m_pendingAcks.begin();
    while (it != m_pendingAcks.end()) {
        if (it->rspMsgType == EcpMsgType::CFG_CHANNEL_RSP) {
            if (it->timer) { it->timer->stop(); it->timer->deleteLater(); }
            it = m_pendingAcks.erase(it);
            break;
        } else ++it;
    }

    auto tlvs = EcpCodec::parseTlv(f.payload);
    QByteArray rcRaw = EcpCodec::tlvGet(tlvs, EcpTlv::RESULT_CODE);
    uint16_t rc = 0;
    if (rcRaw.size() >= 2)
        std::memcpy(&rc, rcRaw.constData(), 2);
    emit cfgChannelAck(rc == EcpResult::OK, rc);
}

void EcpController::handleStartMeasRsp(const EcpFrame &f)
{
    auto it = m_pendingAcks.begin();
    while (it != m_pendingAcks.end()) {
        if (it->rspMsgType == EcpMsgType::START_MEAS_RSP) {
            if (it->timer) { it->timer->stop(); it->timer->deleteLater(); }
            it = m_pendingAcks.erase(it);
            break;
        } else ++it;
    }

    auto tlvs = EcpCodec::parseTlv(f.payload);
    uint16_t rc = 0;
    QByteArray rcRaw = EcpCodec::tlvGet(tlvs, EcpTlv::RESULT_CODE);
    if (rcRaw.size() >= 2)
        std::memcpy(&rc, rcRaw.constData(), 2);
    uint8_t streamId = 0;
    QByteArray siRaw = EcpCodec::tlvGet(tlvs, EcpTlv::STREAM_ID);
    if (!siRaw.isEmpty())
        streamId = static_cast<uint8_t>(siRaw[0]);
    emit startMeasAck(rc == EcpResult::OK, streamId, rc);
}

void EcpController::handleStopMeasRsp(const EcpFrame &f)
{
    auto it = m_pendingAcks.begin();
    while (it != m_pendingAcks.end()) {
        if (it->rspMsgType == EcpMsgType::STOP_MEAS_RSP) {
            if (it->timer) { it->timer->stop(); it->timer->deleteLater(); }
            it = m_pendingAcks.erase(it);
            break;
        } else ++it;
    }

    auto tlvs = EcpCodec::parseTlv(f.payload);
    uint16_t rc = 0;
    QByteArray rcRaw = EcpCodec::tlvGet(tlvs, EcpTlv::RESULT_CODE);
    if (rcRaw.size() >= 2)
        std::memcpy(&rc, rcRaw.constData(), 2);
    emit stopMeasAck(rc == EcpResult::OK, rc);
}

void EcpController::handleStatusRsp(const EcpFrame &f)
{
    auto it = m_pendingAcks.begin();
    while (it != m_pendingAcks.end()) {
        if (it->rspMsgType == EcpMsgType::GET_STATUS_RSP) {
            if (it->timer) { it->timer->stop(); it->timer->deleteLater(); }
            it = m_pendingAcks.erase(it);
            break;
        } else ++it;
    }

    auto tlvs = EcpCodec::parseTlv(f.payload);
    uint16_t rc = 0;
    QByteArray rcRaw = EcpCodec::tlvGet(tlvs, EcpTlv::RESULT_CODE);
    if (rcRaw.size() >= 2)
        std::memcpy(&rc, rcRaw.constData(), 2);
    emit statusResponse(rc);
}

void EcpController::handleDataFrame(const EcpFrame &f)
{
    EcpDataPayload data;
    if (EcpCodec::parseDataFrame(f.payload, data))
        emit dataFrameArrived(data);
}

// ----------------------------------------------------------------
// Retry timer
// ----------------------------------------------------------------

void EcpController::onRetryTimerFired()
{
    auto *timer = qobject_cast<QTimer *>(sender());
    if (!timer)
        return;

    uint16_t msgId = timer->property("msgId").toUInt();
    auto it = m_pendingAcks.find(msgId);
    if (it == m_pendingAcks.end())
        return;

    if (it->retries < k_maxRetries) {
        ++it->retries;
        // Retransmit
        if (m_transport)
            m_transport->send(it->cobsFrame);
        timer->start(k_timeoutMs);
    } else {
        uint16_t reqType = it->reqMsgType;
        timer->stop();
        timer->deleteLater();
        m_pendingAcks.erase(it);
        emit commandTimeout(reqType);
    }
}
