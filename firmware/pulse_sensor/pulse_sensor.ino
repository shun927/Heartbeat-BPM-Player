/*
 * MAX30102 心拍検出スケッチ
 * 
 * 心拍を検出するたびにシリアルで "B" を送信する。
 * Web Serial API経由でブラウザアプリと連携。
 *
 * 配線 (I2C):
 *   MAX30102 VIN → 3.3V
 *   MAX30102 GND → GND
 *   MAX30102 SDA → SDA (ESP32: GPIO21 / Arduino Uno: A4)
 *   MAX30102 SCL → SCL (ESP32: GPIO22 / Arduino Uno: A5)
 *   MAX30102 INT → 未接続でOK
 *
 * ライブラリ:
 *   SparkFun MAX3010x Pulse and Proximity Sensor Library
 *   https://github.com/sparkfun/SparkFun_MAX3010x_Sensor_Library
 */

#include <Wire.h>
#include "MAX30105.h"
#include "heartRate.h"

MAX30105 particleSensor;

// 心拍検出用パラメータ
const byte RATE_SIZE = 4;
byte rates[RATE_SIZE];
byte rateSpot = 0;
long lastBeat = 0;
float beatsPerMinute;
int beatAvg;

// 指の検出閾値
const long FINGER_THRESHOLD = 50000;

void setup() {
  Serial.begin(115200);
  Serial.println("MAX30102 心拍センサー 初期化中...");

  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("ERROR: MAX30102が見つかりません。配線を確認してください。");
    while (1);
  }

  // センサー設定
  particleSensor.setup();
  particleSensor.setPulseAmplitudeRed(0x0A);  // 赤LED: 弱め（近接検出用）
  particleSensor.setPulseAmplitudeGreen(0);    // 緑LED: オフ

  Serial.println("準備完了 - 指をセンサーに置いてください");
}

void loop() {
  long irValue = particleSensor.getIR();

  // 指が置かれているか確認
  if (irValue < FINGER_THRESHOLD) {
    return;  // 指なし → スキップ
  }

  // 心拍検出
  if (checkForBeat(irValue)) {
    long delta = millis() - lastBeat;
    lastBeat = millis();

    beatsPerMinute = 60 / (delta / 1000.0);

    // 妥当な範囲のBPMのみ処理 (30-220)
    if (beatsPerMinute > 30 && beatsPerMinute < 220) {
      // ブラウザに心拍を通知
      Serial.println("B");
    }
  }
}
