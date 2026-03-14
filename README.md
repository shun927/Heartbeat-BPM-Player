# Heartbeat BPM Player

指定したBPMで心音を聴けるWebアプリ。心拍センサー、距離センサー（USB/WiFi）との連携に対応。

## 機能

### 手動モード
- **心音再生** -- 心音サンプルをBPMに合わせてループ再生
- **BPMスライダー** -- 40-200BPMの範囲でリアルタイム変更
- **プリセット** -- 安静時(60) / 通常(72) / 運動時(100) / 激しい運動(140)
- **音量調整**
- **キーボード操作** -- スペースキーで再生/停止

### 心拍センサーモード
- **Web Serial API** でマイコンと接続
- MAX30102/MAX30105 心拍センサーからリアルタイムで心拍を検出
- 心拍検出ごとに心音を再生、BPMを自動計算・表示

### 距離センサーモード
XIAO ESP32 S3 + HC-SR04 で距離を測定し、距離に応じたBPMで自動再生。

**接続方式（選択可能）**:
- **USB**: Web Serial API経由でUSB接続
- **WiFi**: WebSocket経由で無線接続（ESP32がAPモード）

**距離→BPMマッピング**:
- 0-10cm: 140 BPM (激しい運動)
- 10-30cm: 100 BPM (運動時)
- 30-60cm: 72 BPM (通常)
- 60-100cm: 60 BPM (安静時)
- 100cm+: 40 BPM (最低)

### 共通
- **ハートアニメーション** -- 心音に同期してパルス
- **ECG波形表示** -- PQRST波形をリアルタイム描画

## 起動方法

```bash
npx -y serve . -l 3000
```

ブラウザ (Chrome) で http://localhost:3000 を開く。

---

## センサー接続

### 1. 心拍センサー (MAX30102)

#### 必要なもの
- ESP32 / Arduino などのマイコン
- MAX30102 または MAX30105 心拍センサー
- USBケーブル

#### 配線

| MAX30102 | マイコン |
|----------|---------|
| VIN | 3.3V |
| GND | GND |
| SDA | SDA (ESP32: GPIO21 / Arduino Uno: A4) |
| SCL | SCL (ESP32: GPIO22 / Arduino Uno: A5) |

#### ファームウェア書き込み

1. Arduino IDE で SparkFun MAX3010x ライブラリをインストール
2. `firmware/pulse_sensor/pulse_sensor.ino` を開いて書き込み
3. ブラウザで「心拍センサー」モードに切り替え、「心拍センサー接続」をクリック

---

### 2. 距離センサー (HC-SR04 + XIAO ESP32 C6)

#### 必要なもの
- XIAO ESP32 C6
- HC-SR04 超音波距離センサー
- USBケーブル (USB-C) - 書き込み用

#### 配線

| HC-SR04 | XIAO ESP32 C6 |
|---------|---------------|
| VCC | 5V |
| GND | GND |
| TRIG | D0 (GPIO0) |
| ECHO | D1 (GPIO1) |

---

#### A. USB接続モード

1. `firmware/distance_sensor/distance_sensor.ino` をXIAO ESP32 S3に書き込み
2. USBケーブルでPCと接続
3. ブラウザで「距離センサー」モードを選択
4. USBタブを選択し「距離センサー接続 (USB)」をクリック

---

#### B. WiFi接続モード（無線）

##### 必要ライブラリ
Arduino IDE で以下をインストール:
- **ArduinoWebsockets** by Gil Maimon

##### ファームウェア書き込み

1. `firmware/distance_sensor_wifi/distance_sensor_wifi.ino` を開く
2. 必要に応じてWiFi設定を変更（デフォルト: APモード）
3. XIAO ESP32 S3に書き込み
4. 書き込み後、ESP32は自動的にWiFiアクセスポイントを起動

##### 接続手順

1. **WiFi接続**: PCまたはスマホのWiFi設定から、「**Heartbeat-Distance**」を選択
   - パスワード: `12345678`
2. **ブラウザでアプリを開く**: http://localhost:3000 （USB接続時と同じ）
3. **モード選択**: 「距離センサー」モードを選択
4. **WiFiタブを選択**: USBからWiFiに切り替え
5. **接続ボタンをクリック**: 「距離センサー接続 (WiFi)」をクリック
   - デフォルトIP: `192.168.4.1`

> **注意**: WiFi接続中はインターネット接続が切れるため、localhostではなく、同じPC上で起動したサーバーにアクセスする必要があります。
>
> 代替方案:
> - `file://` プロトコルで直接HTMLを開く（テスト用）
> - スマホでWiFiに接続して同じアドレスでアクセス

---

## ファイル構成

```
Heartbeat-BPM-Player/
├── index.html
├── style.css
├── app.js
├── heartbeat-2_front.mp3
├── heartbeat-2_back.mp3
├── README.md
└── firmware/
    ├── pulse_sensor/
    │   └── pulse_sensor.ino       # MAX30102 心拍センサー (USB)
    ├── distance_sensor/
    │   └── distance_sensor.ino    # HC-SR04 距離センサー (USB)
    └── distance_sensor_wifi/
        └── distance_sensor_wifi.ino  # HC-SR04 距離センサー (WiFi)
```

## 技術スタック

- HTML / CSS / JavaScript（フレームワークなし）
- Web Audio API（AudioBufferSourceNode で音源再生）
- Web Serial API（USBマイコン連携）
- WebSocket API（WiFiマイコン連携）
- Canvas API（ECG波形描画）
