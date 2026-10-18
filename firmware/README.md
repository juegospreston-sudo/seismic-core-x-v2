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

## Compilar y cargar

Desde esta carpeta:

```bash
pio run
pio run --target upload
pio device monitor
```

También puedes usar los botones **Build**, **Upload** y **Monitor** de
PlatformIO.

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
