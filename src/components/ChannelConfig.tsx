import React, { useState, useEffect } from 'react';
import { ModeId } from '../protocol/types';
import { SerialCommunication } from '../comm/serial';

interface ChannelConfigProps {
  serial: SerialCommunication | null;
  isConnected: boolean;
}

export type MeasurementType = 'current' | 'voltage';
export type RangeMode = 'manual' | 'auto';

export interface ChannelSettings {
  channelId: number;
  measurementType: MeasurementType;
  rangeMode: RangeMode;
  manualRange: number;
  method: ModeId;
  biasVoltage: number;
  sampleRate: number;
}

export const ChannelConfig: React.FC<ChannelConfigProps> = ({ serial, isConnected }) => {
  const [settings, setSettings] = useState<ChannelSettings>({
    channelId: 0,
    measurementType: 'current',
    rangeMode: 'manual',
    manualRange: 1, // 1 μA
    method: ModeId.CA,
    biasVoltage: 0.0,
    sampleRate: 1000, // 1000 SPS
  });

  const handleApplyConfig = async () => {
    if (!serial || !isConnected) {
      alert('请先连接设备');
      return;
    }

    try {
      const client = serial.getProtocolClient();

      // Build channel configuration
      const config = {
        channelId: settings.channelId,
        modeId: settings.method,
        biasVoltF32: settings.biasVoltage,
        adcRateSps: settings.sampleRate,
        // Add range configuration based on measurement type and range mode
      };

      const message = client.createConfigChannelMessage(config);
      await serial.send(message);

      alert('配置已发送');
    } catch (error) {
      console.error('Configuration failed:', error);
      alert('配置失败: ' + (error as Error).message);
    }
  };

  return (
    <div className="panel">
      <h2 className="panel-title">通道配置</h2>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">通道号</label>
          <select
            className="form-control"
            value={settings.channelId}
            onChange={(e) =>
              setSettings({ ...settings, channelId: parseInt(e.target.value) })
            }
            disabled={!isConnected}
          >
            <option value={0}>通道 0</option>
            <option value={1}>通道 1</option>
            <option value={2}>通道 2</option>
            <option value={3}>通道 3</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">测量类型</label>
          <div className="radio-group">
            <div className="radio-option">
              <input
                type="radio"
                id="type-current"
                name="measurementType"
                value="current"
                checked={settings.measurementType === 'current'}
                onChange={(e) =>
                  setSettings({ ...settings, measurementType: e.target.value as MeasurementType })
                }
                disabled={!isConnected}
              />
              <label htmlFor="type-current">电流型</label>
            </div>
            <div className="radio-option">
              <input
                type="radio"
                id="type-voltage"
                name="measurementType"
                value="voltage"
                checked={settings.measurementType === 'voltage'}
                onChange={(e) =>
                  setSettings({ ...settings, measurementType: e.target.value as MeasurementType })
                }
                disabled={!isConnected}
              />
              <label htmlFor="type-voltage">电压型</label>
            </div>
          </div>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">量程模式</label>
          <div className="radio-group">
            <div className="radio-option">
              <input
                type="radio"
                id="range-manual"
                name="rangeMode"
                value="manual"
                checked={settings.rangeMode === 'manual'}
                onChange={(e) =>
                  setSettings({ ...settings, rangeMode: e.target.value as RangeMode })
                }
                disabled={!isConnected}
              />
              <label htmlFor="range-manual">手动</label>
            </div>
            <div className="radio-option">
              <input
                type="radio"
                id="range-auto"
                name="rangeMode"
                value="auto"
                checked={settings.rangeMode === 'auto'}
                onChange={(e) =>
                  setSettings({ ...settings, rangeMode: e.target.value as RangeMode })
                }
                disabled={!isConnected}
              />
              <label htmlFor="range-auto">自动</label>
            </div>
          </div>
        </div>

        {settings.rangeMode === 'manual' && (
          <div className="form-group">
            <label className="form-label">
              量程 ({settings.measurementType === 'current' ? 'μA' : 'V'})
            </label>
            <select
              className="form-control"
              value={settings.manualRange}
              onChange={(e) =>
                setSettings({ ...settings, manualRange: parseFloat(e.target.value) })
              }
              disabled={!isConnected}
            >
              {settings.measurementType === 'current' ? (
                <>
                  <option value={0.1}>0.1 μA</option>
                  <option value={1}>1 μA</option>
                  <option value={10}>10 μA</option>
                  <option value={100}>100 μA</option>
                  <option value={1000}>1 mA</option>
                </>
              ) : (
                <>
                  <option value={0.1}>0.1 V</option>
                  <option value={1}>1 V</option>
                  <option value={5}>5 V</option>
                  <option value={10}>10 V</option>
                </>
              )}
            </select>
          </div>
        )}
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">检测方法</label>
          <select
            className="form-control"
            value={settings.method}
            onChange={(e) =>
              setSettings({ ...settings, method: parseInt(e.target.value) as ModeId })
            }
            disabled={!isConnected}
          >
            <option value={ModeId.OCP}>开路电位 (OCP)</option>
            <option value={ModeId.CA}>计时电流法 (CA)</option>
            <option value={ModeId.CV}>循环伏安法 (CV)</option>
            <option value={ModeId.DPV}>差分脉冲伏安法 (DPV)</option>
            <option value={ModeId.SWV}>方波伏安法 (SWV)</option>
            <option value={ModeId.EIS}>电化学阻抗谱 (EIS)</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">偏置电压 (V)</label>
          <input
            type="number"
            className="form-control"
            value={settings.biasVoltage}
            onChange={(e) =>
              setSettings({ ...settings, biasVoltage: parseFloat(e.target.value) })
            }
            step="0.01"
            disabled={!isConnected}
          />
        </div>

        <div className="form-group">
          <label className="form-label">采样率 (SPS)</label>
          <select
            className="form-control"
            value={settings.sampleRate}
            onChange={(e) =>
              setSettings({ ...settings, sampleRate: parseInt(e.target.value) })
            }
            disabled={!isConnected}
          >
            <option value={100}>100 SPS</option>
            <option value={250}>250 SPS</option>
            <option value={500}>500 SPS</option>
            <option value={1000}>1000 SPS</option>
            <option value={2000}>2000 SPS</option>
            <option value={4000}>4000 SPS</option>
          </select>
        </div>
      </div>

      <button className="btn btn-primary" onClick={handleApplyConfig} disabled={!isConnected}>
        应用配置
      </button>
    </div>
  );
};
