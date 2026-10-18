# Firmware ESP32 + MPU6050

Firmware Arduino/PlatformIO para enviar vibración desde un ESP32 al endpoint:

```text
/ws/sensor
```

El firmware mide la aceleración del MPU6050, elimina aproximadamente la
gravedad de reposo y envía una magnitud de vibración en formato JSON.

## Preparar el firmware

1. Instala PlatformIO en VS Code.
2. Abre la carpeta `firmware`.
3. Edita `src/main.cpp`.
4. Completa `WIFI_SSID` y `WIFI_PASSWORD`.
5. Configura el servidor.

Para backend local accesible desde el ESP32:

```cpp
const char* SERVER_HOST = "192.168.1.10";
const uint16_t SERVER_PORT = 8000;
const char* SERVER_PATH = "/ws/sensor";
const bool SERVER_SECURE = false;
```

Usa la IP LAN de la computadora donde corre Docker. No uses
`localhost`, porque para el ESP32 `localhost` es el propio ESP32.

Para Render:

```cpp
const char* SERVER_HOST = "seismic-core-x-api.onrender.com";
const uint16_t SERVER_PORT = 443;
const char* SERVER_PATH = "/ws/sensor";
const bool SERVER_SECURE = true;
```

La conexión segura usa `wss://`. `setInsecure()` permite probar el certificado
sin cargar una CA en el ESP32; para producción estricta conviene validar el
certificado raíz de Render.

## Primera carga por USB

Desde esta carpeta:

```bash
pio run
pio run --target upload
pio device monitor
```

La primera carga debe hacerse por USB porque el ESP32 todavía no tiene el
firmware OTA. Después de cargarlo, abre el monitor y confirma:

```text
WiFi conectado
OTA disponible como: seismic-core-x
```

## Actualizar por OTA

OTA funciona dentro de la misma red local. El computador y el ESP32 deben estar
conectados al mismo Wi-Fi; no se utiliza la URL de Render para subir el
firmware.

Cuando el ESP32 esté encendido y conectado:

```bash
pio run -e esp32ota -t upload
```

Si `.local` no se resuelve en Windows, busca la IP que aparece en el monitor
serial y ejecuta:

```bash
pio run -e esp32ota -t upload --upload-port 192.168.1.50
```

Después de subir la nueva compilación, el ESP32 reinicia y vuelve a conectar el
WebSocket del sensor automáticamente.

La actualización OTA no funciona directamente hacia un ESP32 detrás de una red
doméstica usando Render como intermediario. Para una actualización remota se
necesita un servidor OTA HTTP autenticado y una implementación adicional en el
firmware.

También puedes usar los botones **Build**, **Upload** y **Monitor** de
PlatformIO. Para OTA selecciona el entorno `esp32ota`.

## Mensaje enviado

```json
{
  "value": 0.041,
  "direction": "Z",
  "calibrating": false,
  "sensor": "MPU6050",
  "timestamp_ms": 123456
}
```

El backend recibe `value` y `direction`, aplica su filtro, calcula eventos y
actualiza el radar y las alertas por correo.

## Notas

- El intervalo de muestreo es de 50 ms, aproximadamente 20 muestras por
  segundo.
- `MOVEMENT_THRESHOLD` solo sirve como referencia local; la clasificación
  definitiva la realiza el backend.
- Fija el MPU6050 firmemente a la estructura que deseas monitorear.
- Este firmware es experimental y no constituye un sistema oficial de alerta
  sísmica.
