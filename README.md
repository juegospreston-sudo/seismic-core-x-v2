# Seismic Core X

Backend para monitorear vibraciones y posibles temblores usando un ESP32. El sistema recibe muestras mediante WebSocket, procesa la señal y envía al dashboard una telemetría como:

- Estado del sistema.
- Magnitud recibida.
- Señal filtrada.
- Promedio móvil.
- Nivel y clasificación interna.
- Contador de eventos.
- Intensidad relativa.
- Pico y duración del evento.
- Última señal recibida.
- Umbrales configurados.
- Cantidad de muestras recibidas.

> Este proyecto sirve como sistema de monitoreo y alerta. La clasificación no
> reemplaza una medición sismológica oficial.

## Arquitectura

```text
ESP32 / sensor
      |
      | WebSocket: /ws/sensor
      v
FastAPI
      |
      +--> Validación de datos
      +--> Filtro y promedio móvil
      +--> Clasificación del movimiento
      +--> Cálculo de telemetría
      |
      | WebSocket: /ws/dashboard
      v
Dashboard web
```

El código está organizado por responsabilidad:

```text
backend/app/
├── main.py                       # Crea FastAPI y registra las rutas
├── core/config.py                # Umbrales y configuración del sistema
├── schemas/telemetry.py          # Validación de entradas y salida de datos
├── services/seismic_service.py   # Procesamiento de señales y estado
└── websocket/
    ├── sensor.py                 # WebSocket que recibe datos del ESP32
    └── dashboard.py              # WebSocket que publica telemetría
```

## Ejecutar localmente

Requisitos:

- Python 3.11 o superior.
- `pip`.

Desde la raíz del repositorio:

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

La API quedará disponible en:

```text
http://localhost:8000
```

Documentación automática de FastAPI:

```text
http://localhost:8000/docs
```

## Endpoints

### Health check

```http
GET /health
```

Respuesta:

```json
{
  "status": "ok"
}
```

### Telemetría actual

```http
GET /api/telemetry
```

Devuelve el último estado procesado por el backend.

## WebSocket del sensor

En desarrollo:

```text
ws://localhost:8000/ws/sensor
```

En Render:

```text
wss://<servicio>.onrender.com/ws/sensor
```

El ESP32 puede enviar una magnitud simple:

```json
{
  "value": 0.041,
  "direction": "Z"
}
```

También puede enviar los tres ejes del acelerómetro. El backend calcula la
magnitud vectorial:

```json
{
  "x": 0.01,
  "y": 0.02,
  "z": 0.04,
  "direction": "XYZ"
}
```

También se aceptan los nombres `magnitude` y `acceleration` en lugar de
`value`.

Ejemplo conceptual con Arduino:

```cpp
webSocket.beginSSL("tu-servicio.onrender.com", 443, "/ws/sensor");
webSocket.sendTXT("{\"value\":0.041,\"direction\":\"Z\"}");
```

La implementación exacta de `beginSSL` depende de la librería WebSocket usada
por el ESP32.

## WebSocket del dashboard

En desarrollo:

```text
ws://localhost:8000/ws/dashboard
```

En Render:

```text
wss://<servicio>.onrender.com/ws/dashboard
```

Al conectarse, el dashboard recibe inmediatamente el estado actual y luego una
actualización cada vez que llega una muestra del sensor.

Ejemplo de respuesta:

```json
{
  "system_status": "ACTIVIDAD DETECTADA",
  "magnitude": 0.041,
  "filtered_signal": 0.035,
  "moving_average": 0.031,
  "level": 2,
  "internal_classification": "MOVIMIENTO",
  "events": 6,
  "relative_intensity": 23.3,
  "communication": "EN LÍNEA",
  "calibration": "COMPLETADA",
  "direction": "Z",
  "event_peak": 0.049,
  "event_duration": 1.2,
  "last_signal": 0.1,
  "movement_threshold": 0.035,
  "sudden_threshold": 0.06,
  "sustained_threshold": 0.06,
  "sustained_seconds": 3.0,
  "critical_threshold": 0.15,
  "samples_received": 3996,
  "connected_sensors": 1
}
```

## Umbrales y clasificación

Los valores están definidos en
[backend/app/core/config.py](backend/app/core/config.py):

| Umbral | Valor | Clasificación |
| --- | ---: | --- |
| Movimiento | `0.035` | Movimiento |
| Movimiento brusco | `0.060` | Movimiento brusco |
| Actividad sostenida | `0.060` durante `3 s` | Actividad sostenida |
| Crítico | `0.150` | Crítico |

Para modificar estos valores, edita `SeismicSettings`. No es necesario cambiar
los WebSockets ni el dashboard.

## Desplegar en Render

El archivo [render.yaml](render.yaml) configura dos servicios:

- `seismic-core-x-api`: servicio Docker FastAPI desde `backend/app/Dockerfile`.
- `seismic-core-x-dashboard`: sitio estático React compilado con Vite.

Pasos:

1. Sube el repositorio a GitHub.
2. En Render selecciona **New > Blueprint**.
3. Conecta el repositorio.
4. Confirma el servicio definido en `render.yaml`.
5. En el servicio del dashboard configura `VITE_API_URL` con la URL HTTPS del
   backend, por ejemplo:

   ```text
   https://seismic-core-x-api.onrender.com
   ```

6. Guarda la variable y espera el nuevo build del dashboard.

Después del despliegue, reemplaza `<servicio>` en estas URLs:

```text
https://<servicio>.onrender.com/health
https://<servicio>.onrender.com/api/telemetry
wss://<servicio>.onrender.com/ws/sensor
wss://<servicio>.onrender.com/ws/dashboard
```

Render proporciona la variable `$PORT`; por eso no se debe fijar manualmente el
puerto en producción.

## Ejecutar el backend con Docker localmente

Requisitos:

- Docker Desktop iniciado.
- Docker Compose incluido en Docker Desktop.

Desde la raíz del repositorio inicia solamente el backend:

```bash
docker compose up --build
```

Backend local:

```text
API:       http://localhost:8000
Health:    http://localhost:8000/health
```

El frontend se ejecuta por separado con Vite:

```bash
cd frontend
npm install
npm run dev
```

Por defecto queda disponible en `http://localhost:5173` y se conecta al backend
Docker en `ws://localhost:8000/ws/dashboard`.

Para detener los contenedores:

```bash
docker compose down
```

Docker se utiliza únicamente para el backend. El frontend se compila como sitio
estático en Render y se ejecuta con Vite durante el desarrollo local.

## Consideraciones de producción

- Usa `wss://`, no `ws://`, cuando el backend esté en Render.
- El ESP32 debe tener acceso a Internet.
- `localhost` siempre se refiere al dispositivo que realiza la conexión.
- El estado actual está en memoria y se reinicia cuando Render reinicia el
  servicio.
- Para guardar históricos, eventos y gráficas se debe agregar una base de datos.
- Un plan gratuito puede suspenderse cuando no recibe tráfico; para monitoreo
  permanente se recomienda un servicio activo.
