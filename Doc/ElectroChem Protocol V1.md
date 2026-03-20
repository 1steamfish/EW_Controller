# ECP（ElectroChem Protocol）v1

**文档版本**：1.0

**发布日期**：2026-01-27

**适用对象**：上位机（PC/手机） ↔ 电化学工作站/采集设备（MCU/AFE）

**承载链路**：UART 串口、BLE 蓝牙（GATT）

**协议类型**：二进制帧 +（控制类）TLV +（数据类）紧凑二进制块

## 1. 设计目标

1. 同一套上层协议，可以同时跑在UART与BLE上，底层不同，商城统一。
2. 控制/配置命令可靠传输。有ACK/超时/重传/去重
3. 强扩展：未来新增功能不破坏旧版兼容性
4. 易实现：可以FPGA，MCU端易实现

## 2. 术语约定

* **Host**: 上位机：PC/手机， 默认 `NodeId = 0x01`
* **Device**：工作站/采集设备，默认 `NodeId = 0x10`
* **Little-Endian**: 所有多字节整形均为小端
* **MUST/SHOULD/MAY**：分别表示必须/建议/可选
* **Frame**： ECP的逻辑帧—一条完整的消息
* **Payload**: Frame的负载部分
* **TLV**： 可扩展字段编码

## 3. 承载与分帧

### 3.1 UART 承载

UART 是字节流，必须分帧。使用COBS编码+帧尾0x00分帧

* 发送：`COBS(原始Frame)` + 末尾分隔符 `0x00`
* 接受：以`0x00`切分包，然后`COBS解码`得到原始Frame

优点：无需转义规则，payload任意字节不影响分帧；实现简单可靠

### 3.2 BLE 承载（GATT）

建议定义自有 Service（128-bit UUID）与两个特征：

* ECP_RX：Write Without Response（Host → Device）
* ECP_TX：Notify（Device → Host）

BLE 每次 write/notify 有 MTU 限制：

* 控制帧建议保持 < 200 bytes
* 数据帧按 MTU 自适应样本批量
* 若必须超过 MTU：使用 分片机制（Flags.FRAG=1）

## 4. Frame 结构

### 4.1 Frame 总体结构

```css
[Header][Optional Fragment Header][Payload][FrameCrc32]
```

* Header 固定长度
* 可选分片头仅在 Flags.FRAG=1 时存在
* FrameCrc32 覆盖 Header + 可选分片头 + Payload

### 4.2 Header 结构

| 字段 | 偏移 | 长度（字节） | 类型 | 说明 |
|------|------|--------------|------|------|
| Magic | 0   | 2 | u8[2] | 帧起始标志，固定值 `0xEC 0xPC` |
| VerMajor| 2 | 1 | u8 | 主版本号，当前为 `1`（v1=1） |
| VerMinor| 3 | 1 | u8 | 次版本号，当前为 `0` （v1.0=0）|
| Flags | 4 | 1 | u8 | 标志位，见4.3 |
|Src | 5 | 1 | u8 | 源节点ID，Host=0x01，Device=0x10 |
| Dst | 6 | 1 | u8 | 目的节点ID，Host=0x01，Device=0x10 |
| MsgType | 7 | 2 | u16 | 消息类型，见第8章 |
| MsgId | 9 | 2 | u16 | 消息ID，命令请求/响应配对标识 |
| Seq | 11 | 2 | u16 | 序列号，序号（数据流/分片/乱序检测） |
| PayloadLen | 13 | 2 | u16 | Payload长度（字节数） |
| HeaderCrc16 | 15 | 2 | u16 | Header 校验（见 4.5） |
**Header 总长度**：17 bytes

### 4.3 Flags 字段定义

| 位 | 名称 | 说明 |
|----|------|------|
| 0 | ACK_REQ | 该消息需要应答（ACK） |
| 1 | ACK | 该消息为应答（ACK） |
| 2 | IS_ERR | 该消息为错误响应 （通常与 IS_ACK 同时出现）|
| 3 | FRAG | 启动分片头 |
| 4 | STREAM | 该消息为数据流（连续数据） |
| 5-7 | 保留 | 保留，置0 |

### 4.4 可选分片头结构
| 字段 | 长度 | 类型 | 说明 |
|------|------|------|------|
| FragId | 2 | u16 | 分片组ID（同一组内的分片具有相同ID）|
| FragIdx | 1 | u8 | 分片索引（从0开始） |
| FragCnt | 1 | u8 | 分片总数 |
> 分片重组策略：同一 (Src,Dst,FragId) 下，收到 0..FragCnt-1 全部分片后按 FragIdx 拼接 Payload（或拼接“分片载荷”，具体看实现）。超时未收齐则丢弃该组。

### 4.5 校验

HeaderCrc16（覆盖 Header 的前 15 字节，即不含 HeaderCrc16 自身）
* CRC-16/CCITT-FALSE（poly 0x1021, init 0xFFFF, xorout 0x0000, refin=false, refout=false）
* 目的：快速筛掉乱流/错包，减少后续解析成本

FrameCrc32（覆盖 Header(17 bytes) + 可选分片头 + Payload）
* CRC-32/ISO-HDLC（poly 0x04C11DB7, init 0xFFFFFFFF, refin=true, refout=true, xorout 0xFFFFFFFF）
> 如果 MCU 算力非常紧，也可将 FrameCrc32 降级为 CRC16，但建议数据流保留 CRC32。

## 5. NodeId与地址分配

* 0x01：Host（上位机）
* 0x10：Device（工作站）
* 0xFF：广播（Broadcast，设备可选择性响应）

接收端必须校验``Dst``字段
* Dst == 本机NodeId 或 Dst == 0xFF 才处理 否则丢弃

## 6. 版本协商与兼容性

* VerMajor 不一致：接收端 MUST 回复 UNSUPPORTED_VER（若能解析到该字段）

* VerMinor：接收端 SHOULD 尽量兼容（旧端忽略新字段；新端兼容旧字段）

* Payload 控制类采用 TLV：未知 TLV 类型 MUST 跳过（利用长度字段跳过）

## 7. Payload 编码

### 7.1 控制类消息：TLV 编码
控制类消息（如命令请求/响应）Payload 采用 TLV 编码
```css
[ Type(1byte) ][ Length(2bytes) ][ Value(Length bytes) ] ...
```

* 多个TLV字段顺序排列
* 未识别的Type MUST 跳过（利用 Length 字段）
* 数据型默认小端编码
* 字符型：UTF-8编码，无终止符`\0`

### 7.2 数据流Payload:(高吞吐紧凑格式)
数据流Payload采用紧凑二进制块编码见第10章， 避免TLV开销

## 8. 消息类型（MsgType）与命令集

### 8.1 MsgType 区间规划

| 区间            | 类别                 |
| ------------- | ------------------ |
| 0x0000–0x00FF | 系统/链路管理            |
| 0x0100–0x01FF | 配置（DAC/ADC/通道/AFE） |
| 0x0200–0x02FF | 测量控制（开始/停止/状态）     |
| 0x0300–0x03FF | 数据（实时/拉取/统计）       |
| 0x0400–0x04FF | 校准/标定              |
| 0x0500–0x05FF | 事件/告警/日志           |
| 0x0600–0x06FF | 升级/Bootloader（预留）  |

### 8.2 请求/响应规则

* 控制类消息请求通常 Flags.ACK_REQ=1：
* 响应帧必须：
  * 响应消息：Flags.ACK=1，MsgId与请求对应
  * 错误响应：Flags.IS_ERR=1，Payload包含错误码TLV

## 9. TLV 字典

> 下列为协议内置 TLV。你也可以按项目需要扩展 0x80–0xFF.

### 9.1 通用消息

| TLV T | 名称          | 类型     | 说明              |
| ----: | ----------- | ------ | --------------- |
|  0x01 | DEVICE_ID   | string | 序列号/唯一ID        |
|  0x02 | FW_VERSION  | string | 固件版本            |
|  0x03 | CAP_BITS    | u32    | 能力位（见 9.3）      |
|  0x04 | MAX_PAYLOAD | u16    | 设备可接受最大 Payload |
|  0x05 | RESULT_CODE | u16    | 结果码（0=OK）       |
|  0x06 | RESULT_MSG  | string | 人类可读错误信息        |
|  0x07 | TIME_US     | u64    | 时间戳（微秒）         |

### 9.2 通道/信号/参数

| TLV T | 名称            | 类型   | 说明                   |
| ----: | ------------- | ---- | -------------------- |
|  0x08 | CHANNEL_ID    | u8   | 通道号                  |
|  0x09 | SIGNAL_ID     | u16  | 信号/分析物ID（见 11 章）     |
|  0x0A | DAC_CODE      | u16  | DAC 原始码              |
|  0x0B | DAC_VOLT_F32  | f32  | DAC 输出电压（V）          |
|  0x0C | ADC_RATE_SPS  | u32  | 采样率（Samples/s）       |
|  0x0D | PGA_GAIN      | u8   | PGA 档位               |
|  0x0E | RTIA_OHM      | u32  | RTIA（欧姆）             |
|  0x0F | MODE_ID       | u8   | 测量模式（OCP/CA/DPV/...） |
|  0x10 | BIAS_VOLT_F32 | f32  | 偏置电压（V）              |
|  0x11 | FILTER_CFG    | blob | 滤波/OSR/参数块（设备自解释）    |
|  0x12 | STREAM_ID     | u8   | 数据流 ID               |
|  0x13 | DURATION_MS   | u32  | 持续时间（0=持续）           |

### 9.3 能力位定义（CAP_BITS）

|   Bit | 含义                |
| ----: | ----------------- |
|     0 | 支持分片 FRAG         |
|     1 | 支持 TIME_SYNC      |
|     2 | 支持 DATA_PULL      |
|     3 | 支持 RAW_ADC 输出     |
|     4 | 支持工程单位输出（V/A等）    |
|     5 | 支持多信号并发（多 SIGNAL） |
| 6..31 | 预留                |

## 10. 数据帧（Data Frame）载荷格式

### 10.1 MsgType 定义

* `0x0300` : DATA_FRAME (主要以：设备 -> 上位机 为主。也可反向)

建议Flags:

* Flags.STREAM=1

* 通常 ACK_REQ=0（不可靠以提升吞吐）

* Seq 递增（每个 StreamId 独立递增更好）

### 10.2 DATA_FRAME Payload（二进制）

| 字段        | 长度 | 类型  | 说明                |
| --------- | -: | --- | ----------------- |
| StreamId  |  1 | u8  | 数据流ID             |
| ChannelId |  1 | u8  | 通道                |
| SignalId  |  2 | u16 | 分析物/信号            |
| Format    |  1 | u8  | 样本格式（见 10.3）      |
| Unit      |  1 | u8  | 单位（见 10.4）        |
| Ts0_us    |  8 | u64 | 第一个样本时间戳（0 表示不用）  |
| Dt_us     |  4 | u32 | 样本间隔（微秒，0 表示不定间隔） |
| N         |  2 | u16 | 样本数               |
| Samples   | 变长 | —   | N 个样本             |

### 10.3 Format 枚举

|  值 | 含义                | 单样本字节 |
| -: | ----------------- | ----: |
|  0 | u16（Raw ADC code） |     2 |
|  1 | i16               |     2 |
|  2 | i32               |     4 |
|  3 | f32               |     4 |

### 10.4 Unit 枚举

|  值 | 含义                       |
| -: | ------------------------ |
|  0 | code（原始码）                |
|  1 | V（伏特）                    |
|  2 | A（安培）                    |
|  3 | Ohm（欧姆）                  |
|  4 | custom（自定义，需配合 TLV/文档解释） |

> 若 Dt_us=0 且需要每点时间戳：可以扩展一种 Format（例如 0x80 表示每个样本后跟 u32 dt 或 u64 ts），留作 v1.1 扩展.

## 11.SIGNAL_ID 信号/分析物 ID 定义

|     SIGNAL_ID | 含义                        |
| ------------: | ------------------------- |
|        0x0001 | Glucose（葡萄糖）              |
|        0x0002 | Lactate（乳酸）               |
|        0x0003 | K（钾）                      |
|        0x0004 | Na（钠）                     |
|        0x00FF | RawElectroChem（通用原始电化学通道） |
| 0x8000–0xBFFF | 项目私有扩展                    |
| 0xC000–0xFFFF | 预留                        |

## 12 命令详细定义

### 12.1 系统/链路管理命令

#### 12.1.1 HELLO（握手/能力协商）

* **Req**： `MsgType=0x0001，ACK_REQ=1`
    * 可选TLV： MAX_PAYLOAD（Host希望值）、Host版本字符串（可用 RESULT_MSG 承载或自定义 TLV）
* **Resp**： `MsgType=0x0002，ACK=1`
    * 必选TLV： DEVICE_ID、FW_VERSION、CAP_BITS、MAX_PAYLOAD
    * 可选TLV： 支持的 SIGNAL_ID 列表

#### 12.1.2 PING / PONG（保活/延迟测量）

* **PING Req**：0x0003，可带 TIME_US

* **PONG Rsp**：0x0004，回 TIME_US（或原样返回）

#### 12.1.3 TIME_SYNC（可选）

* **Req**：0x0005，TLV: TIME_US（Host时间）
* **Rsp**：0x0006，TLV: TIME_US（Device时间）、可选偏移

### 12.2 配置命令

#### 12.2.1 SET_DAC（设置DAC输出）

* **Req**：MsgType=0x0100，ACK_REQ=1
    * TLV MUST：CHANNEL_ID
    * TLV MUST（二选一）：DAC_CODE 或 DAC_VOLT_F32

* **Rsp**：MsgType=0x0101，IS_ACK=1
    * TLV MUST：RESULT_CODE
    * 可选：回读实际 DAC_CODE / DAC_VOLT_F32

#### 12.2.2 CFG_CHANNEL (单通道配置)

* **Req**：MsgType=0x0110，ACK_REQ=1
    * TLV MUST：CHANNEL_ID
    * 可选 TLV：MODE_ID、PGA_GAIN、RTIA_OHM、ADC_RATE_SPS、BIAS_VOLT_F32、FILTER_CFG

* **Rsp**：MsgType=0x0111，IS_ACK=1
    * TLV MUST：RESULT_CODE
    * 可选：回读生效参数（同请求 TLV）

#### 12.2.3 GET_CFG(回读配置)

* **Req**：MsgType=0x0112，ACK_REQ=1（可带 CHANNEL_ID）

* **Rsp**：MsgType=0x0113，IS_ACK=1
    * TLV：返回当前配置快照

### 12.3 测量控制命令

#### 12.3.1 START_MEAS

* **Req**：MsgType=0x0200，ACK_REQ=1
    * TLV MUST：CHANNEL_ID
    * 可选 TLV：STREAM_ID（Host指定或省略让设备分配）、SIGNAL_ID、DURATION_MS
* **Rsp**：MsgType=0x0201，IS_ACK=1
    * TLV MUST：RESULT_CODE
    * 可选 TLV：STREAM_ID（设备分配时返回）、实际采样率等

#### 12.3.2 STOP_MEAS

* **Req**：MsgType=0x0202，ACK_REQ=1
    * 可选 TLV：CHANNEL_ID
* **Rsp**：MsgType=0x0203，IS_ACK=1 + RESULT_CODE

#### 12.3.3 GET_STATUS

* **Req**：MsgType=0x0204，ACK_REQ=1

* **Rsp**：MsgType=0x0205，IS_ACK=1
    * TLV：状态码（可用 RESULT_CODE 承载或另定义 STATUS TLV）、队列水位、丢包计数等（可扩展）

### 12.4 数据类

#### 12.4.1 DATA_FRAME 实时数据

* MsgType：0x0300

* 方向：Device → Host 为主

* Payload：见第 10 章

* Seq：每发一帧递增（建议每个 StreamId 独立计数）

#### 12.4.2 DATA_PULL（拉取历史数据）

* **Req**：MsgType=0x0301，ACK_REQ=1
    * TLV：STREAM_ID、起始 Seq、数量/时间窗等（可扩展）

* **Rsp**：MsgType=0x0302，IS_ACK=1（可能分片）
    * Payload：一到多个 DATA_FRAME 或自定义块（实现可选）

#### 12.4.3 STATS（可选）

* **Req**：MsgType=0x0303

* **Rsp**：MsgType=0x0304：返回丢包/溢出/吞吐统计（TLV）

### 12.5 事件/告警

#### 12.5.1 EVENT

* **MsgType**：0x0500（设备主动上报）

* Flags：一般不需要 ACK（也可按严重性要求 ACK_REQ=1）

* Payload：TLV
    * 建议 TLV：TIME_US、RESULT_CODE（或 EVENT_ID）、RESULT_MSG（描述）、CHANNEL_ID、STREAM_ID、附加参数 blob

## 13. 可靠性、去重、重传与超时机制

### 13.1 控制命令（可靠）

* Host 对控制命令 MUST：

    * 设置 ACK_REQ=1
    * 分配唯一 MsgId（递增 u16，回绕允许）

* Device MUST：

    * 返回 IS_ACK=1、相同 MsgId
    * 成功 RESULT_CODE=0
    * 失败 IS_ERR=1 且给出 RESULT_CODE != 0

**推荐超时与重试**

* Host 超时：UART 100–300ms，BLE 200–500ms（按你链路情况调）
* 重试次数：3 次
* 仍失败：上位机提示“链路异常/设备忙/参数错误”等

### 13.2 去重(幂等)

Device SHOULD 针对最近窗口的 (Src, MsgId) 做去重缓存：

* 若收到重复请求（同 MsgId、同 MsgType），应返回与第一次一致的响应，避免重复执行“写 DAC/重启测量”等。

### 13.3 数据流（通常不可靠）

* DATA_FRAME 默认不请求 ACK（提升吞吐）

* Host 通过 Seq 检测丢包与乱序：
    * Seq 断裂：记录丢包数量
    * 乱序：可选择重排或直接丢弃（BLE 通常不乱序，UART 也通常顺序）

## 14. 错误码（RESULT_CODE）

|      值 | 名称               | 含义                     |
| -----: | ---------------- | ---------------------- |
| 0x0000 | OK               | 成功                     |
| 0x0001 | UNKNOWN_MSG      | 未知 MsgType             |
| 0x0002 | BAD_CRC          | CRC 校验失败               |
| 0x0003 | BAD_LEN          | 长度不合法                  |
| 0x0004 | UNSUPPORTED_VER  | 版本不支持                  |
| 0x0100 | INVALID_PARAM    | 参数非法/缺失                |
| 0x0101 | BUSY             | 设备忙                    |
| 0x0102 | NOT_CONFIGURED   | 尚未完成必要配置               |
| 0x0103 | HW_FAULT         | 硬件故障/AFE 异常            |
| 0x0200 | INTERNAL_TIMEOUT | 内部超时                   |
| 0x0201 | STORAGE_FULL     | 缓存/存储满（如实现了 DATA_PULL） |

## 15 状态机建议

* IDLE：空闲，仅允许 HELLO/GET_STATUS

* CONFIGURED：已配置通道参数，允许 START_MEAS

* MEASURING：测量中，持续发 DATA_FRAME，允许 STOP_MEAS/GET_STATUS

* ERROR：错误态，可上报 EVENT，允许 GET_STATUS/复位命令（若你后续加 RESET 命令）

## 16 安全与鉴权（可选预留）

v1.0 默认不定义加密鉴权（便于快速落地）。如后续需要：

* 可新增 AUTH_CHALLENGE/AUTH_RESPONSE 命令（0x00xx）

* 或在 HELLO 中协商会话密钥（CAP_BITS 标识支持）

* Payload 可加密（例如 AES-CTR），并在 Flags 中新增 ENCRYPTED 位（建议 v2.0 再做）

## 17. 示例交互流程

### 17.1 基本流程

1. Host 连接 UART/BLE

2. Host → HELLO(0x0001)

3. Device → HELLO_RSP(0x0002, 含能力、最大包长、支持的 SIGNAL)

4. Host → CFG_CHANNEL(0x0110) / SET_DAC(0x0100)

5. Host → START_MEAS(0x0200)

6. Device → 连续 DATA_FRAME(0x0300)

7. Host → STOP_MEAS(0x0202)

## 18 示例

### 18.1 HELLO请求（Host->Device）

* Header:
    * Magic EC 50
    * Ver 01 00
    * Flags ACK_REQ=1 → 0x01
    * Src=01 Dst=10
    * MsgType=0x0001
    * MsgId=0x0001
    * Seq=0x0000
    * PayloadLen=…（例如 4）
* Payload（TLV）：
    * MAX_PAYLOAD (T=0x04, L=2, V=0x00C8=200)

### 18.2 HELLO 响应（Device → Host）

* Flags：IS_ACK=1 → 0x02

* MsgType=0x0002，MsgId=0x0001

* TLV：
    * DEVICE_ID
    * FW_VERSION
    * CAP_BITS
    * MAX_PAYLOAD
    * SIGNAL_ID *N（可多个）

### 18.3 SET_DAC 请求示例

* Req MsgType=0x0100

* TLV：
    * CHANNEL_ID=0
    * DAC_VOLT_F32=0.65

### 18.4 DATA_FRAME 示例

* MsgType=0x0300，Flags.STREAM=1

* Payload：

    * StreamId=1
    * ChannelId=0
    * SignalId=0x0001（Glucose）
    * Format=3（f32）
    * Unit=2（A）
    * Ts0_us=…
    * Dt_us=10000（10ms）
    * N=20
    * Samples=20个 float32

## 19 实现注意事项

1. 解析顺序：先校验 Magic → 版本 → HeaderCrc16 → PayloadLen 合法性 → FrameCrc32 → 再解析 Payload

2. 最大长度防御：PayloadLen 超过上限直接丢弃，避免内存攻击/栈溢出

3. 去重缓存：至少缓存最近 8–32 个 MsgId（按 Host 发送速度与链路延迟决定）

4. 数据与控制分队列：避免数据流淹没控制响应（尤其 BLE notify 堆积时）

5. 统计上报：建议实现 STATS 或在 GET_STATUS 里带丢包/溢出计数，便于定位链路与性能问题

## 20. 协议扩展规则

* 新增 MsgType：优先用预留区间，不复用旧命令

* 新增 TLV：使用未占用 T，旧设备跳过即可

* 新增 SIGNAL_ID：在 0x8000–0xBFFF 私有段登记

* 如需破坏兼容：提升 VerMajor