import React, { useState } from 'react';
import { SerialCommunication } from '../comm/serial';

interface MeasurementControlProps {
  serial: SerialCommunication | null;
  isConnected: boolean;
  onMeasurementStart: () => void;
  onMeasurementStop: () => void;
}

export const MeasurementControl: React.FC<MeasurementControlProps> = ({
  serial,
  isConnected,
  onMeasurementStart,
  onMeasurementStop,
}) => {
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [duration, setDuration] = useState<number>(0); // 0 = continuous
  const [selectedChannel, setSelectedChannel] = useState(0);

  const handleStartMeasurement = async () => {
    if (!serial || !isConnected) {
      alert('请先连接设备');
      return;
    }

    try {
      const client = serial.getProtocolClient();
      const message = client.createStartMeasurementMessage(
        selectedChannel,
        undefined,
        undefined,
        duration > 0 ? duration * 1000 : undefined // Convert to ms
      );
      await serial.send(message);

      setIsMeasuring(true);
      onMeasurementStart();
    } catch (error) {
      console.error('Failed to start measurement:', error);
      alert('启动测量失败: ' + (error as Error).message);
    }
  };

  const handleStopMeasurement = async () => {
    if (!serial || !isConnected) {
      return;
    }

    try {
      const client = serial.getProtocolClient();
      const message = client.createStopMeasurementMessage(selectedChannel);
      await serial.send(message);

      setIsMeasuring(false);
      onMeasurementStop();
    } catch (error) {
      console.error('Failed to stop measurement:', error);
      alert('停止测量失败: ' + (error as Error).message);
    }
  };

  return (
    <div className="panel">
      <h2 className="panel-title">测量控制</h2>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">通道</label>
          <select
            className="form-control"
            value={selectedChannel}
            onChange={(e) => setSelectedChannel(parseInt(e.target.value))}
            disabled={!isConnected || isMeasuring}
          >
            <option value={0}>通道 0</option>
            <option value={1}>通道 1</option>
            <option value={2}>通道 2</option>
            <option value={3}>通道 3</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">持续时间 (秒, 0=连续)</label>
          <input
            type="number"
            className="form-control"
            value={duration}
            onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
            min="0"
            disabled={!isConnected || isMeasuring}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem' }}>
        {!isMeasuring ? (
          <button
            className="btn btn-success"
            onClick={handleStartMeasurement}
            disabled={!isConnected}
          >
            开始测量
          </button>
        ) : (
          <button className="btn btn-danger" onClick={handleStopMeasurement}>
            停止测量
          </button>
        )}
      </div>

      {isMeasuring && (
        <div className="alert alert-info" style={{ marginTop: '1rem' }}>
          测量进行中... {duration > 0 && `(${duration}秒)`}
        </div>
      )}
    </div>
  );
};
