import React, { useState, useCallback } from 'react';
import { SerialCommunication } from '../comm/serial';
import { DeviceInfo } from '../protocol/types';

interface ConnectionManagerProps {
  onConnectionChange: (connected: boolean, serial: SerialCommunication | null) => void;
  onDeviceInfo: (info: DeviceInfo | null) => void;
}

export const ConnectionManager: React.FC<ConnectionManagerProps> = ({
  onConnectionChange,
  onDeviceInfo,
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [serialComm, setSerialComm] = useState<SerialCommunication | null>(null);

  const handleConnect = useCallback(async () => {
    setIsConnecting(true);

    try {
      const comm = new SerialCommunication({
        onError: (error) => {
          console.error('Protocol error:', error);
        },
      });

      await comm.connect();
      setSerialComm(comm);
      setIsConnected(true);
      onConnectionChange(true, comm);

      // Send HELLO message
      try {
        const client = comm.getProtocolClient();
        const helloMessage = client.encodeMessage(0x0001, new Uint8Array(0));
        await comm.send(helloMessage);
      } catch (error) {
        console.error('Failed to send HELLO:', error);
      }
    } catch (error) {
      console.error('Connection failed:', error);
      alert('连接失败: ' + (error as Error).message);
    } finally {
      setIsConnecting(false);
    }
  }, [onConnectionChange]);

  const handleDisconnect = useCallback(async () => {
    if (serialComm) {
      await serialComm.disconnect();
      setSerialComm(null);
      setIsConnected(false);
      setDeviceInfo(null);
      onConnectionChange(false, null);
      onDeviceInfo(null);
    }
  }, [serialComm, onConnectionChange, onDeviceInfo]);

  return (
    <div className="connection-bar">
      <div className="connection-status">
        <div
          className={`status-indicator ${
            isConnecting ? 'connecting' : isConnected ? 'connected' : ''
          }`}
        />
        <span>
          {isConnecting
            ? '连接中...'
            : isConnected
            ? '已连接'
            : '未连接'}
        </span>
        {deviceInfo && (
          <div className="device-info">
            <span>设备ID: {deviceInfo.deviceId}</span>
            <span> | </span>
            <span>固件版本: {deviceInfo.fwVersion}</span>
          </div>
        )}
      </div>
      <div>
        {!isConnected ? (
          <button
            className="btn btn-primary"
            onClick={handleConnect}
            disabled={isConnecting}
          >
            {isConnecting ? '连接中...' : '连接设备'}
          </button>
        ) : (
          <button className="btn btn-secondary" onClick={handleDisconnect}>
            断开连接
          </button>
        )}
      </div>
    </div>
  );
};
