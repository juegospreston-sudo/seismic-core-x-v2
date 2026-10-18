#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Arduino.h>
#include <ArduinoJson.h>
#include <ArduinoOTA.h>
#include <WebSocketsClient.h>
#include <WiFi.h>
#include <Wire.h>

// Completa estos valores antes de cargar el firmware.
const char* WIFI_SSID = "Canito";
const char* WIFI_PASSWORD = "TU_CONTRASENA_WIFI";

// Desarrollo local: usa ws:// y el puerto LAN de tu equipo.
// Render: usa wss://, el dominio público y el puerto 443.
const char* SERVER_HOST = "192.168.1.10";
const uint16_t SERVER_PORT = 8000;
const char* SERVER_PATH = "/ws/sensor";
const bool SERVER_SECURE = false;

const char* OTA_HOSTNAME = "seismic-core-x";

constexpr uint32_t SAMPLE_INTERVAL_MS = 50;
constexpr float STANDARD_GRAVITY = 9.80665f;
constexpr float MOVEMENT_THRESHOLD = 0.035f;

Adafruit_MPU6050 mpu;
WebSocketsClient webSocket;
uint32_t lastSampleAt = 0;
bool socketConnected = false;

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Conectando a WiFi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.print("WiFi conectado. IP: ");
  Serial.println(WiFi.localIP());
}

void setupOTA() {
  ArduinoOTA.setHostname(OTA_HOSTNAME);
  ArduinoOTA
      .onStart([]() { Serial.println("Iniciando actualización OTA."); })
      .onEnd([]() { Serial.println("\nActualización OTA completada."); })
      .onProgress([](unsigned int progress, unsigned int total) {
        Serial.printf("OTA: %u%%\r", progress * 100 / total);
      })
      .onError([](ota_error_t error) {
        Serial.printf("Error OTA [%u]\n", error);
      });
  ArduinoOTA.begin();
  Serial.print("OTA disponible como: ");
  Serial.println(OTA_HOSTNAME);
}

String directionFor(float x, float y, float z) {
  const float absX = fabsf(x);
  const float absY = fabsf(y);
  const float absZ = fabsf(z);
  if (absX >= absY && absX >= absZ) return "X";
  if (absY >= absX && absY >= absZ) return "Y";
  return "Z";
}

float vibrationMagnitude(float x, float y, float z) {
  // El MPU6050 incluye la gravedad. Se elimina 1 g para que el reposo
  // no genere una alerta permanente.
  const float totalG = sqrtf(x * x + y * y + z * z) / STANDARD_GRAVITY;
  return fabsf(totalG - 1.0f);
}

void sendReading() {
  if (!socketConnected) return;

  sensors_event_t acceleration;
  sensors_event_t gyro;
  sensors_event_t temperature;
  mpu.getEvent(&acceleration, &gyro, &temperature);

  const float x = acceleration.acceleration.x;
  const float y = acceleration.acceleration.y;
  const float z = acceleration.acceleration.z;
  const float magnitude = vibrationMagnitude(x, y, z);

  JsonDocument document;
  document["value"] = magnitude;
  document["direction"] = directionFor(x, y, z);
  document["calibrating"] = false;
  document["sensor"] = "MPU6050";
  document["timestamp_ms"] = millis();

  String message;
  serializeJson(document, message);
  webSocket.sendTXT(message);

  Serial.print("Vibración: ");
  Serial.print(magnitude, 6);
  Serial.print(" | Dirección: ");
  Serial.println(directionFor(x, y, z));
}

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      socketConnected = true;
      Serial.println("WebSocket conectado al backend.");
      break;
    case WStype_DISCONNECTED:
      socketConnected = false;
      Serial.println("WebSocket desconectado; se reintentará automáticamente.");
      break;
    case WStype_ERROR:
      socketConnected = false;
      Serial.println("Error en WebSocket.");
      break;
    default:
      break;
  }
}

void setupWebSocket() {
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
  webSocket.enableHeartbeat(15000, 3000, 2);

  if (SERVER_SECURE) {
    webSocket.beginSSL(SERVER_HOST, SERVER_PORT, SERVER_PATH);
    webSocket.setInsecure();
  } else {
    webSocket.begin(SERVER_HOST, SERVER_PORT, SERVER_PATH);
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);

  Wire.begin();
  if (!mpu.begin()) {
    Serial.println("No se encontró el MPU6050. Revisa VCC, GND, SDA y SCL.");
    while (true) delay(1000);
  }

  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);

  connectWiFi();
  setupOTA();
  setupWebSocket();
}

void loop() {
  ArduinoOTA.handle();
  webSocket.loop();

  if (millis() - lastSampleAt >= SAMPLE_INTERVAL_MS) {
    lastSampleAt = millis();
    sendReading();
  }
}
