/*
 * HC-SR04 距離センサー + XIAO ESP32 S3 (WiFiモード)
 * 
 * WebSocketで距離データを送信。ブラウザから接続して距離に応じたBPMで心音を再生。
 * 
 * 接続方法:
 * 1. ESP32がAPモードで起動し、"Heartbeat-Distance"というWiFiネットワークを作成
 * 2. PC/スマホでこのWiFiに接続（パスワード: 12345678）
 * 3. ブラウザで http://192.168.4.1 を開く
 *
 * 配線 (HC-SR04 → XIAO ESP32 S3):
 *   VCC  → 5V
 *   GND  → GND
 *   TRIG → GPIO2 (D0)
 *   ECHO → GPIO3 (D1)
 * 
 * 必要ライブラリ:
 *   - ArduinoWebsockets by Gil Maimon
 *   - WebServer (ESP32標準)
 */

#include <WiFi.h>
#include <WebSocketsServer.h>
#include <WebServer.h>

// WiFi AP設定
const char* ssid = "Heartbeat-Distance";
const char* password = "12345678";

// ピン定義
const int TRIG_PIN = 2;   // D0
const int ECHO_PIN = 3;   // D1

// WebSocketサーバー (ポート81)
WebSocketsServer webSocket = WebSocketsServer(81);
WebServer server(80);

// 測定間隔
const unsigned long MEASURE_INTERVAL = 100; // ms
unsigned long lastMeasureTime = 0;

// 移動平均用バッファ
const int BUFFER_SIZE = 5;
float distanceBuffer[BUFFER_SIZE];
int bufferIndex = 0;
bool bufferFilled = false;

// クライアント接続状態
bool clientConnected = false;

void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
    switch(type) {
        case WStype_DISCONNECTED:
            Serial.printf("[%u] クライアント切断\n", num);
            clientConnected = false;
            break;
        case WStype_CONNECTED:
            {
                IPAddress ip = webSocket.remoteIP(num);
                Serial.printf("[%u] クライアント接続: %d.%d.%d.%d\n", num, ip[0], ip[1], ip[2], ip[3]);
                clientConnected = true;
                webSocket.sendTXT(num, "{\"status\":\"connected\"}");
            }
            break;
    }
}

void setup() {
    Serial.begin(115200);
    
    // ピン設定
    pinMode(TRIG_PIN, OUTPUT);
    pinMode(ECHO_PIN, INPUT);
    digitalWrite(TRIG_PIN, LOW);
    
    // バッファ初期化
    for (int i = 0; i < BUFFER_SIZE; i++) {
        distanceBuffer[i] = 0;
    }
    
    // WiFi APモード起動
    Serial.println("WiFi APモード起動中...");
    WiFi.softAP(ssid, password);
    
    IPAddress IP = WiFi.softAPIP();
    Serial.print("AP IPアドレス: ");
    Serial.println(IP);
    
    // WebSocketサーバー起動
    webSocket.begin();
    webSocket.onEvent(webSocketEvent);
    
    Serial.println("WebSocketサーバー起動: ws://192.168.4.1:81");
}

void loop() {
    webSocket.loop();
    
    unsigned long currentTime = millis();
    
    if (currentTime - lastMeasureTime >= MEASURE_INTERVAL) {
        lastMeasureTime = currentTime;
        
        float distance = measureDistance();
        
        // 有効な距離値の場合のみ処理
        if (distance > 0 && distance < 400) {
            // 移動平均を計算
            float avgDistance = getMovingAverage(distance);
            
            // クライアントが接続されていれば送信
            if (webSocket.connectedClients() > 0) {
                String json = "{\"distance\":" + String((int)avgDistance) + "}";
                webSocket.broadcastTXT(json);
                Serial.println("Distance: " + String((int)avgDistance) + " cm");
            }
        }
    }
}

float measureDistance() {
    // トリガーパルス送信
    digitalWrite(TRIG_PIN, LOW);
    delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);
    
    // エコー受信（タイムアウト 30ms = 給6m）
    long duration = pulseIn(ECHO_PIN, HIGH, 30000);
    
    if (duration == 0) {
        return -1; // タイムアウト
    }
    
    // 距離計算（音速 343m/s @ 20°C）
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
