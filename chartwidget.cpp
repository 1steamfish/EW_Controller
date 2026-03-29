#include "chartwidget.h"

#include <QVBoxLayout>
#include <algorithm>
#include <cmath>

QT_CHARTS_USE_NAMESPACE

// Static colour palette for series
const QList<QColor> ChartWidget::k_seriesColors = {
    QColor(0x1E, 0x90, 0xFF), // Dodger Blue
    QColor(0xFF, 0x45, 0x00), // Orange Red
    QColor(0x32, 0xCD, 0x32), // Lime Green
    QColor(0xFF, 0xD7, 0x00), // Gold
    QColor(0xDA, 0x70, 0xD6), // Orchid
    QColor(0x00, 0xCE, 0xD1), // Dark Turquoise
    QColor(0xFF, 0x69, 0xB4), // Hot Pink
    QColor(0xFF, 0xA5, 0x00), // Orange
};

ChartWidget::ChartWidget(QWidget *parent)
    : QWidget(parent)
{
    // --- Chart & axes ---
    m_chart = new QChart();
    m_chart->setTitle(tr("实时数据"));
    m_chart->legend()->setVisible(true);
    m_chart->legend()->setAlignment(Qt::AlignBottom);
    m_chart->setAnimationOptions(QChart::NoAnimation); // smoother updates

    m_axisX = new QValueAxis(m_chart);
    m_axisX->setTitleText(tr("时间 (s)"));
    m_axisX->setRange(0, m_timeWindow);
    m_axisX->setTickCount(7);
    m_axisX->setLabelFormat("%.1f");
    m_chart->addAxis(m_axisX, Qt::AlignBottom);

    m_axisY = new QValueAxis(m_chart);
    m_axisY->setTitleText(tr("电流 (A)"));
    m_axisY->setRange(m_manualMin, m_manualMax);
    m_axisY->setLabelFormat("%.3g");
    m_chart->addAxis(m_axisY, Qt::AlignLeft);

    // --- Chart view ---
    m_chartView = new QChartView(m_chart, this);
    m_chartView->setRenderHint(QPainter::Antialiasing);

    auto *lay = new QVBoxLayout(this);
    lay->setContentsMargins(0, 0, 0, 0);
    lay->addWidget(m_chartView);
    setLayout(lay);
}

// ----------------------------------------------------------------
// Configuration
// ----------------------------------------------------------------

void ChartWidget::setYAxisLabel(const QString &label)
{
    m_axisY->setTitleText(label);
}

void ChartWidget::setAutoRange(bool enable, double minVal, double maxVal)
{
    m_autoRange  = enable;
    m_manualMin  = minVal;
    m_manualMax  = maxVal;
    updateAxes();
}

void ChartWidget::setTimeWindow(double seconds)
{
    m_timeWindow = seconds > 0 ? seconds : 30.0;
    updateAxes();
}

void ChartWidget::clear()
{
    for (auto *s : m_series)
        s->clear();
    m_tMax     = 0.0;
    m_dataMin  =  1e300;
    m_dataMax  = -1e300;
    updateAxes();
}

// ----------------------------------------------------------------
// Data feed
// ----------------------------------------------------------------

QLineSeries *ChartWidget::seriesForChannel(int channelId)
{
    auto it = m_series.find(channelId);
    if (it != m_series.end())
        return it.value();

    auto *series = new QLineSeries(m_chart);
    series->setName(tr("通道 %1").arg(channelId));
    QPen pen(k_seriesColors.at(m_series.size() % k_seriesColors.size()));
    pen.setWidth(2);
    series->setPen(pen);

    m_chart->addSeries(series);
    series->attachAxis(m_axisX);
    series->attachAxis(m_axisY);

    m_series.insert(channelId, series);
    return series;
}

void ChartWidget::addSample(int channelId, double t_s, double value)
{
    QLineSeries *series = seriesForChannel(channelId);

    series->append(t_s, value);
    m_latestValue = value;

    if (t_s > m_tMax)
        m_tMax = t_s;

    if (value < m_dataMin) m_dataMin = value;
    if (value > m_dataMax) m_dataMax = value;

    pruneOldPoints(series);
    updateAxes();

    emit latestValueChanged(value, channelId);
}

void ChartWidget::addSamples(int channelId,
                             double t0_s,
                             double dt_s,
                             const QVector<double> &samples)
{
    if (samples.isEmpty())
        return;

    QLineSeries *series = seriesForChannel(channelId);

    // Build a batch of QPointF to reduce redraws
    QVector<QPointF> pts;
    pts.reserve(samples.size());

    double t = t0_s;
    const double step = (dt_s > 0) ? dt_s : 0.001; // 1 ms fallback
    for (double v : samples) {
        pts.append(QPointF(t, v));
        if (v < m_dataMin) m_dataMin = v;
        if (v > m_dataMax) m_dataMax = v;
        t += step;
    }

    series->append(pts.toList());
    m_latestValue = samples.last();
    m_tMax = qMax(m_tMax, t - step);

    pruneOldPoints(series);
    updateAxes();

    emit latestValueChanged(m_latestValue, channelId);
}

// ----------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------

void ChartWidget::pruneOldPoints(QLineSeries *series)
{
    // Remove points older than (tMax - timeWindow)
    const double cutoff = m_tMax - m_timeWindow;
    if (cutoff <= 0)
        return;

    const auto &pts = series->points();
    int removeCount = 0;
    for (const auto &p : pts) {
        if (p.x() < cutoff)
            ++removeCount;
        else
            break;
    }
    // removePoints is O(n) – acceptable for moderate data rates
    for (int i = 0; i < removeCount; ++i)
        series->remove(0);
}

void ChartWidget::updateAxes()
{
    // --- X axis: scroll to show the last m_timeWindow seconds ---
    double xMax = qMax(m_tMax, m_timeWindow);
    double xMin = xMax - m_timeWindow;
    m_axisX->setRange(xMin, xMax);

    // --- Y axis ---
    if (m_autoRange) {
        if (m_dataMin <= m_dataMax) {
            double span = m_dataMax - m_dataMin;
            double pad  = span > 0 ? span * 0.1 : std::abs(m_dataMax) * 0.2 + 1e-12;
            m_axisY->setRange(m_dataMin - pad, m_dataMax + pad);
        }
    } else {
        m_axisY->setRange(m_manualMin, m_manualMax);
    }
}
