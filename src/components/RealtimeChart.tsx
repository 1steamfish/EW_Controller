import React, { useState, useEffect, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { DataFramePayload, DataUnit } from '../protocol/types';

interface DataPoint {
  time: number;
  value: number;
}

interface RealtimeChartProps {
  data: DataFramePayload[];
  maxPoints?: number;
}

export const RealtimeChart: React.FC<RealtimeChartProps> = ({ data, maxPoints = 1000 }) => {
  const [chartData, setChartData] = useState<DataPoint[]>([]);
  const [stats, setStats] = useState({
    min: 0,
    max: 0,
    avg: 0,
    current: 0,
    count: 0,
  });

  const updateChartData = useCallback(() => {
    if (data.length === 0) {
      return;
    }

    const newPoints: DataPoint[] = [];
    let startTime = 0;

    data.forEach((frame, frameIdx) => {
      const baseTime = frameIdx > 0 ? startTime : 0;

      frame.samples.forEach((value, idx) => {
        const time = baseTime + (frame.dt_us > 0 ? (idx * frame.dt_us) / 1000000 : idx);
        newPoints.push({ time, value });
      });

      if (frame.samples.length > 0) {
        startTime = baseTime + (frame.samples.length * frame.dt_us) / 1000000;
      }
    });

    // Keep only the most recent points
    const trimmedPoints = newPoints.slice(-maxPoints);
    setChartData(trimmedPoints);

    // Calculate statistics
    if (trimmedPoints.length > 0) {
      const values = trimmedPoints.map((p) => p.value);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
      const current = values[values.length - 1];

      setStats({
        min,
        max,
        avg,
        current,
        count: trimmedPoints.length,
      });
    }
  }, [data, maxPoints]);

  useEffect(() => {
    updateChartData();
  }, [updateChartData]);

  const getUnit = () => {
    if (data.length === 0) return '';
    const unit = data[0].unit;
    switch (unit) {
      case DataUnit.VOLT:
        return 'V';
      case DataUnit.AMPERE:
        return 'A';
      case DataUnit.OHM:
        return 'Ω';
      default:
        return '';
    }
  };

  const handleClearData = () => {
    setChartData([]);
    setStats({
      min: 0,
      max: 0,
      avg: 0,
      current: 0,
      count: 0,
    });
  };

  return (
    <div className="chart-container">
      <div className="chart-header">
        <h3 className="chart-title">实时数据</h3>
        <div className="chart-controls">
          <button className="btn btn-secondary" onClick={handleClearData}>
            清除数据
          </button>
        </div>
      </div>

      <div className="data-stats">
        <div className="stat-card">
          <div className="stat-label">当前值</div>
          <div className="stat-value">
            {stats.current.toExponential(3)}
            <span className="stat-unit">{getUnit()}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">最小值</div>
          <div className="stat-value">
            {stats.min.toExponential(3)}
            <span className="stat-unit">{getUnit()}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">最大值</div>
          <div className="stat-value">
            {stats.max.toExponential(3)}
            <span className="stat-unit">{getUnit()}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">平均值</div>
          <div className="stat-value">
            {stats.avg.toExponential(3)}
            <span className="stat-unit">{getUnit()}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">数据点数</div>
          <div className="stat-value">{stats.count}</div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="time"
            label={{ value: '时间 (s)', position: 'insideBottom', offset: -5 }}
            tickFormatter={(value) => value.toFixed(2)}
          />
          <YAxis
            label={{ value: `值 (${getUnit()})`, angle: -90, position: 'insideLeft' }}
            tickFormatter={(value) => value.toExponential(2)}
          />
          <Tooltip
            formatter={(value: number) => [value.toExponential(6), '值']}
            labelFormatter={(label) => `时间: ${label.toFixed(3)}s`}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#667eea"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            name="测量值"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
