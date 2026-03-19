# 电化学工作站控制软件 (Electrochemical Workstation Controller)

基于 ElectroChem Protocol V1 通讯协议的电化学工作站上位机控制软件。

## 功能特性

### 1. 可配置通道功能
- ✅ 支持电流型和电压型数据测量
- ✅ 可选手动配置量程和自动配置量程（默认手动）
- ✅ 支持多通道配置（通道 0-3）

### 2. 实时数据可视化
- ✅ 通过图表形式实时显示电化学工作站读出的数据
- ✅ 显示当前值、最小值、最大值、平均值等统计信息
- ✅ 支持最多 1000 个数据点的实时显示

### 3. 电化学检测方法
支持以下检测方法：
- ✅ 开路电位 (OCP - Open Circuit Potential)
- ✅ **计时电流法 (CA - Chronoamperometry)**
- ✅ 循环伏安法 (CV - Cyclic Voltammetry)
- ✅ 差分脉冲伏安法 (DPV - Differential Pulse Voltammetry)
- ✅ 方波伏安法 (SWV - Square Wave Voltammetry)
- ✅ 电化学阻抗谱 (EIS - Electrochemical Impedance Spectroscopy)

### 4. Web 部署
- ✅ 纯 Web 应用，无需安装
- ✅ 使用 Web Serial API 与设备通信
- ✅ 响应式设计，支持各种屏幕尺寸

## 技术栈

- **前端框架**: React 18 + TypeScript
- **构建工具**: Vite
- **图表库**: Recharts
- **通信协议**: ElectroChem Protocol V1
- **通信方式**: Web Serial API (UART)

## 系统要求

- 支持 Web Serial API 的现代浏览器：
  - Google Chrome 89+
  - Microsoft Edge 89+
  - Opera 75+
- 电化学工作站设备（支持 ECP v1 协议）

## 安装和运行

### 开发环境

1. 克隆仓库：
```bash
git clone https://github.com/1steamfish/EW_Controller.git
cd EW_Controller
```

2. 安装依赖：
```bash
npm install
```

3. 启动开发服务器：
```bash
npm run dev
```

4. 在浏览器中打开 `http://localhost:3000`

### 生产部署

1. 构建生产版本：
```bash
npm run build
```

2. 构建产物位于 `dist/` 目录，可部署到任何静态文件服务器

3. 预览生产版本：
```bash
npm run preview
```

## 使用说明

### 连接设备

1. 确保电化学工作站通过 USB 连接到计算机
2. 点击页面上的"连接设备"按钮
3. 在浏览器弹出的串口选择对话框中选择对应的设备
4. 连接成功后，状态指示器会变为绿色

### 配置通道

1. 选择通道号（0-3）
2. 选择测量类型：电流型或电压型
3. 选择量程模式：
   - **手动模式**：手动选择量程（默认）
   - **自动模式**：设备自动选择合适的量程
4. 选择检测方法（如计时电流法 CA）
5. 设置偏置电压和采样率
6. 点击"应用配置"按钮发送配置到设备

### 开始测量

1. 在测量控制面板中选择通道
2. 设置持续时间（0 表示连续测量）
3. 点击"开始测量"按钮
4. 实时数据会显示在图表中
5. 点击"停止测量"停止数据采集

### 查看数据

- 图表实时显示测量数据
- 统计面板显示当前值、最小值、最大值、平均值和数据点数
- 可以点击"清除数据"按钮清空当前显示的数据

## 项目结构

```
EW_Controller/
├── Doc/                          # 协议文档
│   └── ElectroChem Protocol V1.md
├── src/
│   ├── comm/                     # 通信模块
│   │   └── serial.ts             # Web Serial API 封装
│   ├── components/               # React 组件
│   │   ├── ChannelConfig.tsx     # 通道配置组件
│   │   ├── ConnectionManager.tsx # 连接管理组件
│   │   ├── MeasurementControl.tsx # 测量控制组件
│   │   └── RealtimeChart.tsx     # 实时图表组件
│   ├── protocol/                 # ECP v1 协议实现
│   │   ├── client.ts             # 协议客户端
│   │   ├── cobs.ts               # COBS 编码/解码
│   │   ├── crc.ts                # CRC 校验
│   │   ├── frame.ts              # 帧编码/解码
│   │   ├── tlv.ts                # TLV 编码/解码
│   │   └── types.ts              # 类型定义
│   ├── App.css                   # 应用样式
│   ├── App.tsx                   # 主应用组件
│   ├── main.tsx                  # 入口文件
│   └── vite-env.d.ts             # TypeScript 类型声明
├── index.html                    # HTML 模板
├── package.json                  # 项目配置
├── tsconfig.json                 # TypeScript 配置
├── vite.config.ts                # Vite 配置
└── README.md                     # 本文件
```

## ElectroChem Protocol V1 实现

本软件完整实现了 ECP v1 协议，包括：

- ✅ 帧结构编码/解码（Header + Payload + CRC）
- ✅ COBS 编码用于 UART 分帧
- ✅ CRC16/CRC32 校验
- ✅ TLV 编码/解码
- ✅ 系统/链路管理命令（HELLO、PING、PONG）
- ✅ 配置命令（CFG_CHANNEL、SET_DAC）
- ✅ 测量控制命令（START_MEAS、STOP_MEAS）
- ✅ 数据帧解析和处理
- ✅ 多种数据格式支持（U16、I16、I32、F32）

## 浏览器兼容性

| 浏览器 | 版本要求 | Web Serial API 支持 |
|--------|----------|---------------------|
| Chrome | 89+ | ✅ |
| Edge   | 89+ | ✅ |
| Opera  | 75+ | ✅ |
| Firefox| - | ❌ (不支持) |
| Safari | - | ❌ (不支持) |

## 常见问题

### 无法连接设备

1. 确认浏览器支持 Web Serial API
2. 检查设备是否正确连接到计算机
3. 检查设备驱动是否安装
4. 尝试刷新页面后重新连接

### 数据不显示

1. 确认已正确配置通道
2. 确认已点击"开始测量"
3. 检查设备是否正常工作
4. 查看浏览器控制台是否有错误信息

### 图表显示异常

1. 尝试点击"清除数据"按钮
2. 刷新页面重新连接

## 开发说明

### 添加新的检测方法

1. 在 `src/protocol/types.ts` 中的 `ModeId` 枚举添加新方法
2. 在 `src/components/ChannelConfig.tsx` 中添加对应的选项
3. 根据需要实现方法特定的参数配置

### 自定义协议扩展

1. 在 `src/protocol/types.ts` 中添加新的 TLV 类型或消息类型
2. 在 `src/protocol/client.ts` 中实现新的命令编码方法
3. 在相应的 React 组件中添加 UI 控制

## 许可证

本项目基于 MIT 许可证开源。

## 贡献

欢迎提交 Issue 和 Pull Request！

## 联系方式

项目地址：https://github.com/1steamfish/EW_Controller
