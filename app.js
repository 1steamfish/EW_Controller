'use strict';
const state={connected:false,connType:null,measuring:false,measureType:'current',rangeMode:'manual',rangeValue:null,method:'CA',chartData:{xs:[],ys:[]},recordedData:[],peakValue:null,measureStart:null,measureDuration:0,serialPort:null,serialReader:null,serialWriter:null,uartReceiver:null,btDevice:null,btTxChar:null,btRxChar:null,pendingAcks:{},deviceInfo:{}};
const CURRENT_RANGES=[{label:'10 nA',rtia:10000000},{label:'100 nA',rtia:1000000},{label:'1 uA',rtia:100000},{label:'10 uA',rtia:10000},{label:'100 uA',rtia:1000},{label:'1 mA',rtia:100}];
const VOLTAGE_RANGES=[{label:'+/-100 mV'},{label:'+/-500 mV'},{label:'+/-1 V'},{label:'+/-2 V'}];
const METHOD_META={CA:{name:'CA',modeId:ECP.MODE_CA,xLabel:'Time(s)',yLabel:'Current'},CV:{name:'CV',modeId:ECP.MODE_CV,xLabel:'Potential(mV)',yLabel:'Current'},DPV:{name:'DPV',modeId:ECP.MODE_DPV,xLabel:'Potential(mV)',yLabel:'Current'},SWV:{name:'SWV',modeId:ECP.MODE_SWV,xLabel:'Potential(mV)',yLabel:'Current'},POT:{name:'POT',modeId:ECP.MODE_POT,xLabel:'Time(s)',yLabel:'Potential(mV)'}};
const METHOD_CN={CA:'?????',CV:'?????',DPV:'?????',SWV:'?????',POT:'?????'};
const RSP_BY_REQ={
  [ECP.MSG_HELLO_REQ]:ECP.MSG_HELLO_RSP,
  [ECP.MSG_PING]:ECP.MSG_PONG,
  [ECP.MSG_TIME_SYNC_REQ]:ECP.MSG_TIME_SYNC_RSP,
  [ECP.MSG_SET_DAC_REQ]:ECP.MSG_SET_DAC_RSP,
  [ECP.MSG_CFG_CH_REQ]:ECP.MSG_CFG_CH_RSP,
  [ECP.MSG_GET_CFG_REQ]:ECP.MSG_GET_CFG_RSP,
  [ECP.MSG_START_MEAS_REQ]:ECP.MSG_START_MEAS_RSP,
  [ECP.MSG_STOP_MEAS_REQ]:ECP.MSG_STOP_MEAS_RSP,
  [ECP.MSG_GET_STATUS_REQ]:ECP.MSG_GET_STATUS_RSP,
  [ECP.MSG_DATA_PULL_REQ]:ECP.MSG_DATA_PULL_RSP,
  [ECP.MSG_STATS_REQ]:ECP.MSG_STATS_RSP,
};
let mainChart;
function initChart(){
  const ctx=document.getElementById('mainChart').getContext('2d');
  mainChart=new Chart(ctx,{type:'line',data:{labels:[],datasets:[{label:'Data',data:[],borderColor:'#f5a623',backgroundColor:'rgba(245,166,35,0.06)',borderWidth:1.5,pointRadius:0,pointHoverRadius:4,pointHoverBackgroundColor:'#f5a623',tension:0.2,fill:true}]},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{backgroundColor:'#141820',borderColor:'#263348',borderWidth:1,titleColor:'#8c9ab5',bodyColor:'#f5a623',titleFont:{family:'JetBrains Mono',size:10},bodyFont:{family:'JetBrains Mono',size:12}}},scales:{x:{ticks:{color:'#4a566e',font:{family:'JetBrains Mono',size:10},maxTicksLimit:10},grid:{color:'rgba(255,255,255,0.04)'},border:{color:'#1c2538'}},y:{ticks:{color:'#4a566e',font:{family:'JetBrains Mono',size:10}},grid:{color:'rgba(255,255,255,0.04)'},border:{color:'#1c2538'}}}}});
}
function updateChartMeta(){
  const meta=METHOD_META[state.method];
  document.getElementById('chartTitle').textContent=(METHOD_CN[state.method]||state.method)+' ('+state.method+')';
  document.getElementById('xLabel').textContent=meta.xLabel;
  document.getElementById('yLabel').textContent=meta.yLabel;
  document.getElementById('th-x').textContent=meta.xLabel;
  document.getElementById('th-y').textContent=meta.yLabel;
}
function pushChartPoint(x,y){
  state.chartData.xs.push(x);state.chartData.ys.push(y);state.recordedData.push({x,y});
  if(state.chartData.xs.length>2000){state.chartData.xs.shift();state.chartData.ys.shift();}
  mainChart.data.labels=state.chartData.xs;
  mainChart.data.datasets[0].data=state.chartData.ys;
  mainChart.update('none');
  const unit=(state.measureType==='current')?ECP.UNIT_A:ECP.UNIT_V;
  document.getElementById('xVal').textContent=(typeof x==='number')?x.toFixed(3):String(x);
  document.getElementById('yVal').textContent=formatSampleValue(y,unit);
  if(state.peakValue===null||Math.abs(y)>Math.abs(state.peakValue))state.peakValue=y;
  document.getElementById('peakVal').textContent=formatSampleValue(state.peakValue,unit);
  document.getElementById('pointsVal').textContent=state.recordedData.length;
  document.getElementById('dataBadge').textContent=state.recordedData.length;
  const tbody=document.getElementById('dataTableBody');
  if(tbody.rows.length>200)tbody.deleteRow(0);
  const tr=tbody.insertRow();tr.insertCell().textContent=(typeof x==='number')?x.toFixed(4):String(x);tr.insertCell().textContent=formatSampleValue(y,unit);
  tbody.closest('.table-wrap').scrollTop=tbody.closest('.table-wrap').scrollHeight;
}
function clearChart(){
  state.chartData={xs:[],ys:[]};state.recordedData=[];state.peakValue=null;
  mainChart.data.labels=[];mainChart.data.datasets[0].data=[];mainChart.update('none');
  document.getElementById('dataTableBody').innerHTML='';
  ['pointsVal','dataBadge'].forEach(id=>document.getElementById(id).textContent='0');
  ['xVal','yVal','peakVal'].forEach(id=>document.getElementById(id).textContent='--');
  document.getElementById('progressBar').style.width='0%';
}
function exportCSV(){
  if(!state.recordedData.length){showToast('No data','warning');return;}
  const meta=METHOD_META[state.method];
  const lines=[meta.xLabel+','+meta.yLabel].concat(state.recordedData.map(p=>p.x+','+p.y));
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv'}));a.download='ecp_'+state.method+'_'+Date.now()+'.csv';a.click();
  showToast('CSV exported','success');
}
function exportPNG(){
  const a=document.createElement('a');a.href=mainChart.toBase64Image('image/png',1);a.download='ecp_'+state.method+'_'+Date.now()+'.png';a.click();
  showToast('Image exported','success');
}
function onMethodChange(){
  state.method=document.getElementById('methodSelect').value;
  document.querySelectorAll('.method-params').forEach(el=>el.classList.add('hidden'));
  document.getElementById('params-'+state.method).classList.remove('hidden');
  updateChartMeta();clearChart();
}
function selectMeasureType(type,btn){
  state.measureType=type;
  btn.closest('.segmented').querySelectorAll('.seg-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');populateRangeSelect();
}
function selectRangeMode(mode,btn){
  state.rangeMode=mode;
  btn.closest('.segmented').querySelectorAll('.seg-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('manualRangeGroup').style.display=(mode==='manual')?'':'none';
}
function onRangeChange(){
  const idx=parseInt(document.getElementById('rangeSelect').value);
  state.rangeValue=((state.measureType==='current')?CURRENT_RANGES:VOLTAGE_RANGES)[idx]||null;
}
function populateRangeSelect(){
  const sel=document.getElementById('rangeSelect');
  const ranges=(state.measureType==='current')?CURRENT_RANGES:VOLTAGE_RANGES;
  sel.innerHTML='';
  ranges.forEach((r,i)=>{const o=document.createElement('option');o.value=i;o.textContent=r.label;sel.appendChild(o);});
  onRangeChange();
}
function log(dir,msg){
  const body=document.getElementById('logBody');
  const line=document.createElement('div');line.className='log-line';
  const d=new Date();
  const ts=d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0')+':'+d.getSeconds().toString().padStart(2,'0')+'.'+d.getMilliseconds().toString().padStart(3,'0');
  line.innerHTML='<span class="log-time">'+ts+'</span><span class="log-dir '+dir+'">'+dir.toUpperCase()+'</span><span class="log-msg">'+msg+'</span>';
  body.appendChild(line);
  if(body.children.length>200)body.removeChild(body.firstChild);
  body.scrollTop=body.scrollHeight;
}
function clearLog(){document.getElementById('logBody').innerHTML='';}
function showToast(msg,type,dur){
  type=type||'info';dur=dur||3000;
  const c=document.getElementById('toastContainer');
  const el=document.createElement('div');el.className='toast '+type;
  el.innerHTML='<span>'+({success:'OK',error:'ERR',warning:'!',info:'i'}[type]||'')+' </span><span>'+msg+'</span>';
  c.appendChild(el);
  setTimeout(()=>{el.style.animation='toastOut .25s ease forwards';setTimeout(()=>el.remove(),280);},dur);
}
function setStatus(text,dotClass){
  document.getElementById('statusText').textContent=text;
  document.getElementById('statusDot').className='status-dot '+(dotClass||'');
}
function openConnectModal(){document.getElementById('connectModal').classList.remove('hidden');}
function closeConnectModal(){document.getElementById('connectModal').classList.add('hidden');}
function switchConnTab(tab,btn){
  document.querySelectorAll('.ctab').forEach(b=>b.classList.remove('active'));btn.classList.add('active');
  document.querySelectorAll('.ctab-content').forEach(c=>c.classList.add('hidden'));
  document.getElementById('tab-'+tab).classList.remove('hidden');
}
async function connectSerial(){
  if(!('serial'in navigator)){showToast('Web Serial not supported (use Chrome/Edge)','error');return;}
  try{
    const port=await navigator.serial.requestPort();
    await port.open({baudRate:parseInt(document.getElementById('baudRate').value),dataBits:parseInt(document.getElementById('dataBits').value),stopBits:parseInt(document.getElementById('stopBits').value),parity:document.getElementById('parity').value});
    state.serialPort=port;state.serialWriter=port.writable.getWriter();
    state.uartReceiver=new UARTFrameReceiver(onFrameReceived);
    closeConnectModal();onConnected('serial');readSerialLoop();
    log('info','Serial connected @ '+document.getElementById('baudRate').value+' baud');
    await doHandshake(true);
  }catch(e){showToast('Serial failed: '+e.message,'error');log('err',e.message);}
}
async function readSerialLoop(){
  try{
    const reader=state.serialPort.readable.getReader();state.serialReader=reader;
    for(;;){const{value,done}=await reader.read();if(done)break;if(value)state.uartReceiver.feed(value);}
  }catch(e){if(state.connected){log('err','Serial read: '+e.message);disconnectDevice();}}
}
// PART1END
// Part 2: BLE + frame handling
var BLE_SVC='6e400001-b5a3-f393-e0a9-e50e24dcca9e';
var BLE_RX='6e400002-b5a3-f393-e0a9-e50e24dcca9e';
var BLE_TX='6e400003-b5a3-f393-e0a9-e50e24dcca9e';
async function connectBluetooth(){
  if(!('bluetooth'in navigator)){showToast('Web Bluetooth not supported','error');return;}
  try{
    var svcUUID=document.getElementById('btServiceUUID').value.trim()||BLE_SVC;
    var device=await navigator.bluetooth.requestDevice({filters:[{services:[svcUUID]}],optionalServices:[svcUUID]});
    state.btDevice=device;
    device.addEventListener('gattserverdisconnected',function(){if(state.connected){log('err','BT disconnected');onDisconnected();}});
    var server=await device.gatt.connect();
    var service=await server.getPrimaryService(svcUUID);
    state.btTxChar=await service.getCharacteristic(BLE_RX);
    state.btRxChar=await service.getCharacteristic(BLE_TX);
    await state.btRxChar.startNotifications();
    state.btRxChar.addEventListener('characteristicvaluechanged',function(e){
      var frame=parseFrame(new Uint8Array(e.target.value.buffer));
      if(frame)onFrameReceived(frame);
    });
    closeConnectModal();onConnected('bluetooth');
    log('info','BT: '+(device.name||device.id));
    await doHandshake(false);
  }catch(e){showToast('BT failed: '+e.message,'error');log('err',e.message);}
}
async function sendBytes(bytes){
  if(state.connType==='serial'&&state.serialWriter)await state.serialWriter.write(bytes);
  else if(state.connType==='bluetooth'&&state.btTxChar)await state.btTxChar.writeValueWithoutResponse(bytes.buffer);
}
function getAckTimeoutMs(){
  return state.connType==='serial'?250:400;
}
function armAckWait(msgId,timeoutMs,expectedRspType){
  return new Promise(function(resolve,reject){
    var timer=setTimeout(function(){
      if(state.pendingAcks[msgId])delete state.pendingAcks[msgId];
      reject(new Error('ACK timeout'));},timeoutMs);
    state.pendingAcks[msgId]={timer:timer,resolve:resolve,reject:reject,expectedRspType:expectedRspType};
  });
}
async function sendRequestWithAck(baseOpts,uart,retryCount,timeoutMs){
  var attempts=Math.max(1,retryCount||3);
  var msgId=(baseOpts.msgId!==undefined)?baseOpts.msgId:nextMsgId();
  var expectedRspType=RSP_BY_REQ[baseOpts.msgType];
  for(var attempt=1;attempt<=attempts;attempt++){
    var opts=Object.assign({},baseOpts,{flags:(baseOpts.flags||0)|ECP.FLAG_ACK_REQ,msgId:msgId});
    var ackP=armAckWait(msgId,timeoutMs||getAckTimeoutMs(),expectedRspType);
    try{
      await sendBytes(uart?buildUARTFrame(opts):buildFrame(opts));
      var ack=await ackP;
      if(ack&&ack.resultCode!==undefined&&ack.resultCode!==ECP.RC_OK)throw new Error('Dev err: '+resultString(ack.resultCode));
      return ack;
    }catch(e){
      var p=state.pendingAcks[msgId];
      if(p){clearTimeout(p.timer);delete state.pendingAcks[msgId];}
      if(attempt===attempts)throw e;
      log('err','Retry '+attempt+'/'+attempts+' msg=0x'+opts.msgType.toString(16).padStart(4,'0')+' reason='+e.message);
    }
  }
}
function onFrameReceived(frame){
  var flags=frame.flags,msgType=frame.msgType,msgId=frame.msgId,payload=frame.payload;
  var tlvPayload=parseTLV(payload,0,payload.length);
  // Compatibility: some firmware sends *_RSP without FLAG_ACK. Accept matching response type as ACK completion.
  var p=state.pendingAcks[msgId];
  if(!p&&(msgType>=0x0002)&&(msgType&0x0001)===0){
    var keys=Object.keys(state.pendingAcks);
    for(var i=0;i<keys.length;i++){
      var k=keys[i],cand=state.pendingAcks[k];
      if(cand&&cand.expectedRspType===msgType){p=cand;msgId=Number(k);break;}
    }
  }
  if(p&&((flags&ECP.FLAG_ACK)||p.expectedRspType===msgType)){
    clearTimeout(p.timer);delete state.pendingAcks[msgId];
    if(flags&ECP.FLAG_IS_ERR)p.reject(new Error('Dev err: '+resultString(tlvPayload.resultCode||0)));
    else p.resolve(tlvPayload);
  }
  if(flags&ECP.FLAG_ACK){
    // already handled above
  }
  if(msgType===ECP.MSG_DATA_FRAME){
    var df=parseDataFrame(payload);if(!df)return;
    log('rx','DATA ch='+df.channelId+' n='+df.n);
    processSamples(df);return;
  }
  if(msgType===ECP.MSG_EVENT){
    var tlv=tlvPayload;
    var msg=tlv.resultMsg||resultString(tlv.resultCode||0);
    log('err','EVENT: '+msg);showToast('Event: '+msg,'warning');return;
  }
  if(msgType===ECP.MSG_HELLO_RSP){
    var tlv2=tlvPayload;
    state.deviceInfo=tlv2;updateDeviceInfo(tlv2);
    log('rx','HELLO_RSP dev='+(tlv2.deviceId||'?'));return;
  }
  log('rx','0x'+msgType.toString(16).padStart(4,'0')+' id='+msgId);
}
var _sampleIndex=0;
function processSamples(df){
  var dtSec=df.dt_us?Number(df.dt_us)/1e6:0;
  var ts0=Number(df.ts0_us)/1e6;
  df.samples.forEach(function(v,i){
    var isTime=state.method==='CA'||state.method==='POT';
    var x=isTime?parseFloat((df.dt_us?ts0+(_sampleIndex+i)*dtSec:(_sampleIndex+i)*0.1).toFixed(3)):_sampleIndex+i;
    pushChartPoint(x,v);
  });
  _sampleIndex+=df.samples.length;
  if(state.measureDuration>0){
    var pct=Math.min(100,(Date.now()-state.measureStart)/1000/state.measureDuration*100);
    document.getElementById('progressBar').style.width=pct+'%';
  }
}
async function doHandshake(uart){
  log('tx','HELLO_REQ');
  showToast('Handshaking...','info');
  var payload=new TLVBuilder().u16(ECP.TLV_MAX_PAYLOAD,512).build();
  var opts={flags:ECP.FLAG_ACK_REQ,msgType:ECP.MSG_HELLO_REQ,payload:payload};
  await sendRequestWithAck(opts,uart,3,getAckTimeoutMs());
}
function updateDeviceInfo(tlv){
  document.getElementById('deviceInfoBlock').classList.remove('hidden');
  document.getElementById('di-id').textContent=tlv.deviceId||'-';
  document.getElementById('di-fw').textContent=tlv.fwVersion||'-';
  document.getElementById('di-cap').textContent=tlv.capBits!==undefined?'0x'+tlv.capBits.toString(16).padStart(8,'0'):'-';
  setStatus('Connected '+(tlv.deviceId||''),'connected');
  showToast('Handshake OK','success');
}
function onConnected(type){
  state.connected=true;state.connType=type;
  document.getElementById('btnConnect').classList.add('hidden');
  document.getElementById('btnDisconnect').classList.remove('hidden');
  setStatus(type==='serial'?'Serial Connected':'BT Connected','connected');
  showToast('Connected','success');
}
function onDisconnected(){
  state.connected=false;state.connType=null;state.measuring=false;
  document.getElementById('btnConnect').classList.remove('hidden');
  document.getElementById('btnDisconnect').classList.add('hidden');
  document.getElementById('btnStart').classList.remove('hidden');
  document.getElementById('btnStop').classList.add('hidden');
  document.getElementById('deviceInfoBlock').classList.add('hidden');
  setStatus('Disconnected','');showToast('Disconnected','warning');
}
async function disconnectDevice(){
  if(state.measuring)await window.stopMeasurement();
  try{
    if(state.connType==='serial'){
      if(state.serialReader){await state.serialReader.cancel();state.serialReader=null;}
      if(state.serialWriter){state.serialWriter.releaseLock();state.serialWriter=null;}
      if(state.serialPort){await state.serialPort.close();state.serialPort=null;}
    }else if(state.connType==='bluetooth'){
      if(state.btRxChar)state.btRxChar.stopNotifications().catch(function(){});
      if(state.btDevice&&state.btDevice.gatt&&state.btDevice.gatt.connected)state.btDevice.gatt.disconnect();
      state.btDevice=state.btTxChar=state.btRxChar=null;
    }
  }catch(e){}
  onDisconnected();log('info','Disconnected');
}
// Part 3: measurement + demo + init
async function _startReal(){
  clearChart();_sampleIndex=0;state.peakValue=null;
  var ch=parseInt(document.getElementById('channelSelect').value);
  var uart=state.connType==='serial';
  var meta=METHOD_META[state.method];
  var sps=parseInt(document.getElementById('sampleRateSelect').value);
  var biasV=parseFloat(document.getElementById('biasVoltInput').value)/1000;
  var cb=new TLVBuilder().u8(ECP.TLV_CHANNEL_ID,ch).u8(ECP.TLV_MODE_ID,meta.modeId).u32(ECP.TLV_ADC_RATE_SPS,sps).f32(ECP.TLV_BIAS_VOLT_F32,biasV);
  if(state.rangeMode==='manual'&&state.rangeValue&&state.rangeValue.rtia)cb.u32(ECP.TLV_RTIA_OHM,state.rangeValue.rtia).u8(ECP.TLV_PGA_GAIN,1);
  var cfgOpts={flags:ECP.FLAG_ACK_REQ,msgType:ECP.MSG_CFG_CH_REQ,payload:cb.build()};
  await sendRequestWithAck(cfgOpts,uart,3,getAckTimeoutMs());
  log('tx','CFG_CHANNEL ch='+ch+' mode='+state.method+' sps='+sps);
  var durationMs=0;
  if(state.method==='CA')durationMs=parseInt(document.getElementById('ca-duration').value)*1000;
  if(state.method==='POT')durationMs=parseInt(document.getElementById('pot-duration').value)*1000;
  state.measureDuration=durationMs/1000;state.measureStart=Date.now();
  var sb=new TLVBuilder().u8(ECP.TLV_CHANNEL_ID,ch).u8(ECP.TLV_STREAM_ID,1).u16(ECP.TLV_SIGNAL_ID,0x00FF);
  if(durationMs>0)sb.u32(ECP.TLV_DURATION_MS,durationMs);
  var startOpts={flags:ECP.FLAG_ACK_REQ,msgType:ECP.MSG_START_MEAS_REQ,payload:sb.build()};
  await sendRequestWithAck(startOpts,uart,3,getAckTimeoutMs());
  log('tx','START_MEAS ch='+ch+' dur='+durationMs+'ms');
  state.measuring=true;
  document.getElementById('btnStart').classList.add('hidden');
  document.getElementById('btnStop').classList.remove('hidden');
  setStatus('Measuring...','measuring');
  showToast(state.method+' started','success');
}
async function _stopReal(){
  var ch=parseInt(document.getElementById('channelSelect').value);
  var uart=state.connType==='serial';
  var opts={flags:ECP.FLAG_ACK_REQ,msgType:ECP.MSG_STOP_MEAS_REQ,payload:new TLVBuilder().u8(ECP.TLV_CHANNEL_ID,ch).build()};
  await sendRequestWithAck(opts,uart,3,getAckTimeoutMs());
  log('tx','STOP_MEAS ch='+ch);
  state.measuring=false;
  document.getElementById('btnStart').classList.remove('hidden');
  document.getElementById('btnStop').classList.add('hidden');
  document.getElementById('progressBar').style.width='0%';
  setStatus('Connected','connected');showToast('Stopped','info');
}
var _demoTimer=null;
function startDemo(){
  if(_demoTimer)return;
  var t=0;
  _demoTimer=setInterval(function(){
    for(var i=0;i<5;i++){
      var x,y;
      switch(state.method){
        case'CA':x=parseFloat((t*0.02).toFixed(3));y=50e-6*Math.exp(-x/5)+(Math.random()-0.5)*2e-6;break;
        case'CV':x=parseFloat((((t*2)%2000)-1000).toFixed(1));y=Math.sin(x/150)*30e-6+(Math.random()-0.5)*2e-6;break;
        case'DPV':case'SWV':x=-500+(t%1000);y=20e-6*Math.exp(-Math.pow(x+100,2)/4000)+(Math.random()-0.5)*1e-6;break;
        case'POT':x=parseFloat((t*0.02).toFixed(3));y=0.45+Math.sin(t*0.015)*0.04+(Math.random()-0.5)*0.003;break;
        default:x=t;y=0;
      }
      pushChartPoint(x,y);t++;
    }
    if(state.measureDuration>0){
      var pct=Math.min(100,(Date.now()-state.measureStart)/1000/state.measureDuration*100);
      document.getElementById('progressBar').style.width=pct+'%';
      if(pct>=100)window.stopMeasurement();
    }
  },100);
}
function stopDemo(){if(_demoTimer){clearInterval(_demoTimer);_demoTimer=null;}}
window.startMeasurement=async function(){
  if(!state.connected){
    clearChart();_sampleIndex=0;state.peakValue=null;
    state.measuring=true;state.measureStart=Date.now();
    state.measureDuration=state.method==='CA'?parseInt(document.getElementById('ca-duration').value):state.method==='POT'?parseInt(document.getElementById('pot-duration').value):0;
    document.getElementById('btnStart').classList.add('hidden');
    document.getElementById('btnStop').classList.remove('hidden');
    setStatus('Demo','measuring');
    showToast('Demo mode active','warning');
    log('info','Demo mode started');
    startDemo();return;
  }
  try{await _startReal();}
  catch(e){log('err','START failed: '+e.message);showToast('Start failed: '+e.message,'error');}
};
window.stopMeasurement=async function(){
  if(!state.connected){
    stopDemo();state.measuring=false;
    document.getElementById('btnStart').classList.remove('hidden');
    document.getElementById('btnStop').classList.add('hidden');
    document.getElementById('progressBar').style.width='0%';
    setStatus('Disconnected','');showToast('Demo stopped','info');return;
  }
  try{await _stopReal();}
  catch(e){log('err','STOP failed: '+e.message);showToast('Stop failed: '+e.message,'error');}
};
document.addEventListener('DOMContentLoaded',function(){
  initChart();
  populateRangeSelect();
  onMethodChange();
  updateChartMeta();
  log('info','ElectroChem Station ready - ECP v1.0');
  log('info','Click Connect to link device, or Start to enter demo mode');
});
