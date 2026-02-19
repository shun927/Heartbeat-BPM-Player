// ===== Heartbeat BPM Player =====
// 心音サンプル再生 + Web Serial API でセンサー連携

class HeartbeatPlayer {
    constructor() {
        this.audioCtx = null;
        this.audioBuffer = null;
        this.isPlaying = false;
        this.bpm = 72;
        this.volume = 0.7;
        this.nextBeatTime = 0;
        this.schedulerInterval = null;
        this.gainNode = null;
        this.mode = 'manual'; // 'manual' or 'sensor'

        // Serial
        this.serialPort = null;
        this.serialReader = null;
        this.serialConnected = false;
        this.beatTimestamps = []; // BPM計算用

        // DOM elements
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

        // Mode elements
        this.manualModeBtn = document.getElementById('manualModeBtn');
        this.sensorModeBtn = document.getElementById('sensorModeBtn');
        this.sensorBtn = document.getElementById('sensorBtn');
        this.sensorBtnText = document.getElementById('sensorBtnText');
        this.sensorStatus = document.getElementById('sensorStatus');
        this.statusDot = document.getElementById('statusDot');
        this.statusText = document.getElementById('statusText');

        // Preset buttons
        this.presetBtns = document.querySelectorAll('.preset-btn');

        // Manual mode controls (to hide/show)
        this.sliderContainer = document.querySelector('.slider-container');
        this.presetsContainer = document.querySelector('.presets');

        this.bindEvents();
        this.initECG();
        this.loadAudio();
    }

    // ===== 音源の読み込み =====
    async loadAudio() {
        try {
            const response = await fetch('heartbeat.mp4');
            const arrayBuffer = await response.arrayBuffer();
            this.initAudioContext();
            this.audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
            console.log('心音ファイル読み込み完了:', this.audioBuffer.duration.toFixed(2) + '秒');
        } catch (err) {
            console.error('心音ファイルの読み込みに失敗:', err);
        }
    }

    bindEvents() {
        this.playBtn.addEventListener('click', () => this.toggle());

        this.bpmSlider.addEventListener('input', (e) => {
            this.bpm = parseInt(e.target.value);
            this.bpmValue.textContent = this.bpm;
            this.updatePresetHighlight();
            if (this.isPlaying) {
                this.restartScheduler();
            }
        });

        this.volumeSlider.addEventListener('input', (e) => {
            this.volume = parseInt(e.target.value) / 100;
            if (this.gainNode) {
                this.gainNode.gain.value = this.volume;
            }
        });

        this.presetBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const bpm = parseInt(btn.dataset.bpm);
                this.bpm = bpm;
                this.bpmSlider.value = bpm;
                this.bpmValue.textContent = bpm;
                this.updatePresetHighlight();
                if (this.isPlaying) {
                    this.restartScheduler();
                }
            });
        });

        // Mode toggle
        this.manualModeBtn.addEventListener('click', () => this.setMode('manual'));
        this.sensorModeBtn.addEventListener('click', () => this.setMode('sensor'));

        // Sensor connect
        this.sensorBtn.addEventListener('click', () => this.toggleSerial());

        // Keyboard shortcut
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                if (this.mode === 'manual') {
                    this.toggle();
                }
            }
        });
    }

    updatePresetHighlight() {
        this.presetBtns.forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.bpm) === this.bpm);
        });
    }

    // ===== モード切替 =====
    setMode(mode) {
        // 現在のモードを停止
        if (this.mode === 'manual' && this.isPlaying) {
            this.stop();
        }
        if (this.mode === 'sensor' && this.serialConnected) {
            this.disconnectSerial();
        }

        this.mode = mode;

        // UI切替
        this.manualModeBtn.classList.toggle('active', mode === 'manual');
        this.sensorModeBtn.classList.toggle('active', mode === 'sensor');

        if (mode === 'manual') {
            // 手動モードのUI表示
            this.playBtn.classList.remove('hidden');
            this.sliderContainer.classList.remove('hidden');
            this.presetsContainer.classList.remove('hidden');
            this.sensorBtn.classList.add('hidden');
            this.sensorStatus.classList.add('hidden');
        } else {
            // センサーモードのUI表示
            this.playBtn.classList.add('hidden');
            this.sliderContainer.classList.add('hidden');
            this.presetsContainer.classList.add('hidden');
            this.sensorBtn.classList.remove('hidden');
            this.sensorStatus.classList.remove('hidden');

            // Web Serial API サポートチェック
            if (!('serial' in navigator)) {
                this.statusText.textContent = 'このブラウザはWeb Serial非対応です';
                this.statusDot.className = 'status-dot error';
                this.sensorBtn.disabled = true;
            }
        }
    }

    initAudioContext() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
    }

    // ===== 心音再生 =====
    playHeartbeatSound(time) {
        if (!this.audioBuffer) return;

        const ctx = this.audioCtx;
        const source = ctx.createBufferSource();
        source.buffer = this.audioBuffer;
        source.connect(this.gainNode);
        source.start(time);
    }

    // センサーモード用: 即時再生
    playHeartbeatNow() {
        if (!this.audioBuffer) return;
        this.initAudioContext();

        if (!this.gainNode) {
            this.gainNode = this.audioCtx.createGain();
            this.gainNode.gain.value = this.volume;
            this.gainNode.connect(this.audioCtx.destination);
        }

        const ctx = this.audioCtx;
        const source = ctx.createBufferSource();
        source.buffer = this.audioBuffer;
        source.connect(this.gainNode);
        source.start(0);

        this.triggerBeatVisual();
        this.updateBPMFromSensor();
    }

    // ===== BPM自動計算（センサーモード） =====
    updateBPMFromSensor() {
        const now = performance.now();
        this.beatTimestamps.push(now);

        // 最新10拍分だけ保持
        if (this.beatTimestamps.length > 10) {
            this.beatTimestamps.shift();
        }

        // 最低2拍必要
        if (this.beatTimestamps.length >= 2) {
            const intervals = [];
            for (let i = 1; i < this.beatTimestamps.length; i++) {
                intervals.push(this.beatTimestamps[i] - this.beatTimestamps[i - 1]);
            }
            const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
            const bpm = Math.round(60000 / avgInterval);

            if (bpm >= 30 && bpm <= 220) {
                this.bpm = bpm;
                this.bpmValue.textContent = bpm;
            }
        }
    }

    // ===== Web Serial API =====
    async toggleSerial() {
        if (this.serialConnected) {
            await this.disconnectSerial();
        } else {
            await this.connectSerial();
        }
    }

    async connectSerial() {
        try {
            this.serialPort = await navigator.serial.requestPort();
            await this.serialPort.open({ baudRate: 115200 });

            this.serialConnected = true;
            this.isPlaying = true;
            this.sensorBtnText.textContent = '切断';
            this.statusDot.className = 'status-dot connected';
            this.statusText.textContent = '接続中 - 心拍を待っています...';
            this.beatTimestamps = [];

            this.readSerial();
        } catch (err) {
            console.error('シリアル接続エラー:', err);
            this.statusDot.className = 'status-dot error';
            this.statusText.textContent = '接続失敗: ' + err.message;
        }
    }

    async disconnectSerial() {
        this.serialConnected = false;
        this.isPlaying = false;

        try {
            if (this.serialReader) {
                await this.serialReader.cancel();
                this.serialReader = null;
            }
            if (this.serialPort) {
                await this.serialPort.close();
                this.serialPort = null;
            }
        } catch (err) {
            console.error('シリアル切断エラー:', err);
        }

        this.sensorBtnText.textContent = 'センサー接続';
        this.statusDot.className = 'status-dot';
        this.statusText.textContent = '未接続';

        // Disconnect gain
        if (this.gainNode) {
            this.gainNode.disconnect();
            this.gainNode = null;
        }
    }

    async readSerial() {
        const decoder = new TextDecoderStream();
        const readableStreamClosed = this.serialPort.readable.pipeTo(decoder.writable);
        this.serialReader = decoder.readable.getReader();

        let buffer = '';

        try {
            while (this.serialConnected) {
                const { value, done } = await this.serialReader.read();
                if (done) break;

                buffer += value;
                const lines = buffer.split('\n');
                buffer = lines.pop(); // 未完成の行を残す

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed === 'B') {
                        // 心拍検出!
                        this.playHeartbeatNow();
                        this.statusText.textContent = `接続中 - ${this.bpm} BPM`;
                    }
                }
            }
        } catch (err) {
            if (this.serialConnected) {
                console.error('シリアル読み取りエラー:', err);
                this.statusDot.className = 'status-dot error';
                this.statusText.textContent = '読み取りエラー';
            }
        }
    }

    // ===== スケジューラ（手動モード） =====
    startScheduler() {
        const ctx = this.audioCtx;
        this.nextBeatTime = ctx.currentTime + 0.05;
        const scheduleAheadTime = 0.1;

        this.schedulerInterval = setInterval(() => {
            while (this.nextBeatTime < ctx.currentTime + scheduleAheadTime) {
                this.playHeartbeatSound(this.nextBeatTime);
                this.scheduleBeatVisual(this.nextBeatTime - ctx.currentTime);
                const interval = 60 / this.bpm;
                this.nextBeatTime += interval;
            }
        }, 25);
    }

    restartScheduler() {
        if (this.schedulerInterval) {
            clearInterval(this.schedulerInterval);
        }
        this.startScheduler();
    }

    stopScheduler() {
        if (this.schedulerInterval) {
            clearInterval(this.schedulerInterval);
            this.schedulerInterval = null;
        }
    }

    // ===== ビジュアル =====
    scheduleBeatVisual(delay) {
        const ms = Math.max(0, delay * 1000);
        setTimeout(() => {
            this.triggerBeatVisual();
        }, ms);
    }

    triggerBeatVisual() {
        this.heartIcon.classList.remove('beat');
        void this.heartIcon.offsetWidth;
        this.heartIcon.classList.add('beat');

        this.heartGlow.classList.remove('active');
        void this.heartGlow.offsetWidth;
        this.heartGlow.classList.add('active');

        this.heartRing.classList.remove('active');
        void this.heartRing.offsetWidth;
        this.heartRing.classList.add('active');

        this.bgPulse.classList.remove('active');
        void this.bgPulse.offsetWidth;
        this.bgPulse.classList.add('active');

        this.triggerECGSpike();
    }

    // ===== ECG 描画 =====
    initECG() {
        this.ecgData = [];
        this.ecgPos = 0;
        this.ecgSpikeQueue = [];

        this.resizeECG();
        window.addEventListener('resize', () => this.resizeECG());
        this.drawECG();
    }

    resizeECG() {
        const rect = this.ecgCanvas.getBoundingClientRect();
        this.ecgCanvas.width = rect.width * window.devicePixelRatio;
        this.ecgCanvas.height = rect.height * window.devicePixelRatio;
        this.ecgCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
        this.ecgWidth = rect.width;
        this.ecgHeight = rect.height;
        this.ecgData = new Array(Math.ceil(this.ecgWidth)).fill(0);
    }

    triggerECGSpike() {
        this.ecgSpikeQueue.push(this.ecgPos);
    }

    drawECG() {
        const ctx = this.ecgCtx;
        const w = this.ecgWidth;
        const h = this.ecgHeight;
        const mid = h / 2;

        if (!w || !h) {
            requestAnimationFrame(() => this.drawECG());
            return;
        }

        ctx.clearRect(0, 0, w, h);

        if (this.isPlaying) {
            const speed = 2;
            for (let i = 0; i < speed; i++) {
                let val = 0;
                for (let j = this.ecgSpikeQueue.length - 1; j >= 0; j--) {
                    const spikeStart = this.ecgSpikeQueue[j];
                    const dist = this.ecgPos - spikeStart;
                    if (dist >= 0 && dist < 40) {
                        val += this.ecgWaveform(dist);
                    }
                    if (dist > 60) {
                        this.ecgSpikeQueue.splice(j, 1);
                    }
                }
                this.ecgData[this.ecgPos % this.ecgData.length] = val;
                this.ecgPos++;
            }
        }

        ctx.beginPath();
        ctx.strokeStyle = 'rgba(229, 62, 107, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.lineJoin = 'round';

        const len = this.ecgData.length;
        const startIdx = this.ecgPos % len;

        for (let i = 0; i < len; i++) {
            const dataIdx = (startIdx + i) % len;
            const x = i;
            const y = mid - this.ecgData[dataIdx] * (mid * 0.8);
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();

        const gradient = ctx.createLinearGradient(0, 0, w, 0);
        gradient.addColorStop(0, 'rgba(10, 10, 18, 1)');
        gradient.addColorStop(0.05, 'rgba(10, 10, 18, 0)');
        gradient.addColorStop(0.95, 'rgba(10, 10, 18, 0)');
        gradient.addColorStop(1, 'rgba(10, 10, 18, 1)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);

        requestAnimationFrame(() => this.drawECG());
    }

    ecgWaveform(t) {
        if (t < 4) return 0.05 * Math.sin(t * Math.PI / 4);
        if (t < 6) return 0;
        if (t < 8) return -0.15 * Math.sin((t - 6) * Math.PI / 2);
        if (t < 12) return 1.0 * Math.sin((t - 8) * Math.PI / 4);
        if (t < 14) return -0.2 * Math.sin((t - 12) * Math.PI / 2);
        if (t < 18) return 0;
        if (t < 26) return 0.15 * Math.sin((t - 18) * Math.PI / 8);
        return 0;
    }

    // ===== Toggle (手動モード) =====
    toggle() {
        if (this.isPlaying) {
            this.stop();
        } else {
            this.start();
        }
    }

    start() {
        if (!this.audioBuffer) {
            console.warn('音源がまだ読み込まれていません');
            return;
        }
        this.initAudioContext();

        this.gainNode = this.audioCtx.createGain();
        this.gainNode.gain.value = this.volume;
        this.gainNode.connect(this.audioCtx.destination);

        this.isPlaying = true;
        this.playIcon.classList.add('hidden');
        this.stopIcon.classList.remove('hidden');
        this.playBtn.style.background = 'linear-gradient(135deg, #c62a55, #8a1d3b)';
        this.startScheduler();
    }

    stop() {
        this.isPlaying = false;
        this.playIcon.classList.remove('hidden');
        this.stopIcon.classList.add('hidden');
        this.playBtn.style.background = '';
        this.stopScheduler();

        if (this.gainNode) {
            this.gainNode.disconnect();
            this.gainNode = null;
        }

        this.heartIcon.classList.remove('beat');
        this.heartGlow.classList.remove('active');
        this.heartRing.classList.remove('active');
        this.bgPulse.classList.remove('active');
    }
}

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', () => {
    new HeartbeatPlayer();
});
