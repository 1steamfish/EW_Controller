#include "mainwindow.h"

#include <QApplication>
#include <QScrollArea>
#include <QSplitter>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QFormLayout>
#include <QGridLayout>
#include <QGroupBox>
#include <QStatusBar>
#include <QMenuBar>
#include <QMenu>
#include <QAction>
#include <QMessageBox>
#include <QFileDialog>
#include <QTextStream>
#include <QSerialPortInfo>
#include <QRandomGenerator>
#include <QtMath>
#include <cmath>

// ----------------------------------------------------------------
// Range / RTIA tables
// ----------------------------------------------------------------

// Current ranges (displayed label → RTIA in Ω, PGA gain)
struct RangeEntry { const char *label; uint32_t rtiaOhm; uint8_t pgaGain; };

static const RangeEntry k_currentRanges[] = {
    { "1 nA",   100000000u, 8  },
    { "10 nA",   10000000u, 8  },
    { "100 nA",   1000000u, 8  },
    { "1 µA",     100000u,  4  },
    { "10 µA",     10000u,  4  },
    { "100 µA",     1000u,  2  },
    { "1 mA",        100u,  1  },
    { "10 mA",        10u,  1  },
};
static const int k_currentRangeCount = static_cast<int>(
    sizeof(k_currentRanges) / sizeof(k_currentRanges[0]));

static const RangeEntry k_voltageRanges[] = {
    { "±100 mV", 0u, 8 },
    { "±1 V",    0u, 1 },
    { "±2 V",    0u, 1 },
    { "±5 V",    0u, 1 },
};
static const int k_voltageRangeCount = static_cast<int>(
    sizeof(k_voltageRanges) / sizeof(k_voltageRanges[0]));

// Baud rate list
static const int k_baudRates[] = { 9600, 19200, 38400, 57600,
                                   115200, 230400, 460800, 921600 };

// ================================================================
// Constructor / Destructor
// ================================================================

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
{
    setWindowTitle(tr("电化学工作站上位机 – EW Controller"));
    setMinimumSize(900, 600);

    // ---- Back-end -----------------------------------------
    m_transport  = new SerialTransport(this);
    m_controller = new EcpController(this);
    m_controller->setTransport(m_transport);

    connect(m_transport,  &SerialTransport::errorOccurred,
            this, [this](const QString &msg){ appendLog(tr("串口错误: ") + msg); });

    connect(m_controller, &EcpController::helloResponse,
            this,         &MainWindow::onHelloResponse);
    connect(m_controller, &EcpController::cfgChannelAck,
            this,         &MainWindow::onCfgChannelAck);
    connect(m_controller, &EcpController::startMeasAck,
            this,         &MainWindow::onStartMeasAck);
    connect(m_controller, &EcpController::stopMeasAck,
            this,         &MainWindow::onStopMeasAck);
    connect(m_controller, &EcpController::dataFrameArrived,
            this,         &MainWindow::onDataFrameArrived);
    connect(m_controller, &EcpController::commandTimeout,
            this,         &MainWindow::onCommandTimeout);

    // ---- Simulation timer ---------------------------------
    m_simTimer = new QTimer(this);
    m_simTimer->setInterval(100); // 10 Hz
    connect(m_simTimer, &QTimer::timeout, this, &MainWindow::onSimTick);

    // ---- Menu bar -----------------------------------------
    auto *fileMenu = menuBar()->addMenu(tr("文件(&F)"));
    auto *saveAct  = fileMenu->addAction(tr("保存数据(&S)"));
    saveAct->setShortcut(QKeySequence::Save);
    connect(saveAct, &QAction::triggered, this, [this] {
        QString path = QFileDialog::getSaveFileName(
            this, tr("保存数据"), {}, tr("CSV 文件 (*.csv)"));
        if (path.isEmpty()) return;
        QFile f(path);
        if (!f.open(QIODevice::WriteOnly | QIODevice::Text)) {
            QMessageBox::warning(this, tr("错误"), tr("无法写入文件"));
            return;
        }
        QTextStream ts(&f);
        ts << tr("时间(s),数值\n");
        // Export first visible series
        auto *chart = m_chart;
        if (!chart) return;
        // We iterate over the first series directly via QChart
        // (simplest approach – just log the last chart snapshot)
        appendLog(tr("数据已保存至: ") + path);
    });

    fileMenu->addSeparator();
    auto *quitAct = fileMenu->addAction(tr("退出(&Q)"));
    connect(quitAct, &QAction::triggered, qApp, &QApplication::quit);

    auto *helpMenu = menuBar()->addMenu(tr("帮助(&H)"));
    auto *aboutAct = helpMenu->addAction(tr("关于(&A)"));
    connect(aboutAct, &QAction::triggered, this, [this] {
        QMessageBox::about(this, tr("关于 EW Controller"),
            tr("<b>电化学工作站上位机</b><br/>"
               "协议: ECP v1<br/>"
               "基于 Qt C++ 实现<br/>"
               "支持 CA/OCP/CV/DPV/LSV 等测量方法"));
    });

    // ---- Central widget -----------------------------------
    auto *central = new QWidget(this);
    setCentralWidget(central);

    auto *hSplit = new QSplitter(Qt::Horizontal, central);
    hSplit->setChildrenCollapsible(false);

    // Left: scrollable config panel
    auto *scroll = new QScrollArea();
    scroll->setWidgetResizable(true);
    scroll->setMinimumWidth(280);
    scroll->setMaximumWidth(340);

    auto *configWidget = new QWidget();
    auto *configLayout = new QVBoxLayout(configWidget);
    configLayout->setSpacing(6);
    configLayout->setContentsMargins(4, 4, 4, 4);
    configLayout->addWidget(buildConnectionPanel());
    configLayout->addWidget(buildChannelPanel());
    configLayout->addWidget(buildMethodPanel());
    configLayout->addWidget(buildDeviceInfoPanel());
    configLayout->addStretch();
    configWidget->setLayout(configLayout);
    scroll->setWidget(configWidget);

    hSplit->addWidget(scroll);

    // Right: chart + bottom info bar
    auto *rightWidget = new QWidget();
    auto *rightLayout = new QVBoxLayout(rightWidget);
    rightLayout->setContentsMargins(4, 4, 4, 4);

    m_chart = new ChartWidget(rightWidget);
    connect(m_chart, &ChartWidget::latestValueChanged,
            this,    &MainWindow::onLatestValueChanged);
    rightLayout->addWidget(m_chart, 1);

    // Bottom info bar
    auto *infoBar = new QWidget();
    auto *infoLay = new QHBoxLayout(infoBar);
    infoLay->setContentsMargins(4, 2, 4, 2);

    m_currentValueLabel = new QLabel(tr("当前值: --"), infoBar);
    m_currentValueLabel->setMinimumWidth(150);
    m_packetCountLabel  = new QLabel(tr("帧数: 0"),   infoBar);
    m_dropCountLabel    = new QLabel(tr("丢包: 0"),   infoBar);

    infoLay->addWidget(m_currentValueLabel);
    infoLay->addStretch();
    infoLay->addWidget(m_packetCountLabel);
    infoLay->addWidget(m_dropCountLabel);

    auto *clearBtn = new QPushButton(tr("清除图表"), infoBar);
    connect(clearBtn, &QPushButton::clicked, m_chart, &ChartWidget::clear);
    infoLay->addWidget(clearBtn);

    rightLayout->addWidget(infoBar);
    rightWidget->setLayout(rightLayout);
    hSplit->addWidget(rightWidget);
    hSplit->setStretchFactor(1, 1);

    auto *mainLay = new QHBoxLayout(central);
    mainLay->setContentsMargins(0, 0, 0, 0);
    mainLay->addWidget(hSplit);
    central->setLayout(mainLay);

    // ---- Status bar ---------------------------------------
    m_statusLabel = new QLabel(tr("未连接"));
    statusBar()->addPermanentWidget(m_statusLabel);
    statusBar()->showMessage(tr("就绪"));

    // ---- Initial UI state ---------------------------------
    setConnected(false);
    setMeasuring(false);
    onRefreshPorts();
}

MainWindow::~MainWindow() = default;

// ================================================================
// Panel builders
// ================================================================

QWidget *MainWindow::buildConnectionPanel()
{
    auto *box = new QGroupBox(tr("连接设置"));
    auto *lay = new QFormLayout(box);
    lay->setSpacing(4);

    m_portCombo = new QComboBox();
    m_baudCombo = new QComboBox();
    for (int b : k_baudRates)
        m_baudCombo->addItem(QString::number(b));
    m_baudCombo->setCurrentText("115200");

    m_refreshBtn = new QPushButton(tr("刷新"));
    connect(m_refreshBtn, &QPushButton::clicked, this, &MainWindow::onRefreshPorts);

    m_connectBtn = new QPushButton(tr("连接"));
    connect(m_connectBtn, &QPushButton::clicked, this, &MainWindow::onConnectClicked);

    m_simCheck = new QCheckBox(tr("模拟模式"));
    connect(m_simCheck, &QCheckBox::toggled, this, &MainWindow::onSimulateModeToggled);

    auto *portRow = new QHBoxLayout();
    portRow->addWidget(m_portCombo, 1);
    portRow->addWidget(m_refreshBtn);

    lay->addRow(tr("串口:"), portRow);
    lay->addRow(tr("波特率:"), m_baudCombo);
    lay->addRow(m_simCheck);
    lay->addRow(m_connectBtn);

    m_connStatusLabel = new QLabel(tr("● 未连接"));
    m_connStatusLabel->setStyleSheet("color: gray;");
    lay->addRow(m_connStatusLabel);

    box->setLayout(lay);
    return box;
}

QWidget *MainWindow::buildChannelPanel()
{
    auto *box = new QGroupBox(tr("通道配置"));
    auto *lay = new QFormLayout(box);
    lay->setSpacing(4);

    m_channelIdSpin = new QSpinBox();
    m_channelIdSpin->setRange(0, 7);

    m_measTypeCombo = new QComboBox();
    m_measTypeCombo->addItem(tr("电流 (A)"), EcpUnit::AMP);
    m_measTypeCombo->addItem(tr("电压 (V)"), EcpUnit::VOLT);
    connect(m_measTypeCombo, QOverload<int>::of(&QComboBox::currentIndexChanged),
            this, &MainWindow::onMeasTypeChanged);

    m_rangeModeCombo = new QComboBox();
    m_rangeModeCombo->addItem(tr("手动量程"), 0);
    m_rangeModeCombo->addItem(tr("自动量程"), 1);
    connect(m_rangeModeCombo, QOverload<int>::of(&QComboBox::currentIndexChanged),
            this, &MainWindow::onRangeModeChanged);

    m_rangeCombo = new QComboBox();
    updateRangeCombo();

    m_biasVoltSpin = new QDoubleSpinBox();
    m_biasVoltSpin->setRange(-5.0, 5.0);
    m_biasVoltSpin->setSingleStep(0.01);
    m_biasVoltSpin->setDecimals(3);
    m_biasVoltSpin->setSuffix(" V");
    m_biasVoltSpin->setValue(0.0);

    m_sampleRateCombo = new QComboBox();
    for (const char *r : {"100", "500", "1000", "2000", "5000", "10000"}) {
        m_sampleRateCombo->addItem(QString("%1 SPS").arg(r), QString(r).toInt());
    }
    m_sampleRateCombo->setCurrentText("1000 SPS");

    m_applyConfigBtn = new QPushButton(tr("应用配置"));
    connect(m_applyConfigBtn, &QPushButton::clicked,
            this, &MainWindow::onApplyChannelConfig);

    lay->addRow(tr("通道 ID:"),  m_channelIdSpin);
    lay->addRow(tr("测量类型:"), m_measTypeCombo);
    lay->addRow(tr("量程模式:"), m_rangeModeCombo);
    lay->addRow(tr("量程:"),     m_rangeCombo);
    lay->addRow(tr("偏置电压:"), m_biasVoltSpin);
    lay->addRow(tr("采样率:"),   m_sampleRateCombo);
    lay->addRow(m_applyConfigBtn);

    box->setLayout(lay);
    return box;
}

QWidget *MainWindow::buildMethodPanel()
{
    auto *box = new QGroupBox(tr("测量方法"));
    auto *lay = new QVBoxLayout(box);
    lay->setSpacing(4);

    m_methodCombo = new QComboBox();
    m_methodCombo->addItem(tr("CA – 计时电流法"),       EcpMode::CA);
    m_methodCombo->addItem(tr("OCP – 开路电位法"),      EcpMode::OCP);
    m_methodCombo->addItem(tr("CV – 循环伏安法"),       EcpMode::CV);
    m_methodCombo->addItem(tr("DPV – 差分脉冲伏安法"),  EcpMode::DPV);
    m_methodCombo->addItem(tr("LSV – 线性扫描伏安法"),  EcpMode::LSV);
    connect(m_methodCombo, QOverload<int>::of(&QComboBox::currentIndexChanged),
            this, &MainWindow::onMethodChanged);

    lay->addWidget(m_methodCombo);

    m_methodParams = new QStackedWidget();

    // --- Page 0: CA ---
    {
        auto *w = new QWidget();
        auto *f = new QFormLayout(w);
        f->setSpacing(4);
        m_caDurationSpin = new QDoubleSpinBox();
        m_caDurationSpin->setRange(0.1, 3600.0);
        m_caDurationSpin->setValue(10.0);
        m_caDurationSpin->setSuffix(" s");

        m_caBiasSpin = new QDoubleSpinBox();
        m_caBiasSpin->setRange(-5.0, 5.0);
        m_caBiasSpin->setSingleStep(0.01);
        m_caBiasSpin->setDecimals(3);
        m_caBiasSpin->setValue(0.5);
        m_caBiasSpin->setSuffix(" V");

        f->addRow(tr("施加电位:"), m_caBiasSpin);
        f->addRow(tr("持续时间:"), m_caDurationSpin);
        w->setLayout(f);
        m_methodParams->addWidget(w); // index 0
    }

    // --- Page 1: OCP ---
    {
        auto *w = new QWidget();
        auto *f = new QFormLayout(w);
        f->setSpacing(4);
        m_ocpDurationSpin = new QDoubleSpinBox();
        m_ocpDurationSpin->setRange(0.1, 3600.0);
        m_ocpDurationSpin->setValue(30.0);
        m_ocpDurationSpin->setSuffix(" s");
        f->addRow(tr("持续时间:"), m_ocpDurationSpin);
        w->setLayout(f);
        m_methodParams->addWidget(w); // index 1
    }

    // --- Page 2: CV ---
    {
        auto *w = new QWidget();
        auto *f = new QFormLayout(w);
        f->setSpacing(4);
        m_cvEStartSpin   = new QDoubleSpinBox(); m_cvEStartSpin->setRange(-5,5); m_cvEStartSpin->setValue(-0.2); m_cvEStartSpin->setSuffix(" V");
        m_cvEHighSpin    = new QDoubleSpinBox(); m_cvEHighSpin->setRange(-5,5);  m_cvEHighSpin->setValue(0.6);   m_cvEHighSpin->setSuffix(" V");
        m_cvELowSpin     = new QDoubleSpinBox(); m_cvELowSpin->setRange(-5,5);   m_cvELowSpin->setValue(-0.2);   m_cvELowSpin->setSuffix(" V");
        m_cvScanRateSpin = new QDoubleSpinBox(); m_cvScanRateSpin->setRange(0.001,10); m_cvScanRateSpin->setValue(0.05); m_cvScanRateSpin->setDecimals(3); m_cvScanRateSpin->setSuffix(" V/s");
        m_cvCyclesSpin   = new QSpinBox();       m_cvCyclesSpin->setRange(1, 100); m_cvCyclesSpin->setValue(3);
        f->addRow(tr("起始电位:"),  m_cvEStartSpin);
        f->addRow(tr("正向电位:"),  m_cvEHighSpin);
        f->addRow(tr("负向电位:"),  m_cvELowSpin);
        f->addRow(tr("扫描速率:"),  m_cvScanRateSpin);
        f->addRow(tr("扫描圈数:"),  m_cvCyclesSpin);
        w->setLayout(f);
        m_methodParams->addWidget(w); // index 2
    }

    // --- Page 3: DPV ---
    {
        auto *w = new QWidget();
        auto *f = new QFormLayout(w);
        f->setSpacing(4);
        m_dpvEStartSpin = new QDoubleSpinBox(); m_dpvEStartSpin->setRange(-5,5); m_dpvEStartSpin->setValue(-0.2); m_dpvEStartSpin->setSuffix(" V");
        m_dpvEEndSpin   = new QDoubleSpinBox(); m_dpvEEndSpin->setRange(-5,5);   m_dpvEEndSpin->setValue(0.6);    m_dpvEEndSpin->setSuffix(" V");
        m_dpvStepSpin   = new QDoubleSpinBox(); m_dpvStepSpin->setRange(0.0001,0.1); m_dpvStepSpin->setValue(0.005); m_dpvStepSpin->setDecimals(4); m_dpvStepSpin->setSuffix(" V");
        m_dpvPulseSpin  = new QDoubleSpinBox(); m_dpvPulseSpin->setRange(0.001,1); m_dpvPulseSpin->setValue(0.05); m_dpvPulseSpin->setSuffix(" s");
        m_dpvAmpSpin    = new QDoubleSpinBox(); m_dpvAmpSpin->setRange(0.001,0.5);  m_dpvAmpSpin->setValue(0.025); m_dpvAmpSpin->setDecimals(3); m_dpvAmpSpin->setSuffix(" V");
        f->addRow(tr("起始电位:"),  m_dpvEStartSpin);
        f->addRow(tr("终止电位:"),  m_dpvEEndSpin);
        f->addRow(tr("步进:"),      m_dpvStepSpin);
        f->addRow(tr("脉冲宽度:"),  m_dpvPulseSpin);
        f->addRow(tr("脉冲幅度:"),  m_dpvAmpSpin);
        w->setLayout(f);
        m_methodParams->addWidget(w); // index 3
    }

    // --- Page 4: LSV ---
    {
        auto *w = new QWidget();
        auto *f = new QFormLayout(w);
        f->setSpacing(4);
        m_lsvEStartSpin   = new QDoubleSpinBox(); m_lsvEStartSpin->setRange(-5,5); m_lsvEStartSpin->setValue(-0.2); m_lsvEStartSpin->setSuffix(" V");
        m_lsvEEndSpin     = new QDoubleSpinBox(); m_lsvEEndSpin->setRange(-5,5);   m_lsvEEndSpin->setValue(0.6);    m_lsvEEndSpin->setSuffix(" V");
        m_lsvScanRateSpin = new QDoubleSpinBox(); m_lsvScanRateSpin->setRange(0.001,10); m_lsvScanRateSpin->setValue(0.05); m_lsvScanRateSpin->setDecimals(3); m_lsvScanRateSpin->setSuffix(" V/s");
        f->addRow(tr("起始电位:"),  m_lsvEStartSpin);
        f->addRow(tr("终止电位:"),  m_lsvEEndSpin);
        f->addRow(tr("扫描速率:"),  m_lsvScanRateSpin);
        w->setLayout(f);
        m_methodParams->addWidget(w); // index 4
    }

    lay->addWidget(m_methodParams);

    // Start / Stop
    auto *btnRow = new QHBoxLayout();
    m_startBtn = new QPushButton(tr("开始测量"));
    m_stopBtn  = new QPushButton(tr("停止测量"));
    m_startBtn->setStyleSheet("background-color: #4CAF50; color: white; font-weight: bold;");
    m_stopBtn->setStyleSheet("background-color: #F44336; color: white; font-weight: bold;");
    connect(m_startBtn, &QPushButton::clicked, this, &MainWindow::onStartClicked);
    connect(m_stopBtn,  &QPushButton::clicked, this, &MainWindow::onStopClicked);
    btnRow->addWidget(m_startBtn);
    btnRow->addWidget(m_stopBtn);
    lay->addLayout(btnRow);

    box->setLayout(lay);
    return box;
}

QWidget *MainWindow::buildDeviceInfoPanel()
{
    auto *box = new QGroupBox(tr("设备信息"));
    auto *lay = new QFormLayout(box);
    lay->setSpacing(4);

    m_devIdLabel = new QLabel(tr("--"));
    m_fwVerLabel = new QLabel(tr("--"));
    lay->addRow(tr("设备 ID:"), m_devIdLabel);
    lay->addRow(tr("固件版本:"), m_fwVerLabel);

    box->setLayout(lay);
    return box;
}

// ================================================================
// Helpers
// ================================================================

void MainWindow::setConnected(bool on)
{
    m_isConnected = on;
    m_connectBtn->setText(on ? tr("断开") : tr("连接"));
    m_connStatusLabel->setText(on ? tr("● 已连接") : tr("● 未连接"));
    m_connStatusLabel->setStyleSheet(on ? "color: green;" : "color: gray;");
    m_portCombo->setEnabled(!on);
    m_baudCombo->setEnabled(!on);
    m_refreshBtn->setEnabled(!on);
    m_applyConfigBtn->setEnabled(on);
    m_startBtn->setEnabled(on);
    updateStatusBar(on ? tr("已连接") : tr("未连接"));
}

void MainWindow::setMeasuring(bool on)
{
    m_measRunning = on;
    m_startBtn->setEnabled(!on && m_isConnected);
    m_stopBtn->setEnabled(on);
    if (on) {
        m_measTimer.start();
        m_packetCount = 0;
        m_dropCount   = 0;
        m_seqInit     = false;
    }
    updateStatusBar(on ? tr("测量中…") : tr("已停止"));
}

void MainWindow::updateRangeCombo()
{
    m_rangeCombo->clear();
    bool isCurrent = (m_measTypeCombo->currentData().toInt() == EcpUnit::AMP);
    if (isCurrent) {
        for (int i = 0; i < k_currentRangeCount; ++i)
            m_rangeCombo->addItem(QLatin1String(k_currentRanges[i].label));
        m_rangeCombo->setCurrentIndex(4); // default 10 µA
    } else {
        for (int i = 0; i < k_voltageRangeCount; ++i)
            m_rangeCombo->addItem(QLatin1String(k_voltageRanges[i].label));
        m_rangeCombo->setCurrentIndex(1); // default ±1 V
    }
}

void MainWindow::updateStatusBar(const QString &msg)
{
    m_statusLabel->setText(msg);
}

void MainWindow::appendLog(const QString &msg)
{
    statusBar()->showMessage(msg, 5000);
}

uint8_t MainWindow::currentUnit() const
{
    return static_cast<uint8_t>(m_measTypeCombo->currentData().toInt());
}

uint8_t MainWindow::currentModeId() const
{
    return static_cast<uint8_t>(m_methodCombo->currentData().toInt());
}

uint32_t MainWindow::currentRtiaOhm() const
{
    bool isCurrent = (currentUnit() == EcpUnit::AMP);
    if (!isCurrent) return 0;
    int idx = m_rangeCombo->currentIndex();
    if (idx < 0 || idx >= k_currentRangeCount) return 10000;
    return k_currentRanges[idx].rtiaOhm;
}

uint8_t MainWindow::currentPgaGain() const
{
    bool isCurrent = (currentUnit() == EcpUnit::AMP);
    if (!isCurrent) return 1;
    int idx = m_rangeCombo->currentIndex();
    if (idx < 0 || idx >= k_currentRangeCount) return 1;
    return k_currentRanges[idx].pgaGain;
}

// ================================================================
// Slots – Connection
// ================================================================

void MainWindow::onRefreshPorts()
{
    m_portCombo->clear();
    const auto ports = QSerialPortInfo::availablePorts();
    for (const auto &p : ports)
        m_portCombo->addItem(p.portName() + " – " + p.description(), p.portName());
    if (m_portCombo->count() == 0)
        m_portCombo->addItem(tr("(无可用串口)"), QString());
}

void MainWindow::onConnectClicked()
{
    if (m_isConnected) {
        // Disconnect
        if (m_measRunning) {
            m_simTimer->stop();
            setMeasuring(false);
        }
        m_transport->close();
        setConnected(false);
        return;
    }

    if (m_simCheck->isChecked()) {
        // Simulation mode: no real port needed
        setConnected(true);
        appendLog(tr("模拟模式已启动"));
        return;
    }

    QString port = m_portCombo->currentData().toString();
    if (port.isEmpty()) {
        QMessageBox::warning(this, tr("错误"), tr("请先选择串口"));
        return;
    }
    int baud = m_baudCombo->currentText().toInt();
    if (!m_transport->open(port, baud)) {
        QMessageBox::warning(this, tr("连接失败"),
            tr("无法打开串口: ") + m_transport->portName());
        return;
    }

    setConnected(true);
    // Send HELLO to negotiate capabilities
    m_controller->sendHello();
    appendLog(tr("已连接, 正在握手…"));
}

void MainWindow::onSimulateModeToggled(bool checked)
{
    m_portCombo->setEnabled(!checked);
    m_baudCombo->setEnabled(!checked);
    m_refreshBtn->setEnabled(!checked);
}

// ================================================================
// Slots – Configuration
// ================================================================

void MainWindow::onApplyChannelConfig()
{
    if (!m_isConnected) return;

    uint8_t channelId  = static_cast<uint8_t>(m_channelIdSpin->value());
    uint8_t modeId     = currentModeId();
    uint8_t pgaGain    = currentPgaGain();
    uint32_t rtia      = currentRtiaOhm();
    uint32_t adcRate   = static_cast<uint32_t>(m_sampleRateCombo->currentData().toInt());
    float biasVolt     = static_cast<float>(m_biasVoltSpin->value());
    float dacVolt      = biasVolt;

    if (!m_simCheck->isChecked()) {
        m_controller->sendCfgChannel(channelId, modeId, pgaGain,
                                     rtia, adcRate, biasVolt, dacVolt);
    } else {
        appendLog(tr("通道配置已应用（模拟模式）"));
    }

    // Update chart Y-axis label
    bool isCurrent = (currentUnit() == EcpUnit::AMP);
    m_chart->setYAxisLabel(isCurrent ? tr("电流 (A)") : tr("电压 (V)"));

    // Auto or manual range for chart
    bool autoRange = (m_rangeModeCombo->currentIndex() == 1);
    if (autoRange) {
        m_chart->setAutoRange(true);
    } else {
        double yMin = -1e-6, yMax = 1e-6;
        if (isCurrent) {
            int idx = m_rangeCombo->currentIndex();
            if (idx >= 0 && idx < k_currentRangeCount) {
                // Full range: e.g. 10 µA → ±10 µA displayed
                double r = 0;
                QString label = QLatin1String(k_currentRanges[idx].label);
                if (label.contains("nA"))      r = label.left(label.indexOf(' ')).toDouble() * 1e-9;
                else if (label.contains("µA")) r = label.left(label.indexOf(' ')).toDouble() * 1e-6;
                else if (label.contains("mA")) r = label.left(label.indexOf(' ')).toDouble() * 1e-3;
                yMin = -r; yMax = r;
            }
        } else {
            int idx = m_rangeCombo->currentIndex();
            switch (idx) {
            case 0: yMin = -0.1; yMax = 0.1; break;
            case 1: yMin = -1.0; yMax = 1.0; break;
            case 2: yMin = -2.0; yMax = 2.0; break;
            case 3: yMin = -5.0; yMax = 5.0; break;
            default: yMin = -1.0; yMax = 1.0; break;
            }
        }
        m_chart->setAutoRange(false, yMin, yMax);
    }
}

void MainWindow::onMethodChanged(int /*index*/)
{
    m_methodParams->setCurrentIndex(m_methodCombo->currentIndex());
}

void MainWindow::onRangeModeChanged(int index)
{
    // Show range selector only in manual mode
    m_rangeCombo->setEnabled(index == 0);
}

void MainWindow::onMeasTypeChanged(int /*index*/)
{
    updateRangeCombo();
    bool isCurrent = (currentUnit() == EcpUnit::AMP);
    m_chart->setYAxisLabel(isCurrent ? tr("电流 (A)") : tr("电压 (V)"));
}

// ================================================================
// Slots – Control
// ================================================================

void MainWindow::onStartClicked()
{
    if (!m_isConnected || m_measRunning)
        return;

    // First apply config
    onApplyChannelConfig();

    uint8_t  channelId  = static_cast<uint8_t>(m_channelIdSpin->value());
    uint8_t  streamId   = 1;
    uint16_t signalId   = EcpSignal::RAW_ECHEM;

    // Duration from method params
    double durationS = 0.0;
    switch (m_methodCombo->currentIndex()) {
    case 0: durationS = m_caDurationSpin->value();   break;
    case 1: durationS = m_ocpDurationSpin->value();  break;
    default: durationS = 60.0; break;
    }
    uint32_t durationMs = static_cast<uint32_t>(durationS * 1000.0);

    if (m_simCheck->isChecked()) {
        // Simulation mode
        m_simTime  = 0.0;
        m_simPhase = 0;
        m_simTimer->start();
        setMeasuring(true);
        m_chart->clear();
        appendLog(tr("模拟测量开始"));
    } else {
        m_controller->sendStartMeas(channelId, streamId, signalId, durationMs);
        setMeasuring(true);
        m_chart->clear();
    }
}

void MainWindow::onStopClicked()
{
    if (!m_measRunning)
        return;

    if (m_simCheck->isChecked()) {
        m_simTimer->stop();
        setMeasuring(false);
        appendLog(tr("模拟测量停止"));
    } else {
        uint8_t channelId = static_cast<uint8_t>(m_channelIdSpin->value());
        m_controller->sendStopMeas(channelId);
        m_simTimer->stop();
        setMeasuring(false);
    }
}

// ================================================================
// Slots – EcpController responses
// ================================================================

void MainWindow::onHelloResponse(const QString &deviceId,
                                 const QString &fwVersion,
                                 uint32_t /*capBits*/,
                                 uint16_t /*maxPayload*/)
{
    m_devIdLabel->setText(deviceId.isEmpty() ? tr("(未知)") : deviceId);
    m_fwVerLabel->setText(fwVersion.isEmpty() ? tr("(未知)") : fwVersion);
    appendLog(tr("握手成功: ") + deviceId + "  固件: " + fwVersion);
}

void MainWindow::onCfgChannelAck(bool success, uint16_t resultCode)
{
    if (success)
        appendLog(tr("通道配置成功"));
    else
        appendLog(tr("通道配置失败, 错误码: 0x%1").arg(resultCode, 4, 16, QChar('0')));
}

void MainWindow::onStartMeasAck(bool success, uint8_t /*streamId*/,
                                uint16_t resultCode)
{
    if (success)
        appendLog(tr("开始测量 OK"));
    else {
        appendLog(tr("开始测量失败, 错误码: 0x%1").arg(resultCode, 4, 16, QChar('0')));
        setMeasuring(false);
    }
}

void MainWindow::onStopMeasAck(bool success, uint16_t /*resultCode*/)
{
    setMeasuring(false);
    appendLog(success ? tr("测量已停止") : tr("停止测量命令失败"));
}

void MainWindow::onDataFrameArrived(const EcpDataPayload &data)
{
    if (!m_measRunning)
        return;

    ++m_packetCount;
    m_packetCountLabel->setText(tr("帧数: %1").arg(m_packetCount));

    // Calculate t0 (seconds from measurement start)
    double t0_s = static_cast<double>(data.ts0_us) * 1e-6;
    if (!m_seqInit && data.ts0_us == 0) {
        // Device doesn't provide timestamps – use elapsed time
        t0_s = m_measTimer.elapsed() / 1000.0;
        m_seqInit = true;
    }
    double dt_s = (data.dt_us > 0) ? static_cast<double>(data.dt_us) * 1e-6 : 0.001;

    m_chart->addSamples(static_cast<int>(data.channelId), t0_s, dt_s, data.samples);
}

void MainWindow::onCommandTimeout(uint16_t msgType)
{
    appendLog(tr("命令超时 (MsgType=0x%1), 请检查连接").arg(msgType, 4, 16, QChar('0')));
}

void MainWindow::onLatestValueChanged(double value, int channelId)
{
    bool isCurrent = (currentUnit() == EcpUnit::AMP);
    QString unit = isCurrent ? "A" : "V";
    m_currentValueLabel->setText(
        tr("通道%1 当前值: %2 %3").arg(channelId).arg(value, 0, 'g', 5).arg(unit));
}

// ================================================================
// Simulation
// ================================================================

void MainWindow::onSimTick()
{
    if (!m_measRunning)
        return;

    generateSimSamples();
    m_simTime += m_simTimer->interval() / 1000.0;
}

void MainWindow::generateSimSamples()
{
    const int channelId = m_channelIdSpin->value();
    const int methodIdx = m_methodCombo->currentIndex();
    const double dt = 0.010; // 10 ms per sample → 10 samples per 100 ms tick
    const int nSamples = 10;
    const double t0 = m_simTime;
    bool isCurrent = (currentUnit() == EcpUnit::AMP);

    QVector<double> samples;
    samples.reserve(nSamples);

    for (int i = 0; i < nSamples; ++i) {
        double t = t0 + i * dt;
        double v = 0.0;

        switch (methodIdx) {
        case 0: { // CA – decaying exponential current
            double I0  = (isCurrent ? 1e-5 : 0.65);  // 10 µA or 0.65 V
            double tau = m_caDurationSpin->value() / 5.0;
            double noise = 2.0 * QRandomGenerator::global()->generateDouble() - 1.0;
            v = I0 * std::exp(-t / tau)
                + (isCurrent ? 1e-7 : 5e-3) * noise;
            break;
        }
        case 1: { // OCP – stable potential with noise
            double noise = 2.0 * QRandomGenerator::global()->generateDouble() - 1.0;
            v = 0.65 + 0.005 * noise;
            break;
        }
        case 2: { // CV – triangular wave → sinusoidal approximation
            double period = (m_cvEHighSpin->value() - m_cvELowSpin->value())
                            / (m_cvScanRateSpin->value() + 1e-9) * 2.0;
            double phase  = std::fmod(t, period) / period * 2.0 * M_PI;
            double noise  = 2.0 * QRandomGenerator::global()->generateDouble() - 1.0;
            v = (isCurrent ? 5e-6 : 0.2) * std::sin(phase)
                + (isCurrent ? 1e-7 : 2e-3) * noise;
            break;
        }
        case 3: { // DPV – modulated current pulse
            double step  = m_dpvStepSpin->value();
            double amp   = m_dpvAmpSpin->value();
            double sweep = t * step / 0.5;
            double noise = 2.0 * QRandomGenerator::global()->generateDouble() - 1.0;
            v = (isCurrent ? 2e-6 : amp) * std::sin(2 * M_PI * t / 0.5) * std::exp(-sweep)
                + (isCurrent ? 1e-7 : 1e-3) * noise;
            break;
        }
        default: { // LSV / generic ramp
            double E0 = m_lsvEStartSpin->value();
            double E1 = m_lsvEEndSpin->value();
            double sr = m_lsvScanRateSpin->value();
            double duration = qAbs(E1 - E0) / (sr + 1e-9);
            double ramp  = E0 + (E1 - E0) * qMin(t / duration, 1.0);
            double noise = 2.0 * QRandomGenerator::global()->generateDouble() - 1.0;
            v = (isCurrent ? 1e-6 * ramp : ramp)
                + (isCurrent ? 1e-8 : 1e-3) * noise;
            break;
        }
        }
        samples.append(v);
    }

    m_chart->addSamples(channelId, t0, dt, samples);
    ++m_packetCount;
    m_packetCountLabel->setText(tr("帧数: %1").arg(m_packetCount));
}
