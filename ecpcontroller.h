#pragma once
#include "ecpframe.h"
#include "serialtransport.h"

#include <QObject>
#include <QTimer>
#include <QMap>

// ----------------------------------------------------------------
// EcpController – high-level ECP v1 protocol controller.
//
// Responsibilities:
//  • Build and send ECP commands via SerialTransport.
//  • Track pending ACK-required commands; retry up to 3 times
//    (300 ms timeout) before emitting commandTimeout().
//  • Decode incoming frames and emit typed signals.
// ----------------------------------------------------------------
class EcpController : public QObject
{
    Q_OBJECT
public:
    explicit EcpController(QObject *parent = nullptr);
    ~EcpController();

    void setTransport(SerialTransport *transport);

    // ---- Commands -------------------------------------------
    // HELLO – capability negotiation (0x0001)
    void sendHello();

    // PING – keep-alive (0x0003)
    void sendPing();

    // CFG_CHANNEL – configure one channel (0x0110)
    void sendCfgChannel(uint8_t  channelId,
                        uint8_t  modeId,
                        uint8_t  pgaGain,
                        uint32_t rtiaOhm,
                        uint32_t adcRateSps,
                        float    biasVolt,
                        float    dacVolt);

    // START_MEAS – begin measurement (0x0200)
    void sendStartMeas(uint8_t  channelId,
                       uint8_t  streamId,
                       uint16_t signalId,
                       uint32_t durationMs);

    // STOP_MEAS – stop measurement (0x0202)
    void sendStopMeas(uint8_t channelId);

    // GET_STATUS (0x0204)
    void sendGetStatus();

signals:
    // Responses
    void helloResponse(const QString &deviceId,
                       const QString &fwVersion,
                       uint32_t       capBits,
                       uint16_t       maxPayload);
    void pingResponse(uint64_t deviceTimeUs);
    void cfgChannelAck(bool success, uint16_t resultCode);
    void startMeasAck(bool success, uint8_t assignedStreamId, uint16_t resultCode);
    void stopMeasAck(bool success, uint16_t resultCode);
    void statusResponse(uint16_t resultCode);

    // Real-time data
    void dataFrameArrived(const EcpDataPayload &data);

    // Reliability
    void commandTimeout(uint16_t msgType); // sent after all retries exhausted

private slots:
    void onFrameReceived(const QByteArray &rawFrame);
    void onRetryTimerFired();

private:
    // ---- Pending ACK bookkeeping ---------------------------
    struct PendingAck {
        uint16_t   reqMsgType;   // sent request type
        uint16_t   rspMsgType;   // expected ACK type
        QByteArray cobsFrame;    // original frame for retry
        int        retries = 0;
        QTimer    *timer   = nullptr;
    };

    static constexpr int k_maxRetries   = 3;
    static constexpr int k_timeoutMs    = 300;

    SerialTransport                *m_transport  = nullptr;
    QMap<uint16_t, PendingAck>      m_pendingAcks; // keyed by msgId
    uint16_t                        m_msgIdCounter = 1;
    uint16_t                        m_seqCounter   = 0;

    uint16_t allocMsgId() { return m_msgIdCounter++; }
    uint16_t allocSeq()   { return m_seqCounter++;   }

    // Send with ACK_REQ; registers in m_pendingAcks
    void sendReliable(uint16_t reqMsgType,
                      uint16_t rspMsgType,
                      uint16_t msgId,
                      const QByteArray &payload);

    // Dispatch parsed frame to the right handler
    void dispatchFrame(const EcpFrame &frame);
    void handleHelloRsp    (const EcpFrame &f);
    void handlePongRsp     (const EcpFrame &f);
    void handleCfgChRsp    (const EcpFrame &f);
    void handleStartMeasRsp(const EcpFrame &f);
    void handleStopMeasRsp (const EcpFrame &f);
    void handleStatusRsp   (const EcpFrame &f);
    void handleDataFrame   (const EcpFrame &f);
};
