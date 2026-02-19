// ===== Heartbeat BPM Player =====
// 心音サンプル (heartbeat.mp4) を指定BPMでループ再生する

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

        // Preset buttons
        this.presetBtns = document.querySelectorAll('.preset-btn');

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

        // Keyboard shortcut
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                this.toggle();
            }
        });
    }

    updatePresetHighlight() {
        this.presetBtns.forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.bpm) === this.bpm);
        });
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
    // AudioBufferSourceNode で heartbeat.mp4 を1回再生
    playHeartbeatSound(time) {
        if (!this.audioBuffer) return;

        const ctx = this.audioCtx;
        const source = ctx.createBufferSource();
        source.buffer = this.audioBuffer;
        source.connect(this.gainNode);
        source.start(time);
    }

    // ===== スケジューラ =====
    // 正確なタイミングで心音を再生するための先読みスケジューラ
    startScheduler() {
        const ctx = this.audioCtx;
        this.nextBeatTime = ctx.currentTime + 0.05;
        const scheduleAheadTime = 0.1; // 100ms先まで先読み

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
        // Heart beat animation
        this.heartIcon.classList.remove('beat');
        void this.heartIcon.offsetWidth; // force reflow
        this.heartIcon.classList.add('beat');

        // Glow
        this.heartGlow.classList.remove('active');
        void this.heartGlow.offsetWidth;
        this.heartGlow.classList.add('active');

        // Ring
        this.heartRing.classList.remove('active');
        void this.heartRing.offsetWidth;
        this.heartRing.classList.add('active');

        // Background pulse
        this.bgPulse.classList.remove('active');
        void this.bgPulse.offsetWidth;
        this.bgPulse.classList.add('active');

        // ECG spike
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
            // Generate ECG-like waveform data
            const speed = 2;
            for (let i = 0; i < speed; i++) {
                let val = 0;

                // Check if there's a spike to display
                for (let j = this.ecgSpikeQueue.length - 1; j >= 0; j--) {
                    const spikeStart = this.ecgSpikeQueue[j];
                    const dist = this.ecgPos - spikeStart;
                    if (dist >= 0 && dist < 40) {
                        val += this.ecgWaveform(dist);
                    }
                    // Remove old spikes
                    if (dist > 60) {
                        this.ecgSpikeQueue.splice(j, 1);
                    }
                }

                this.ecgData[this.ecgPos % this.ecgData.length] = val;
                this.ecgPos++;
            }
        }

        // Draw the ECG line
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

        // Fade effect at edges
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
        // Simplified PQRST waveform
        if (t < 4) return 0.05 * Math.sin(t * Math.PI / 4);           // P wave
        if (t < 6) return 0;                                            // PR segment
        if (t < 8) return -0.15 * Math.sin((t - 6) * Math.PI / 2);    // Q wave
        if (t < 12) return 1.0 * Math.sin((t - 8) * Math.PI / 4);     // R wave
        if (t < 14) return -0.2 * Math.sin((t - 12) * Math.PI / 2);   // S wave
        if (t < 18) return 0;                                           // ST segment
        if (t < 26) return 0.15 * Math.sin((t - 18) * Math.PI / 8);   // T wave
        return 0;
    }

    // ===== Toggle =====
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

        // Master gain node
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

        // Disconnect gain
        if (this.gainNode) {
            this.gainNode.disconnect();
            this.gainNode = null;
        }

        // Clear visuals
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
