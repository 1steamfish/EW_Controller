#pragma once
#include "ecpcontroller.h"
#include "chartwidget.h"
#include "serialtransport.h"

#include <QMainWindow>
#include <QComboBox>
#include <QSpinBox>
#include <QDoubleSpinBox>
#include <QLabel>
#include <QPushButton>
#include <QGroupBox>
#include <QCheckBox>
#include <QStackedWidget>
#include <QTimer>
#include <QElapsedTimer>

// ----------------------------------------------------------------
// MainWindow – top-level application window
//
// Layout (horizontal splitter):
//   Left  – scrollable config panel (connection / channel / method)
//   Right – real-time chart + status bar
// ----------------------------------------------------------------
class MainWindow : public QMainWindow
{
    Q_OBJECT
public:
    explicit MainWindow(QWidget *parent = nullptr);
    ~MainWindow();

private slots:
    // Connection
    void onConnectClicked();
    void onRefreshPorts();
    void onSimulateModeToggled(bool checked);

    // Config
    void onApplyChannelConfig();
    void onMethodChanged(int index);
    void onRangeModeChanged(int index);
    void onMeasTypeChanged(int index);

    // Control
    void onStartClicked();
    void onStopClicked();

    // EcpController responses
    void onHelloResponse(const QString &deviceId,
                         const QString &fwVersion,
                         uint32_t capBits, uint16_t maxPayload);
    void onCfgChannelAck(bool success, uint16_t resultCode);
    void onStartMeasAck(bool success, uint8_t streamId, uint16_t resultCode);
    void onStopMeasAck(bool success, uint16_t resultCode);
    void onDataFrameArrived(const EcpDataPayload &data);
    void onCommandTimeout(uint16_t msgType);

    // Simulation tick
    void onSimTick();

    // Chart value update
    void onLatestValueChanged(double value, int channelId);

private:
    // ---- Widgets -------------------------------------------
    // Connection panel
    QComboBox     *m_portCombo;
    QComboBox     *m_baudCombo;
    QPushButton   *m_connectBtn;
    QPushButton   *m_refreshBtn;
    QCheckBox     *m_simCheck;
    QLabel        *m_connStatusLabel;

    // Channel config panel
    QSpinBox      *m_channelIdSpin;
    QComboBox     *m_measTypeCombo;  // Current / Voltage
    QComboBox     *m_rangeModeCombo; // Manual / Auto
    QComboBox     *m_rangeCombo;     // Manual range selector
    QDoubleSpinBox *m_biasVoltSpin;
    QComboBox     *m_sampleRateCombo;
    QPushButton   *m_applyConfigBtn;

    // Method panel
    QComboBox     *m_methodCombo;
    QStackedWidget *m_methodParams;

    // CA params (page 0)
    QDoubleSpinBox *m_caDurationSpin;
    QDoubleSpinBox *m_caBiasSpin;

    // OCP params (page 1)
    QDoubleSpinBox *m_ocpDurationSpin;

    // CV params (page 2)
    QDoubleSpinBox *m_cvEStartSpin;
    QDoubleSpinBox *m_cvEHighSpin;
    QDoubleSpinBox *m_cvELowSpin;
    QDoubleSpinBox *m_cvScanRateSpin;
    QSpinBox       *m_cvCyclesSpin;

    // DPV params (page 3)
    QDoubleSpinBox *m_dpvEStartSpin;
    QDoubleSpinBox *m_dpvEEndSpin;
    QDoubleSpinBox *m_dpvStepSpin;
    QDoubleSpinBox *m_dpvPulseSpin;
    QDoubleSpinBox *m_dpvAmpSpin;

    // LSV params (page 4)
    QDoubleSpinBox *m_lsvEStartSpin;
    QDoubleSpinBox *m_lsvEEndSpin;
    QDoubleSpinBox *m_lsvScanRateSpin;

    // Control
    QPushButton   *m_startBtn;
    QPushButton   *m_stopBtn;

    // Device info
    QLabel        *m_devIdLabel;
    QLabel        *m_fwVerLabel;

    // Chart + status
    ChartWidget   *m_chart;
    QLabel        *m_currentValueLabel;
    QLabel        *m_packetCountLabel;
    QLabel        *m_dropCountLabel;
    QLabel        *m_statusLabel; // status bar message

    // ---- Back-end -----------------------------------------
    SerialTransport *m_transport;
    EcpController   *m_controller;

    // Simulation
    QTimer         *m_simTimer;
    double          m_simTime  = 0.0;
    int             m_simPhase = 0; // for waveform generation

    // Stats
    quint64  m_packetCount = 0;
    quint64  m_dropCount   = 0;
    uint16_t m_lastSeq     = 0;
    bool     m_seqInit     = false;

    // Measurement start time (for chart X-axis)
    QElapsedTimer m_measTimer;
    bool          m_measRunning = false;

    // ---- Helpers ------------------------------------------
    QWidget   *buildConnectionPanel();
    QWidget   *buildChannelPanel();
    QWidget   *buildMethodPanel();
    QWidget   *buildDeviceInfoPanel();
    QGroupBox *makeGroup(const QString &title, QWidget *content);

    void setConnected(bool on);
    void setMeasuring(bool on);
    void updateRangeCombo();
    void updateStatusBar(const QString &msg);
    void appendLog(const QString &msg);

    // Current measurement type (maps EcpUnit::AMP / VOLT)
    uint8_t currentUnit() const;
    // Current method mode ID
    uint8_t currentModeId() const;
    // RTIA from selected manual range
    uint32_t currentRtiaOhm() const;
    // PGA gain from selected manual range
    uint8_t currentPgaGain() const;

    // Range labels for current / voltage measurement types
    static QStringList currentRangeLabels();
    static QStringList voltageRangeLabels();

    // Simulation helpers
    void generateSimSamples();

    bool m_isConnected = false;
};
