/*
 * HC-SR04 距離センサー + XIAO ESP32 S3 (統合版)
 * 
 * USBシリアルとWiFiの両方に対応。WiFiモードにする場合は，GPIO4 (D2) をGNDに接続して起動。
 * 
 * 配線:
 *   HC-SR04 VCC  → 5V
 *   HC-SR04 GND  → GND
 *   HC-SR04 TRIG → GPIO2 (D0)
 *   HC-SR04 ECHO → GPIO3 (D1)
 *   モード切替 (Jumper) → GPIO4 (D2) と GND (任意)
 * 
 * 必要ライブラリ:
 *   - ArduinoWebsockets by Gil Maimon
 */

#include <WiFi.h>
#include <WebSocketsServer.h>

const int MODE_PIN = 2;   // D2 (GPIO2)
const int TRIG_PIN = 22;  // D4 (GPIO22)
const int ECHO_PIN = 23;  // D5 (GPIO23)

bool wifiMode = false;
const char* ssid = "Heartbeat-Distance";
const char* password = "12345678";
WebSocketsServer webSocket = WebSocketsServer(81);

unsigned long lastMeasureTime = 0;
float distanceBuffer[5];
int bufferIndex = 0;
bool bufferFilled = false;

void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
    if (type == WStype_CONNECTED) {
        webSocket.sendTXT(num, "{\"status\":\"connected\"}");
    }
}

void setup() {
    Serial.begin(115200);
    pinMode(MODE_PIN, INPUT_PULLUP);
    delay(100);
    wifiMode = (digitalRead(MODE_PIN) == LOW);
    
    pinMode(TRIG_PIN, OUTPUT);
    pinMode(ECHO_PIN, INPUT);
    digitalWrite(TRIG_PIN, LOW);
    
    if (wifiMode) {
        WiFi.softAP(ssid, password);
        webSocket.begin();
        webSocket.onEvent(webSocketEvent);
        Serial.println("WiFiモード: ws://192.168.4.1:81");
    } else {
        Serial.println("USBシリアルモード");
    }
}

void loop() {
    if (wifiMode) webSocket.loop();
    
    if (millis() - lastMeasureTime >= 100) {
        lastMeasureTime = millis();
        
        float distance = measureDistance();
        if (distance > 0 && distance < 400) {
            float avg = getAverage(distance);
            if (wifiMode && webSocket.connectedClients() > 0) {
                webSocket.broadcastTXT("{\"distance\":" + String((int)avg) + "}");
            } else {
                Serial.print("DIST:"); Serial.println((int)avg);
            }
        }
    }
}

float measureDistance() {
    digitalWrite(TRIG_PIN, LOW); delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);
    long duration = pulseIn(ECHO_PIN, HIGH, 30000);
    return duration == 0 ? -1 : duration * 0.01715;
}

float getAverage(float v) {
    distanceBuffer[bufferIndex] = v;
    bufferIndex = (bufferIndex + 1) % 5;
    if (bufferIndex == 0) bufferFilled = true;
    float sum = 0;
    int count = bufferFilled ? 5 : bufferIndex;
    for (int i = 0; i < count; i++) sum += distanceBuffer[i];
    return sum / count;
}
