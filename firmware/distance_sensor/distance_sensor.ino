/*
 * HC-SR04 距離センサー + XIAO ESP32 S3
 * 
 * 距離を測定してシリアルで送信。距離に応じたBPMで心音を再生する。
 * フォーマット: "DIST:xxx\n" (xxxは距離cm)
 *
 * 配線 (HC-SR04 → XIAO ESP32 S3):
 *   VCC  → 5V
 *   GND  → GND
 *   TRIG → GPIO2 (D0)
 *   ECHO → GPIO3 (D1)
 *
 * 距離→BPMマッピング:
 *   0-10cm   → 140 BPM (激しい運動)
 *   10-30cm  → 100 BPM (運動時)
 *   30-60cm  → 72 BPM  (通常)
 *   60-100cm → 60 BPM  (安静時)
 *   100cm+   → 40 BPM  (最低)
 */

// ピン定義 (XIAO ESP32 S3)
const int TRIG_PIN = 2;   // D0
const int ECHO_PIN = 3;   // D1

// 測定間隔
const unsigned long MEASURE_INTERVAL = 100; // ms
unsigned long lastMeasureTime = 0;

// 移動平均用バッファ
const int BUFFER_SIZE = 5;
float distanceBuffer[BUFFER_SIZE];
int bufferIndex = 0;
bool bufferFilled = false;

void setup() {
  Serial.begin(115200);
  
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  
  digitalWrite(TRIG_PIN, LOW);
  
  // バッファ初期化
  for (int i = 0; i < BUFFER_SIZE; i++) {
    distanceBuffer[i] = 0;
  }
  
  Serial.println("DIST_SENSOR_READY");
}

void loop() {
  unsigned long currentTime = millis();
  
  if (currentTime - lastMeasureTime >= MEASURE_INTERVAL) {
    lastMeasureTime = currentTime;
    
    float distance = measureDistance();
    
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

float measureDistance() {
  // トリガーパス送信
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  
  // エコー受信 (タイムアウト 30ms = 約5m)
  long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  
  if (duration == 0) {
    return -1; // タイムアウト
  }
  
  // 距離計算 (音速 343m/s @ 20°C)
  // distance = duration * 0.0343 / 2
  float distance = duration * 0.01715;
  
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
