/*
 * HC-SR04 距離センサー + XIAO ESP32 C6
 * 
 * 距離を測定してシリアルで送信。距離に応じたBPMで心音を再生する。
 * フォーマット: "DIST:xxx\n" (xxxは距離cm)
 *
 * 配線 (HC-SR04 → XIAO ESP32 C6):
 *   VCC  → 5V
 *   GND  → GND
 *   TRIG → D4 (GPIO22)
 *   ECHO → D5 (GPIO23)
 */

// ピン定義 (XIAO ESP32 C6)
const int TRIG_PIN = 22;  // D4 (GPIO22)
const int ECHO_PIN = 23;  // D5 (GPIO23)

// 測定間隔
const unsigned long MEASURE_INTERVAL = 100; // ms
unsigned long lastMeasureTime = 0;

// 移動平均用バッファ
const int BUFFER_SIZE = 5;
float distanceBuffer[BUFFER_SIZE];
int bufferIndex = 0;
bool bufferFilled = false;

// タイムアウト計測用
unsigned long pulseStartTime = 0;
unsigned long pulseEndTime = 0;
bool pulseStarted = false;

void setup() {
  Serial.begin(115200);
  delay(1000); // シリアル起動待ち
  
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  
  digitalWrite(TRIG_PIN, LOW);
  
  // バッファ初期化
  for (int i = 0; i < BUFFER_SIZE; i++) {
    distanceBuffer[i] = 0;
  }
  
  Serial.println("DIST_SENSOR_READY");
  Serial.println("HC-SR04 Distance Sensor Started");
}

void loop() {
  unsigned long currentTime = millis();
  
  if (currentTime - lastMeasureTime >= MEASURE_INTERVAL) {
    lastMeasureTime = currentTime;
    
    float distance = measureDistanceNew();
    
    // 有効な距離値の場合のみ送信
    if (distance > 0 && distance < 400) {
      // 移動平均を計算
      float avgDistance = getMovingAverage(distance);
      
      // 距離を送信 (フォーマット: DIST:xxx)
      Serial.print("DIST:");
      Serial.println((int)avgDistance);
    }
  }
}

// pulseInの代替実装 (ESP32-C6用)
float measureDistanceNew() {
  // トリガーパルス送信
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  
  // エコー待橛と時間計測
  unsigned long timeout = micros() + 30000; // 30msタイムアウト
  
  // エコーがHIGHになるまで待橛
  while (digitalRead(ECHO_PIN) == LOW) {
    if (micros() > timeout) {
      return -1; // タイムアウト
    }
  }
  
  unsigned long startTime = micros();
  timeout = startTime + 30000;
  
  // エコーがLOWになるまで待橛
  while (digitalRead(ECHO_PIN) == HIGH) {
    if (micros() > timeout) {
      return -1; // タイムアウト
    }
  }
  
  unsigned long endTime = micros();
  unsigned long duration = endTime - startTime;
  
  // 距離計算 (cm) - 音速343m/s @ 20°C
  float distance = duration * 0.0343 / 2;
  
  return distance;
}

// 通常のpulseInを使うバージョン（上記が動作しない場合はこちらを試す）
float measureDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  
  // ESP32-C6ではpulseInのタイムアウトを長めに
  long duration = pulseIn(ECHO_PIN, HIGH, 50000); // 50ms
  
  if (duration == 0) {
    return -1;
  }
  
  float distance = duration * 0.0343 / 2;
  return distance;
}

float getMovingAverage(float newValue) {
  distanceBuffer[bufferIndex] = newValue;
  bufferIndex = (bufferIndex + 1) % BUFFER_SIZE;
  
  if (bufferIndex == 0) {
    bufferFilled = true;
  }
  
  float sum = 0;
  int count = bufferFilled ? BUFFER_SIZE : bufferIndex;
  
  for (int i = 0; i < count; i++) {
    sum += distanceBuffer[i];
  }
  
  return sum / count;
}
