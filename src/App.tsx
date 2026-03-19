import React, { useState, useCallback } from 'react';
import './App.css';
import { ConnectionManager } from './components/ConnectionManager';
import { ChannelConfig } from './components/ChannelConfig';
import { MeasurementControl } from './components/MeasurementControl';
import { RealtimeChart } from './components/RealtimeChart';
import { SerialCommunication } from './comm/serial';
import { DeviceInfo, DataFramePayload } from './protocol/types';

function App() {
  const [serial, setSerial] = useState<SerialCommunication | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [dataFrames, setDataFrames] = useState<DataFramePayload[]>([]);
  const [isMeasuring, setIsMeasuring] = useState(false);

  const handleConnectionChange = useCallback(
    (connected: boolean, serialComm: SerialCommunication | null) => {
      setIsConnected(connected);

      if (connected && serialComm) {
        // Re-create serial communication with data handler
        const newSerial = new SerialCommunication({
          onDataFrame: (data: DataFramePayload) => {
            setDataFrames((prev) => [...prev, data]);
          },
          onError: (error) => {
            console.error('Protocol error:', error);
          },
        });

        setSerial(serialComm);
      } else {
        setSerial(null);
        setDataFrames([]);
        setIsMeasuring(false);
      }
    },
    []
  );

  const handleDeviceInfo = useCallback((info: DeviceInfo | null) => {
    setDeviceInfo(info);
  }, []);

  const handleMeasurementStart = useCallback(() => {
    setIsMeasuring(true);
    setDataFrames([]); // Clear previous data
  }, []);

  const handleMeasurementStop = useCallback(() => {
    setIsMeasuring(false);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>电化学工作站控制软件</h1>
        <p>Electrochemical Workstation Controller - ECP v1 Protocol</p>
      </header>

      <ConnectionManager
        onConnectionChange={handleConnectionChange}
        onDeviceInfo={handleDeviceInfo}
      />

      <main className="main-content">
        {!isConnected && (
          <div className="alert alert-info">
            <strong>欢迎使用电化学工作站控制软件</strong>
            <p>
              请点击"连接设备"按钮连接您的电化学工作站。
              本软件基于 ElectroChem Protocol V1 通讯协议开发。
            </p>
            <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
              注意：需要使用支持 Web Serial API 的浏览器（如 Chrome、Edge 等）
            </p>
          </div>
        )}

        {isConnected && (
          <>
            <ChannelConfig serial={serial} isConnected={isConnected} />

            <MeasurementControl
              serial={serial}
              isConnected={isConnected}
              onMeasurementStart={handleMeasurementStart}
              onMeasurementStop={handleMeasurementStop}
            />

            <RealtimeChart data={dataFrames} maxPoints={1000} />
          </>
        )}
      </main>
    </div>
  );
}

export default App;
