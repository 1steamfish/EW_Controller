#pragma once
#include <QWidget>
#include <QMap>
#include <QVector>
#include <QtCharts/QChart>
#include <QtCharts/QChartView>
#include <QtCharts/QLineSeries>
#include <QtCharts/QValueAxis>

QT_CHARTS_USE_NAMESPACE

// ----------------------------------------------------------------
// ChartWidget – real-time scrolling chart for ECP data streams.
//
// • Maintains one QLineSeries per channel (auto-created on first use).
// • X-axis: elapsed time in seconds.
// • Y-axis: measurement value (auto or manual range).
// • Old data points outside the visible time window are pruned.
// ----------------------------------------------------------------
class ChartWidget : public QWidget
{
    Q_OBJECT
public:
    explicit ChartWidget(QWidget *parent = nullptr);

    // ----- Configuration ----------------------------------------

    // Label for Y-axis, e.g. "电流 (A)" or "电压 (V)"
    void setYAxisLabel(const QString &label);

    // Auto-range: axis scales to fit data.
    // Manual-range: fixed [minVal, maxVal].
    void setAutoRange(bool enable, double minVal = -1e-6, double maxVal = 1e-6);

    // How many seconds of history to display
    void setTimeWindow(double seconds);

    // Reset / clear all series and reset timers
    void clear();

    // ---- Data feed ---------------------------------------------

    // Add a batch of samples for @channelId.
    // @t0_s        : timestamp of the first sample (seconds since measurement start)
    // @dt_s        : sample interval (seconds); 0 = use running counter
    // @samples     : converted values (A, V, raw code, …)
    void addSamples(int channelId,
                    double t0_s,
                    double dt_s,
                    const QVector<double> &samples);

    // Convenience: add a single sample
    void addSample(int channelId, double t_s, double value);

    // Latest value of the most recently updated channel
    double latestValue() const { return m_latestValue; }

signals:
    void latestValueChanged(double value, int channelId);

private:
    QChart      *m_chart;
    QChartView  *m_chartView;
    QValueAxis  *m_axisX;
    QValueAxis  *m_axisY;

    QMap<int, QLineSeries *> m_series;

    double m_timeWindow  = 30.0;
    double m_tMax        = 0.0;   // max time seen
    bool   m_autoRange   = true;
    double m_manualMin   = -1e-6;
    double m_manualMax   =  1e-6;
    double m_dataMin     =  1e300;
    double m_dataMax     = -1e300;
    double m_latestValue = 0.0;

    QLineSeries *seriesForChannel(int channelId);
    void updateAxes();
    void pruneOldPoints(QLineSeries *series);

    static const QList<QColor> k_seriesColors;
};
