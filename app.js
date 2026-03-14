// ===== Heartbeat BPM Player =====
// 心音サンプル再生 + Web Serial API / WebSocket でセンサー連携

class HeartbeatPlayer {
    constructor() {
        // Audio
        this.audioCtx = null;
        this.bufferFront = null; // I音
        this.bufferBack = null;  // II音
        this.gainNode = null;
        this.isPlaying = false;
        this.bpm = 55;
        this.volume = 0.7;
        this.nextBeatTime = 0;
        this.schedulerInterval = null;

        // Mode
        this.mode = 'manual';

        // Serial (USB)
        this.serialPort = null;
        this.serialReader = null;
        this.serialConnected = false;
        this.beatTimestamps = [];

        // WebSocket (WiFi)
        this.ws = null;
        this.wsConnected = false;

        // Distance sensor
        this.distance = 0;
        this.targetBpm = 55;
        this.bpmTransitionInterval = null;
        this.distanceConnMode = 'usb';

        // Calibration
        this.calibration = { offset: 0, scale: 1.0 };

        // Distance→BPM linear mapping
        this.linearMapping = { maxDist: 200, minBpm: 55, maxBpm: 75 };

        this.initElements();
        this.bindEvents();
        this.loadAudio();
        this.initECG();
    }

    // ===== Element References =====
    initElements() {
        this.bpmSlider   = document.getElementById('bpmSlider');
        this.bpmValue    = document.getElementById('bpmValue');
        this.playBtn     = document.getElementById('playBtn');
        this.playIcon    = document.getElementById('playIcon');
        this.stopIcon    = document.getElementById('stopIcon');
        this.heartIcon   = document.getElementById('heartIcon');
        this.heartGlow   = document.getElementById('heartGlow');
        this.heartRing   = document.getElementById('heartRing');
        this.bgPulse     = document.getElementById('bgPulse');
        this.volumeSlider = document.getElementById('volumeSlider');
        this.ecgCanvas   = document.getElementById('ecgCanvas');
        this.ecgCtx      = this.ecgCanvas.getContext('2d');

        // Mode buttons
        this.manualModeBtn       = document.getElementById('manualModeBtn');
        this.pulseSensorModeBtn  = document.getElementById('pulseSensorModeBtn');
        this.distanceSensorModeBtn = document.getElementById('distanceSensorModeBtn');

        // Pulse sensor
        this.pulseSensorBtn    = document.getElementById('pulseSensorBtn');
        this.pulseSensorStatus = document.getElementById('pulseSensorStatus');
        this.pulseStatusDot    = document.getElementById('pulseStatusDot');
        this.pulseStatusText   = document.getElementById('pulseStatusText');

        // Distance sensor
        this.distanceConnectionToggle = document.getElementById('distanceConnectionToggle');
        this.usbModeBtn           = document.getElementById('usbModeBtn');
        this.wifiModeBtn          = document.getElementById('wifiModeBtn');
        this.realSenseModeBtn     = document.getElementById('realSenseModeBtn');
        this.distanceSensorBtn    = document.getElementById('distanceSensorBtn');
        this.wifiSensorBtn        = document.getElementById('wifiSensorBtn');
        this.realSenseSensorBtn   = document.getElementById('realSenseSensorBtn');
        this.wifiSettings         = document.getElementById('wifiSettings');
        this.wifiIpInput          = document.getElementById('wifiIpInput');
        this.realSenseSettings    = document.getElementById('realSenseSettings');
        this.realSenseWsInput     = document.getElementById('realSenseWsInput');
        this.distanceSensorStatus = document.getElementById('distanceSensorStatus');
        this.distanceStatusDot    = document.getElementById('distanceStatusDot');
        this.distanceStatusText   = document.getElementById('distanceStatusText');
        this.distanceDisplay      = document.getElementById('distanceDisplay');
        this.distanceValue        = document.getElementById('distanceValue');
        this.distanceBar          = document.getElementById('distanceBar');

        // Calibration
        this.distanceCalibration = document.getElementById('distanceCalibration');
        this.distanceOffset      = document.getElementById('distanceOffset');
        this.distanceScale       = document.getElementById('distanceScale');
        this.offsetValue         = document.getElementById('offsetValue');
        this.scaleValue          = document.getElementById('scaleValue');
        this.calibrationReset    = document.getElementById('calibrationReset');

        // Distance→BPM mapping
        this.distanceMapping  = document.getElementById('distanceMapping');
        this.maxDistSlider    = document.getElementById('maxDistSlider');
        this.minBpmSlider     = document.getElementById('minBpmSlider');
        this.maxBpmSlider     = document.getElementById('maxBpmSlider');
        this.maxDistDisplay   = document.getElementById('maxDistDisplay');
        this.minBpmDisplay    = document.getElementById('minBpmDisplay');
        this.maxBpmDisplay    = document.getElementById('maxBpmDisplay');

        this.presetBtns = document.querySelectorAll('.preset-btn');
    }

    // ===== Audio =====
    async loadAudio() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.audioCtx = ctx;
            const [r1, r2] = await Promise.all([
                fetch('heartbeat-2_front.mp3'),
                fetch('heartbeat-2_back.mp3')
            ]);
            this.bufferFront = await ctx.decodeAudioData(await r1.arrayBuffer());
            this.bufferBack  = await ctx.decodeAudioData(await r2.arrayBuffer());
        } catch (e) {
            console.error('Audio load error:', e);
        }
    }

    // S1-S2 delay: shorter at higher BPM
    getS1S2Delay() {
        return 0.36 * Math.sqrt(60 / this.bpm);
    }

    playHeartbeatSound(time) {
        if (!this.bufferFront || !this.bufferBack || !this.gainNode) return;

        const s1 = this.audioCtx.createBufferSource();
        s1.buffer = this.bufferFront;
        s1.connect(this.gainNode);
        s1.start(time);

        const s2 = this.audioCtx.createBufferSource();
        s2.buffer = this.bufferBack;
        s2.connect(this.gainNode);
        s2.start(time + this.getS1S2Delay());
    }

    startScheduler() {
        this.nextBeatTime = this.audioCtx.currentTime + 0.05;
        this.schedulerInterval = setInterval(() => {
            while (this.nextBeatTime < this.audioCtx.currentTime + 0.1) {
                this.playHeartbeatSound(this.nextBeatTime);
                this.scheduleBeatVisual(this.nextBeatTime - this.audioCtx.currentTime);
                this.nextBeatTime += 60 / this.bpm;
            }
        }, 25);
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
        this.schedulerInterval = null;
        if (this.gainNode) {
            this.gainNode.disconnect();
            this.gainNode = null;
        }
    }

    toggle() {
        if (this.isPlaying) this.stop();
        else this.start();
    }

    // ===== Events =====
    bindEvents() {
        this.playBtn.addEventListener('click', () => this.toggle());

        this.bpmSlider.addEventListener('input', (e) => {
            this.bpm = parseInt(e.target.value);
            this.bpmValue.textContent = this.bpm;
            this.updatePresetActive();
        });

        this.volumeSlider.addEventListener('input', (e) => {
            this.volume = parseInt(e.target.value) / 100;
            if (this.gainNode) this.gainNode.gain.value = this.volume;
        });

        // Space key: play/stop in manual mode
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && e.target === document.body) {
                e.preventDefault();
                if (this.mode === 'manual') this.toggle();
            }
        });

        // Mode buttons
        this.manualModeBtn.addEventListener('click', () => this.setMode('manual'));
        this.pulseSensorModeBtn.addEventListener('click', () => this.setMode('pulseSensor'));
        this.distanceSensorModeBtn.addEventListener('click', () => this.setMode('distanceSensor'));

        // Preset buttons
        this.presetBtns.forEach(btn => btn.addEventListener('click', () => {
            this.bpm = parseInt(btn.dataset.bpm);
            this.bpmSlider.value = this.bpm;
            this.bpmValue.textContent = this.bpm;
            this.updatePresetActive();
        }));

        // Sensor buttons
        this.pulseSensorBtn.addEventListener('click', () => this.connectPulseSensor());
        this.distanceSensorBtn.addEventListener('click', () => this.connectDistanceSensorUSB());
        this.wifiSensorBtn.addEventListener('click', () => this.connectDistanceSensorWiFi());
        this.realSenseSensorBtn.addEventListener('click', () => this.connectRealSense());

        // USB/WiFi/RealSense toggle
        this.usbModeBtn.addEventListener('click', () => this.setDistanceConnMode('usb'));
        this.wifiModeBtn.addEventListener('click', () => this.setDistanceConnMode('wifi'));
        this.realSenseModeBtn.addEventListener('click', () => this.setDistanceConnMode('realsense'));

        // Calibration
        this.distanceOffset.addEventListener('input', (e) => {
            this.calibration.offset = parseInt(e.target.value);
            const v = this.calibration.offset;
            this.offsetValue.textContent = v > 0 ? `+${v}` : v;
        });
        this.distanceScale.addEventListener('input', (e) => {
            this.calibration.scale = parseFloat(e.target.value);
            this.scaleValue.textContent = this.calibration.scale.toFixed(1);
        });
        this.calibrationReset.addEventListener('click', () => this.resetCalibration());

        // Mapping sliders
        this.maxDistSlider.addEventListener('input', (e) => {
            this.linearMapping.maxDist = parseInt(e.target.value);
            this.maxDistDisplay.textContent = this.linearMapping.maxDist;
        });
        this.minBpmSlider.addEventListener('input', (e) => {
            this.linearMapping.minBpm = parseInt(e.target.value);
            this.minBpmDisplay.textContent = this.linearMapping.minBpm;
        });
        this.maxBpmSlider.addEventListener('input', (e) => {
            this.linearMapping.maxBpm = parseInt(e.target.value);
            this.maxBpmDisplay.textContent = this.linearMapping.maxBpm;
        });
    }

    updatePresetActive() {
        this.presetBtns.forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.bpm) === this.bpm);
        });
    }

    // ===== Mode =====
    setMode(m) {
        this.stop();
        this.disconnectAll();
        this.mode = m;

        this.manualModeBtn.classList.toggle('active', m === 'manual');
        this.pulseSensorModeBtn.classList.toggle('active', m === 'pulseSensor');
        this.distanceSensorModeBtn.classList.toggle('active', m === 'distanceSensor');

        // Manual controls
        this.bpmSlider.parentElement.classList.toggle('hidden', m !== 'manual');
        this.presetBtns[0].parentElement.classList.toggle('hidden', m !== 'manual');
        this.playBtn.classList.toggle('hidden', m !== 'manual');

        // Pulse sensor controls
        this.pulseSensorBtn.classList.toggle('hidden', m !== 'pulseSensor');
        this.pulseSensorStatus.classList.toggle('hidden', m !== 'pulseSensor');

        // Distance sensor controls
        this.distanceConnectionToggle.classList.toggle('hidden', m !== 'distanceSensor');
        this.distanceSensorStatus.classList.toggle('hidden', m !== 'distanceSensor');
        this.distanceDisplay.classList.toggle('hidden', m !== 'distanceSensor');
        this.distanceCalibration.classList.toggle('hidden', m !== 'distanceSensor');
        this.distanceMapping.classList.toggle('hidden', m !== 'distanceSensor');

        if (m === 'distanceSensor') this.setDistanceConnMode('usb');
    }

    setDistanceConnMode(mode) {
        this.distanceConnMode = mode;
        this.usbModeBtn.classList.toggle('active', mode === 'usb');
        this.wifiModeBtn.classList.toggle('active', mode === 'wifi');
        this.realSenseModeBtn.classList.toggle('active', mode === 'realsense');
        this.distanceSensorBtn.classList.toggle('hidden', mode !== 'usb');
        this.wifiSensorBtn.classList.toggle('hidden', mode !== 'wifi');
        this.wifiSettings.classList.toggle('hidden', mode !== 'wifi');
        this.realSenseSensorBtn.classList.toggle('hidden', mode !== 'realsense');
        this.realSenseSettings.classList.toggle('hidden', mode !== 'realsense');
    }

    // ===== Distance → BPM =====
    distanceToBpm(d) {
        const { maxDist, minBpm, maxBpm } = this.linearMapping;
        if (d >= maxDist) return minBpm;
        const ratio = 1 - (d / maxDist);
        return Math.round(minBpm + ratio * (maxBpm - minBpm));
    }

    applyCalibration(raw) {
        return Math.max(0, raw * this.calibration.scale + this.calibration.offset);
    }

    updateDistanceDisplay(rawDistance) {
        const calibrated = this.applyCalibration(rawDistance);
        this.distance = calibrated;
        this.distanceValue.textContent = Math.round(calibrated);
        this.distanceBar.style.width = `${Math.min((calibrated / 150) * 100, 100)}%`;
    }

    resetCalibration() {
        this.calibration = { offset: 0, scale: 1.0 };
        this.distanceOffset.value = 0;
        this.distanceScale.value  = 1.0;
        this.offsetValue.textContent = '0';
        this.scaleValue.textContent  = '1.0';
    }

    smoothBpmTransition() {
        if (this.mode !== 'distanceSensor') return;
        const diff = this.targetBpm - this.bpm;
        if (Math.abs(diff) < 1) {
            this.bpm = this.targetBpm;
        } else {
            this.bpm += Math.sign(diff) * Math.min(Math.abs(diff), 3);
        }
        this.bpmSlider.value = Math.round(this.bpm);
        this.bpmValue.textContent = Math.round(this.bpm);
    }

    startDistanceBpmUpdate() {
        this.bpmTransitionInterval = setInterval(() => this.smoothBpmTransition(), 200);
    }

    // ===== WebSocket: RealSense D435i =====
    connectRealSense() {
        // Resume AudioContext synchronously inside user gesture
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
        const url = (this.realSenseWsInput.value.trim() || 'ws://localhost:8765');
        this.distanceStatusText.textContent = '接続中...';
        this.realSenseSensorBtn.disabled = true;

        try {
            this.ws = new WebSocket(url);

            this.ws.onopen = () => {
                this.wsConnected = true;
                this.distanceStatusDot.classList.add('connected');
                this.distanceStatusText.textContent = '接続済み (RealSense)';
                if (!this.isPlaying) this.start();
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.distance !== undefined) {
                        this.updateDistanceDisplay(data.distance);
                        const target = this.distanceToBpm(this.distance);
                        const diff = target - this.bpm;
                        if (Math.abs(diff) >= 1) {
                            this.bpm += Math.sign(diff) * Math.min(Math.abs(diff), 2);
                        } else {
                            this.bpm = target;
                        }
                        this.bpmSlider.value = Math.round(this.bpm);
                        this.bpmValue.textContent = Math.round(this.bpm);
                    }
                } catch { /* ignore invalid JSON */ }
            };

            this.ws.onclose = () => {
                this.wsConnected = false;
                this.distanceStatusDot.classList.remove('connected');
                this.distanceStatusDot.classList.add('error');
                this.distanceStatusText.textContent = '切断';
                this.realSenseSensorBtn.disabled = false;
            };

            this.ws.onerror = () => {
                this.distanceStatusDot.classList.add('error');
                this.distanceStatusText.textContent = '接続エラー (サーバー起動済みか確認)';
                this.realSenseSensorBtn.disabled = false;
            };
        } catch (e) {
            console.error('RealSense WebSocket error:', e);
            this.distanceStatusDot.classList.add('error');
            this.distanceStatusText.textContent = '接続失敗';
            this.realSenseSensorBtn.disabled = false;
        }
    }

    // ===== USB Serial: Pulse Sensor =====
    async connectPulseSensor() {
        if (!('serial' in navigator)) {
            alert('Web Serial APIがサポートされていません。Chromeをお使いください。');
            return;
        }
        try {
            this.serialPort = await navigator.serial.requestPort();
            await this.serialPort.open({ baudRate: 115200 });
            this.serialConnected = true;
            this.pulseSensorBtn.disabled = true;
            this.pulseStatusDot.classList.add('connected');
            this.pulseStatusText.textContent = '接続済み';

            // Prepare gain node for on-demand playback (no scheduler)
            if (this.audioCtx) {
                if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();
                this.gainNode = this.audioCtx.createGain();
                this.gainNode.gain.value = this.volume;
                this.gainNode.connect(this.audioCtx.destination);
            }
            this.isPlaying = true; // for ECG scrolling
            this.readPulseSensorData();
        } catch (e) {
            console.error('Pulse sensor connection error:', e);
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
                        if (line.trim() === 'B') this.playBeatFromSensor();
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

    // Triggered on each detected heartbeat from sensor
    playBeatFromSensor() {
        if (!this.audioCtx || !this.gainNode) return;
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

        // Calculate BPM from inter-beat intervals
        const now = performance.now();
        this.beatTimestamps.push(now);
        if (this.beatTimestamps.length > 8) this.beatTimestamps.shift();

        if (this.beatTimestamps.length >= 2) {
            let totalInterval = 0;
            for (let i = 1; i < this.beatTimestamps.length; i++) {
                totalInterval += this.beatTimestamps[i] - this.beatTimestamps[i - 1];
            }
            const avgInterval = totalInterval / (this.beatTimestamps.length - 1);
            const bpm = Math.round(60000 / avgInterval);
            this.bpm = Math.max(30, Math.min(220, bpm));
            this.bpmValue.textContent = this.bpm;
            this.bpmSlider.value = this.bpm;
        }

        this.playHeartbeatSound(this.audioCtx.currentTime);
        this.scheduleBeatVisual(0);
    }

    // ===== USB Serial: Distance Sensor =====
    async connectDistanceSensorUSB() {
        if (!('serial' in navigator)) {
            alert('Web Serial APIがサポートされていません。Chromeをお使いください。');
            return;
        }
        try {
            this.serialPort = await navigator.serial.requestPort();
            await this.serialPort.open({ baudRate: 115200 });
            this.serialConnected = true;
            this.distanceSensorBtn.disabled = true;
            this.distanceStatusDot.classList.add('connected');
            this.distanceStatusText.textContent = '接続済み (USB)';
            this.readDistanceSensorData();
            if (!this.isPlaying) this.start();
            this.startDistanceBpmUpdate();
        } catch (e) {
            console.error('Distance sensor (USB) connection error:', e);
            this.distanceStatusDot.classList.add('error');
            this.distanceStatusText.textContent = '接続失敗';
        }
    }

    async readDistanceSensorData() {
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
                        const t = line.trim();
                        if (t.startsWith('DIST:')) {
                            const raw = parseInt(t.slice(5));
                            if (!isNaN(raw) && raw >= 0) {
                                this.updateDistanceDisplay(raw);
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

    // ===== WebSocket: Distance Sensor (WiFi) =====
    connectDistanceSensorWiFi() {
        const ip = this.wifiIpInput.value.trim() || '192.168.4.1';
        this.distanceStatusText.textContent = '接続中...';
        this.wifiSensorBtn.disabled = true;

        try {
            this.ws = new WebSocket(`ws://${ip}:81`);

            this.ws.onopen = () => {
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
                        this.updateDistanceDisplay(data.distance);
                        this.targetBpm = this.distanceToBpm(this.distance);
                    }
                } catch { /* ignore invalid JSON */ }
            };

            this.ws.onclose = () => {
                this.wsConnected = false;
                this.distanceStatusDot.classList.remove('connected');
                this.distanceStatusDot.classList.add('error');
                this.distanceStatusText.textContent = '切断';
                this.wifiSensorBtn.disabled = false;
            };

            this.ws.onerror = () => {
                this.distanceStatusDot.classList.add('error');
                this.distanceStatusText.textContent = '接続エラー';
                this.wifiSensorBtn.disabled = false;
            };
        } catch (e) {
            console.error('WebSocket error:', e);
            this.distanceStatusDot.classList.add('error');
            this.distanceStatusText.textContent = '接続失敗';
            this.wifiSensorBtn.disabled = false;
        }
    }

    disconnectAll() {
        if (this.bpmTransitionInterval) {
            clearInterval(this.bpmTransitionInterval);
            this.bpmTransitionInterval = null;
        }
        if (this.serialReader) this.serialReader.cancel().catch(() => {});
        if (this.serialPort) {
            this.serialPort.close().catch(() => {});
            this.serialPort = null;
        }
        this.serialConnected = false;

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.wsConnected = false;

        // Reset pulse sensor UI
        this.pulseStatusDot.classList.remove('connected', 'error');
        this.pulseStatusText.textContent = '未接続';
        this.pulseSensorBtn.disabled = false;
        this.beatTimestamps = [];

        // Reset distance sensor UI
        this.distanceStatusDot.classList.remove('connected', 'error');
        this.distanceStatusText.textContent = '未接続';
        this.distanceSensorBtn.disabled = false;
        this.wifiSensorBtn.disabled = false;
        this.realSenseSensorBtn.disabled = false;
    }

    // ===== Beat Visuals =====
    scheduleBeatVisual(delay) {
        setTimeout(() => {
            // Heart icon beat
            this.heartIcon.classList.remove('beat');
            void this.heartIcon.offsetWidth; // force reflow to restart animation
            this.heartIcon.classList.add('beat');

            // Heart glow
            this.heartGlow.classList.remove('active');
            void this.heartGlow.offsetWidth;
            this.heartGlow.classList.add('active');

            // Ring expand
            this.heartRing.classList.remove('active');
            void this.heartRing.offsetWidth;
            this.heartRing.classList.add('active');

            // Background pulse
            this.bgPulse.classList.remove('active');
            void this.bgPulse.offsetWidth;
            this.bgPulse.classList.add('active');
        }, delay * 1000);
    }

    // ===== ECG: Scrolling PQRST Waveform =====
    initECG() {
        // Set canvas resolution to actual display size
        const rect = this.ecgCanvas.getBoundingClientRect();
        this.ecgCanvas.width  = rect.width  || 800;
        this.ecgCanvas.height = rect.height || 80;
        this.ecgW = this.ecgCanvas.width;
        this.ecgH = this.ecgCanvas.height;

        this.ecgData  = new Array(this.ecgW).fill(0);
        this.pqrst    = this.buildPQRST();
        this.ecgPhase = 0;      // 0-1: position within one cardiac cycle
        this.ecgLastTs = null;

        requestAnimationFrame((ts) => this.drawECG(ts));
    }

    // Pre-compute one PQRST cycle (normalized 0-1 amplitude)
    buildPQRST() {
        const n = 512;
        const wave = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const t = i / n;
            if      (t >= 0.00 && t < 0.10) wave[i] =  0.22 * Math.sin(Math.PI * t / 0.10);
            else if (t >= 0.16 && t < 0.18) wave[i] = -0.12 * Math.sin(Math.PI * (t - 0.16) / 0.02);
            else if (t >= 0.18 && t < 0.22) wave[i] =  1.00 * Math.sin(Math.PI * (t - 0.18) / 0.04);
            else if (t >= 0.22 && t < 0.26) wave[i] = -0.30 * Math.sin(Math.PI * (t - 0.22) / 0.04);
            else if (t >= 0.36 && t < 0.56) wave[i] =  0.38 * Math.sin(Math.PI * (t - 0.36) / 0.20);
            // PR segment, ST segment, TP segment: 0 (baseline)
        }
        return wave;
    }

    drawECG(ts) {
        if (this.ecgLastTs === null) this.ecgLastTs = ts;
        const dt = Math.min((ts - this.ecgLastTs) / 1000, 0.05); // cap at 50ms
        this.ecgLastTs = ts;

        // Show ~2 cardiac cycles on screen
        const pixelsPerCycle = this.ecgW / 2;
        const amp = this.ecgH * 0.38;

        if (this.isPlaying) {
            const cyclesPerSec = this.bpm / 60;
            const newPixels = Math.max(1, Math.round(dt * cyclesPerSec * pixelsPerCycle));
            for (let p = 0; p < newPixels; p++) {
                const idx = Math.floor(this.ecgPhase * this.pqrst.length);
                this.ecgData.push(this.pqrst[idx] * amp);
                this.ecgData.shift();
                this.ecgPhase = (this.ecgPhase + 1 / pixelsPerCycle) % 1;
            }
        } else {
            // Flat baseline scroll when not playing
            this.ecgData.push(0);
            this.ecgData.shift();
        }

        const ctx = this.ecgCtx;
        ctx.clearRect(0, 0, this.ecgW, this.ecgH);
        ctx.beginPath();
        ctx.strokeStyle = '#e53e6b';
        ctx.lineWidth = 1.5;
        const mid = this.ecgH / 2;
        ctx.moveTo(0, mid - this.ecgData[0]);
        for (let i = 1; i < this.ecgW; i++) {
            ctx.lineTo(i, mid - this.ecgData[i]);
        }
        ctx.stroke();

        requestAnimationFrame((ts) => this.drawECG(ts));
    }
}

document.addEventListener('DOMContentLoaded', () => new HeartbeatPlayer());
