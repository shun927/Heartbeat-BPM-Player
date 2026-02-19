# Heartbeat BPM Player

指定したBPMで心音を聴けるWebアプリ。心拍センサーとの連携にも対応。

## 機能

### 手動モード
- **心音再生** -- 心音サンプルをBPMに合わせてループ再生
- **BPMスライダー** -- 40-200BPMの範囲でリアルタイム変更
- **プリセット** -- 安静時(60) / 通常(72) / 運動時(100) / 激しい運動(140)
- **音量調整**
- **キーボード操作** -- スペースキーで再生/停止

### センサーモード
- **Web Serial API** でマイコンと接続
- MAX30102/MAX30105 心拍センサーからリアルタイムで心拍を検出
- 心拍検出ごとに心音を再生、BPMを自動計算・表示

### 共通
- **ハートアニメーション** -- 心音に同期してパルス
- **ECG波形表示** -- PQRST波形をリアルタイム描画

## 起動方法

```bash
npx -y serve . -l 3000
```

ブラウザ (Chrome) で http://localhost:3000 を開く。

## センサー接続

### 必要なもの
- ESP32 / Arduino などのマイコン
- MAX30102 または MAX30105 心拍センサー
- USBケーブル

### 配線

| MAX30102 | マイコン |
|----------|---------|
| VIN | 3.3V |
| GND | GND |
| SDA | SDA (ESP32: GPIO21 / Arduino Uno: A4) |
| SCL | SCL (ESP32: GPIO22 / Arduino Uno: A5) |

### ファームウェア書き込み

1. Arduino IDE で SparkFun MAX3010x ライブラリをインストール
2. `firmware/pulse_sensor/pulse_sensor.ino` を開いて書き込み
3. ブラウザで「センサー」モードに切り替え、「センサー接続」をクリック

## ファイル構成

```
Heartbeat-BPM-Player/
├── index.html
├── style.css
├── app.js
├── heartbeat.mp4
├── README.md
└── firmware/
    └── pulse_sensor/
        └── pulse_sensor.ino
```

## 技術スタック

- HTML / CSS / JavaScript（フレームワークなし）
- Web Audio API（AudioBufferSourceNode で音源再生）
- Web Serial API（マイコンとのシリアル通信）
- Canvas API（ECG波形描画）
