// ===== Heartbeat BPM Player =====
// 心音サンプル再生 + Web Serial API / WebSocket でセンサー連携

class HeartbeatPlayer {
    constructor() {
        this.audioCtx = null;
        this.bufferFront = null; // I音
        this.bufferBack = null;  // II音
        this.isPlaying = false;
        this.bpm = 72;
        this.volume = 0.7;
        this.nextBeatTime = 0;
        this.schedulerInterval = null;
        this.gainNode = null;
        this.mode = 'manual';

        // Serial property (USB)
        this.serialPort = null;
        this.serialReader = null;
        this.serialConnected = false;
        this.beatTimestamps = [];

        // WebSocket property (WiFi)
        this.ws = null;
        this.wsConnected = false;
        this.wsUrl = 'ws://192.168.4.1:81';

        // Distance sensor properties
        this.distance = 0;
        this.targetBpm = 72;
        this.bpmTransitionInterval = null;
        this.distanceConnMode = 'usb'; // 'usb' or 'wifi'

        this.initElements();
        this.bindEvents();
        this.initECG();
        this.loadAudio();
        
        // 初期表示を正しく設定
        this.updateDistanceSensorUI();
    }

    initElements() {
        this.bpmSlider = document.getElementById('bpmSlider');
        this.bpmValue = document.getElementById('bpmValue');
        this.playBtn = document.getElementById('playBtn');
        this.playIcon = document.getElementById('playIcon');
        this.stopIcon = document.getElementById('stopIcon');
        this.heartIcon = document.getElementById('heartIcon');
        this.heartGlow = document.getElementById('heartGlow');
        this.heartRing = document.getElementById('heartRing');
        this.bgPulse = document.getElementById('bgPulse');
        this.volumeSlider = document.getElementById('volumeSlider');
        this.ecgCanvas = document.getElementById('ecgCanvas');
        this.ecgCtx = this.ecgCanvas.getContext('2d');
        this.manualModeBtn = document.getElementById('manualModeBtn');
        this.pulseSensorModeBtn = document.getElementById('pulseSensorModeBtn');
        this.distanceSensorModeBtn = document.getElementById('distanceSensorModeBtn');
        
        // Pulse sensor elements
        this.pulseSensorBtn = document.getElementById('pulseSensorBtn');
        this.pulseStatusDot = document.getElementById('pulseStatusDot');
        this.pulseStatusText = document.getElementById('pulseStatusText');
        
        // Distance sensor elements
        this.distanceConnectionToggle = document.getElementById('distanceConnectionToggle');
        this.usbModeBtn = document.getElementById('usbModeBtn');
        this.wifiModeBtn = document.getElementById('wifiModeBtn');
        this.distanceSensorBtn = document.getElementById('distanceSensorBtn');
        this.wifiSensorBtn = document.getElementById('wifiSensorBtn');
        this.wifiSettings = document.getElementById('wifiSettings');
        this.wifiIpInput = document.getElementById('wifiIpInput');
        this.distanceStatusDot = document.getElementById('distanceStatusDot');
        this.distanceStatusText = document.getElementById('distanceStatusText');
        this.distanceDisplay = document.getElementById('distanceDisplay');
        this.distanceValue = document.getElementById('distanceValue');
        this.distanceBar = document.getElementById('distanceBar');
        
        this.presetBtns = document.querySelectorAll('.preset-btn');
    }

    async loadAudio() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.audioCtx = ctx;

            const [res1, res2] = await Promise.all([
                fetch('heartbeat-2_front.mp3'),
                fetch('heartbeat-2_back.mp3')
            ]);
            
            this.bufferFront = await ctx.decodeAudioData(await res1.arrayBuffer());
            this.bufferBack = await ctx.decodeAudioData(await res2.arrayBuffer());
            console.log("Audio Loaded Successfully");
        } catch (e) {
            console.error("Audio Load Error:", e);
        }
    }

    // BPMに応じた2音の間隔計算
    getS1S2Delay() {
        const cycle = 60 / this.bpm;
        return 0.36 * Math.sqrt(cycle); 
    }

    playHeartbeatSound(time) {
        if (!this.bufferFront || !this.bufferBack) return;

        const delay = this.getS1S2Delay();

        const s1 = this.audioCtx.createBufferSource();
        s1.buffer = this.bufferFront;
        s1.connect(this.gainNode);
        s1.start(time);

        const s2 = this.audioCtx.createBufferSource();
        s2.buffer = this.bufferBack;
        s2.connect(this.gainNode);
        s2.start(time + delay);
    }

    startScheduler() {
        this.nextBeatTime = this.audioCtx.currentTime + 0.05;
        this.schedulerInterval = setInterval(() => {
            while (this.nextBeatTime < this.audioCtx.currentTime + 0.1) {
                this.playHeartbeatSound(this.nextBeatTime);
                this.scheduleBeatVisual(this.nextBeatTime - this.audioCtx.currentTime);
                this.nextBeatTime += (60 / this.bpm);
            }
        }, 25);
    }

    toggle() {
        if (this.isPlaying) this.stop();
        else this.start();
    }

    start() {
        if (!this.audioCtx) return;
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        
        this.gainNode = this.audioCtx.createGain();
        this.gainNode.gain.value = this.volume;
        this.gainNode.connect(this.audioCtx.destination);
        
        this.isPlaying = true;
        this.playIcon.classList.add('hidden');
        this.stopIcon.classList.remove('hidden');
        this.startScheduler();
    }

    stop() {
        this.isPlaying = false;
        this.playIcon.classList.remove('hidden');
        this.stopIcon.classList.add('hidden');
        clearInterval(this.schedulerInterval);
        if (this.gainNode) this.gainNode.disconnect();
    }

    bindEvents() {
        this.playBtn.addEventListener('click', () => this.toggle());
        this.bpmSlider.addEventListener('input', (e) => {
            this.bpm = parseInt(e.target.value);
            this.bpmValue.textContent = this.bpm;
        });
        this.manualModeBtn.addEventListener('click', () => this.setMode('manual'));
        this.pulseSensorModeBtn.addEventListener('click', () => this.setMode('pulseSensor'));
        this.distanceSensorModeBtn.addEventListener('click', () => this.setMode('distanceSensor'));
        this.presetBtns.forEach(b => b.addEventListener('click', () => {
            this.bpm = parseInt(b.dataset.bpm);
            this.bpmSlider.value = this.bpm;
            this.bpmValue.textContent = this.bpm;
        }));
        
        // Sensor buttons
        this.pulseSensorBtn.addEventListener('click', () => this.connectPulseSensor());
        this.distanceSensorBtn.addEventListener('click', () => this.connectDistanceSensorUSB());
        this.wifiSensorBtn.addEventListener('click', () => this.connectDistanceSensorWiFi());
        
        // Connection mode toggle
        this.usbModeBtn.addEventListener('click', () => this.setDistanceConnMode('usb'));
        this.wifiModeBtn.addEventListener('click', () => this.setDistanceConnMode('wifi'));
    }

    setMode(m) {
        this.mode = m;
        this.manualModeBtn.classList.toggle('active', m === 'manual');
        this.pulseSensorModeBtn.classList.toggle('active', m === 'pulseSensor');
        this.distanceSensorModeBtn.classList.toggle('active', m === 'distanceSensor');
        
        // Show/hide controls based on mode
        this.bpmSlider.parentElement.classList.toggle('hidden', m !== 'manual');
        this.presetBtns[0].parentElement.classList.toggle('hidden', m !== 'manual');
        this.playBtn.classList.toggle('hidden', m !== 'manual');
        
        this.pulseSensorBtn.classList.toggle('hidden', m !== 'pulseSensor');
        document.getElementById('pulseSensorStatus').classList.toggle('hidden', m !== 'pulseSensor');
        
        // Distance sensor mode UI
        this.distanceConnectionToggle.classList.toggle('hidden', m !== 'distanceSensor');
        if (m === 'distanceSensor') {
            this.setDistanceConnMode('usb'); // デフォルトはUSBモード
        }
        document.getElementById('distanceSensorStatus').classList.toggle('hidden', m !== 'distanceSensor');
        this.distanceDisplay.classList.toggle('hidden', m !== 'distanceSensor');
        
        this.stop();
        this.disconnectAll();
    }

    setDistanceConnMode(mode) {
        this.distanceConnMode = mode;
        this.usbModeBtn.classList.toggle('active', mode === 'usb');
        this.wifiModeBtn.classList.toggle('active', mode === 'wifi');
        this.updateDistanceSensorUI();
    }

    updateDistanceSensorUI() {
        if (this.mode !== 'distanceSensor') return;
        
        const isUsb = this.distanceConnMode === 'usb';
        this.distanceSensorBtn.classList.toggle('hidden', !isUsb);
        this.wifiSensorBtn.classList.toggle('hidden', isUsb);
        this.wifiSettings.classList.toggle('hidden', isUsb);
    }

    // ===== Distance → BPM Mapping =====
    distanceToBpm(distance) {
        if (distance < 10) return 140;
        if (distance < 30) return 100;
        if (distance < 60) return 72;
        if (distance < 100) return 60;
        return 40;
    }

    updateDistanceDisplay(distance) {
        this.distanceValue.textContent = Math.round(distance);
        const percentage = Math.min((distance / 150) * 100, 100);
        this.distanceBar.style.width = `${percentage}%`;
    }

    smoothBpmTransition(targetBpm) {
        const currentBpm = parseInt(this.bpm);
        const diff = targetBpm - currentBpm;
        
        if (Math.abs(diff) < 2) {
            this.bpm = targetBpm;
        } else {
            this.bpm = currentBpm + Math.sign(diff) * Math.min(Math.abs(diff), 3);
        }
        
        this.bpmSlider.value = this.bpm;
        this.bpmValue.textContent = this.bpm;
    }

    // ===== USB Serial Connection =====
    async connectPulseSensor() {
        if (!('serial' in navigator)) {
            alert('Web Serial APIがサポートされていません。Chromeをお使いください。');
            return;
        }

        try {
            this.serialPort = await navigator.serial.requestPort();
            await this.serialPort.open({ baudRate: 115200 });
            
            this.serialConnected = true;
            this.pulseStatusDot.classList.add('connected');
            this.pulseStatusText.textContent = '接続済み';
            this.pulseSensorBtn.disabled = true;
            
            this.readPulseSensorData();
            if (!this.isPlaying) this.start();
        } catch (e) {
            console.error('Serial connection error:', e);
            this.pulseStatusDot.classList.add('error');
            this.pulseStatusText.textContent = '接続失敗';
        }
    }

    async readPulseSensorData() {
        const decoder = new TextDecoder();
        let buffer = '';

        while (this.serialPort && this.serialPort.readable) {
            try {
                this.serialReader = this.serialPort.readable.getReader();
                
                while (true) {
                    const { value, done } = await this.serialReader.read();
                    if (done) break;
                    
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop();
                    
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed === 'B') {
                            this.playBeatFromSensor();
                        }
                    }
                }
            } catch (e) {
                console.error('Read error:', e);
                break;
            } finally {
                if (this.serialReader) {
                    this.serialReader.releaseLock();
                    this.serialReader = null;
                }
            }
        }
    }

    async connectDistanceSensorUSB() {
        if (!('serial' in navigator)) {
            alert('Web Serial APIがサポートされていません。Chromeをお使いください。');
            return;
        }

        try {
            this.serialPort = await navigator.serial.requestPort();
            await this.serialPort.open({ baudRate: 115200 });
            
            this.serialConnected = true;
            this.distanceStatusDot.classList.add('connected');
            this.distanceStatusText.textContent = '接続済み (USB)';
            this.distanceSensorBtn.disabled = true;
            
            this.readDistanceSensorUSBData();
            if (!this.isPlaying) this.start();
            this.startDistanceBpmUpdate();
        } catch (e) {
            console.error('Serial connection error:', e);
            this.distanceStatusDot.classList.add('error');
            this.distanceStatusText.textContent = '接続失敗';
        }
    }

    async readDistanceSensorUSBData() {
        const decoder = new TextDecoder();
        let buffer = '';

        while (this.serialPort && this.serialPort.readable) {
            try {
                this.serialReader = this.serialPort.readable.getReader();
                
                while (true) {
                    const { value, done } = await this.serialReader.read();
                    if (done) break;
                    
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop();
                    
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed.startsWith('DIST:')) {
                            const distValue = parseInt(trimmed.substring(5));
                            if (!isNaN(distValue) && distValue >= 0) {
                                this.distance = distValue;
                                this.updateDistanceDisplay(this.distance);
                                this.targetBpm = this.distanceToBpm(this.distance);
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('Read error:', e);
                break;
            } finally {
                if (this.serialReader) {
                    this.serialReader.releaseLock();
                    this.serialReader = null;
                }
            }
        }
    }

    // ===== WebSocket (WiFi) Connection =====
    connectDistanceSensorWiFi() {
        const ip = this.wifiIpInput.value.trim() || '192.168.4.1';
        this.wsUrl = `ws://${ip}:81`;
        
        this.distanceStatusText.textContent = '接続中...';
        this.wifiSensorBtn.disabled = true;
        
        try {
            this.ws = new WebSocket(this.wsUrl);
            
            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.wsConnected = true;
                this.distanceStatusDot.classList.add('connected');
                this.distanceStatusText.textContent = '接続済み (WiFi)';
                
                if (!this.isPlaying) this.start();
                this.startDistanceBpmUpdate();
            };
            
            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.distance !== undefined) {
                        this.distance = data.distance;
                        this.updateDistanceDisplay(this.distance);
                        this.targetBpm = this.distanceToBpm(this.distance);
                    }
                } catch (e) {
                    console.error('Invalid JSON:', event.data);
                }
            };
            
            this.ws.onclose = () => {
                console.log('WebSocket disconnected');
                this.wsConnected = false;
                this.distanceStatusDot.classList.remove('connected');
                this.distanceStatusDot.classList.add('error');
                this.distanceStatusText.textContent = '接続切断';
                this.wifiSensorBtn.disabled = false;
            };
            
            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.distanceStatusDot.classList.add('error');
                this.distanceStatusText.textContent = '接続エラー';
                this.wifiSensorBtn.disabled = false;
            };
        } catch (e) {
            console.error('WebSocket connection error:', e);
            this.distanceStatusDot.classList.add('error');
            this.distanceStatusText.textContent = '接続失敗';
            this.wifiSensorBtn.disabled = false;
        }
    }

    startDistanceBpmUpdate() {
        this.bpmTransitionInterval = setInterval(() => {
            if (this.mode === 'distanceSensor' && this.targetBpm !== this.bpm) {
                this.smoothBpmTransition(this.targetBpm);
            }
        }, 200);
    }

    playBeatFromSensor() {
        if (!this.audioCtx) return;
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        
        if (!this.gainNode) {
            this.gainNode = this.audioCtx.createGain();
            this.gainNode.gain.value = this.volume;
            this.gainNode.connect(this.audioCtx.destination);
        }
        
        this.playHeartbeatSound(this.audioCtx.currentTime);
        this.scheduleBeatVisual(0);
    }

    disconnectAll() {
        // Stop BPM update
        if (this.bpmTransitionInterval) {
            clearInterval(this.bpmTransitionInterval);
            this.bpmTransitionInterval = null;
        }
        
        // Disconnect Serial
        if (this.serialReader) {
            this.serialReader.cancel().catch(() => {});
        }
        if (this.serialPort) {
            this.serialPort.close().catch(() => {});
            this.serialPort = null;
        }
        this.serialConnected = false;
        
        // Disconnect WebSocket
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.wsConnected = false;
        
        // Reset UI
        this.pulseStatusDot.classList.remove('connected', 'error');
        this.pulseStatusText.textContent = '未接続';
        this.pulseSensorBtn.disabled = false;
        
        this.distanceStatusDot.classList.remove('connected', 'error');
        this.distanceStatusText.textContent = '未接続';
        this.distanceSensorBtn.disabled = false;
        this.wifiSensorBtn.disabled = false;
    }

    scheduleBeatVisual(delay) {
        setTimeout(() => {
            this.heartIcon.classList.remove('beat');
            void this.heartIcon.offsetWidth;
            this.heartIcon.classList.add('beat');
            this.triggerECGSpike();
        }, delay * 1000);
    }

    // --- ECG Drawing Logic ---
    initECG() {
        this.ecgPos = 0;
        this.ecgData = new Array(400).fill(0);
        this.spikeActive = false;
        this.spikeTimer = 0;
        this.drawECG();
    }

    triggerECGSpike() { 
        this.spikeActive = true; 
        this.spikeTimer = 0; 
    }

    drawECG() {
        const ctx = this.ecgCtx;
        ctx.clearRect(0,0,400,80);
        ctx.beginPath();
        ctx.strokeStyle = '#e53e6b';
        
        let val = 0;
        if(this.spikeActive) {
            val = Math.sin(this.spikeTimer) * 30;
            this.spikeTimer += 0.5;
            if(this.spikeTimer > Math.PI * 2) this.spikeActive = false;
        }
        
        this.ecgData.shift();
        this.ecgData.push(val);

        for(let i=0; i<400; i++) {
            ctx.lineTo(i, 40 - this.ecgData[i]);
        }
        ctx.stroke();
        requestAnimationFrame(() => this.drawECG());
    }
}

document.addEventListener('DOMContentLoaded', () => new HeartbeatPlayer());
