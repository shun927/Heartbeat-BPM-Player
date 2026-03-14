/*
 * HC-SR04 距離センサー + XIAO ESP32 C6
 *
 * 距離を測定してシリアルで送信。距離に応じたBPMで心音を再生する。
 * フォーマット: "DIST:xxx\n" (xxxは距離cm)
 *
 * 配線 (HC-SR04 → XIAO ESP32 C6):
 *   VCC  → 5V
 *   GND  → GND
 *   TRIG → D0 (GPIO0)
 *   ECHO → D1 (GPIO1)
 */

// ピン定義 (XIAO ESP32 C6)
const int TRIG_PIN = 0;  // D0 (GPIO0)
const int ECHO_PIN = 1;  // D1 (GPIO1)

// 測定間隔
const unsigned long MEASURE_INTERVAL = 100; // ms
unsigned long lastMeasureTime = 0;

// 中央値フィルタ用バッファ (奇数推奨)
const int BUFFER_SIZE = 7;
float distanceBuffer[BUFFER_SIZE];
int bufferIndex = 0;
bool bufferFilled = false;

// 外れ値除去用
float lastValidDistance = -1;
const float MAX_CHANGE = 30.0; // 前回から30cm以上変化したら外れ値とみなす

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  digitalWrite(TRIG_PIN, LOW);

  for (int i = 0; i < BUFFER_SIZE; i++) {
    distanceBuffer[i] = 0;
  }

  Serial.println("DIST_SENSOR_READY");
  Serial.println("HC-SR04 Distance Sensor Started (XIAO ESP32 C6)");
}

void loop() {
  unsigned long currentTime = millis();

  if (currentTime - lastMeasureTime < MEASURE_INTERVAL) return;
  lastMeasureTime = currentTime;

  float distance = measureDistance();

  if (distance <= 0 || distance >= 400) return;

  // 外れ値除去: 前回値から大きく外れた場合はスキップ
  if (lastValidDistance > 0 && abs(distance - lastValidDistance) > MAX_CHANGE) return;
  lastValidDistance = distance;

  // バッファに追加
  distanceBuffer[bufferIndex] = distance;
  bufferIndex = (bufferIndex + 1) % BUFFER_SIZE;
  if (bufferIndex == 0) bufferFilled = true;

  int count = bufferFilled ? BUFFER_SIZE : bufferIndex;
  float filtered = getMedian(distanceBuffer, count);

  Serial.print("DIST:");
  Serial.println((int)filtered);
}

float measureDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  unsigned long timeout = micros() + 30000; // 30ms タイムアウト

  while (digitalRead(ECHO_PIN) == LOW) {
    if (micros() > timeout) return -1;
  }

  unsigned long startTime = micros();
  timeout = startTime + 30000;

  while (digitalRead(ECHO_PIN) == HIGH) {
    if (micros() > timeout) return -1;
  }

  unsigned long duration = micros() - startTime;
  // 音速 343m/s @ 20°C
  return duration * 0.0343 / 2;
}

// 中央値フィルタ (バブルソート)
float getMedian(float* arr, int size) {
  float sorted[BUFFER_SIZE];
  memcpy(sorted, arr, size * sizeof(float));

  for (int i = 0; i < size - 1; i++) {
    for (int j = 0; j < size - 1 - i; j++) {
      if (sorted[j] > sorted[j + 1]) {
        float tmp = sorted[j];
        sorted[j] = sorted[j + 1];
        sorted[j + 1] = tmp;
      }
    }
  }

  return sorted[size / 2];
}
