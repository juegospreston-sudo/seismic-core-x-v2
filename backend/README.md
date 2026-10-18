# Seismic Core X API

Backend FastAPI para recibir muestras de un ESP32/sensor de vibración y publicar
telemetría en tiempo real para un dashboard.

## Ejecutar

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Docker

Desde la raíz del repositorio puedes iniciar el backend:

```bash
docker compose up --build
```

El backend queda disponible en `http://localhost:8000`. Docker se utiliza
únicamente para este servicio y la misma imagen se despliega en Render mediante
`backend/app/Dockerfile`.

## Desplegar en Render

El repositorio incluye `render.yaml` en la raíz. En Render:

1. Selecciona **New > Blueprint**.
2. Conecta este repositorio.
3. Render detectará el servicio `seismic-core-x-api` y ejecutará la configuración
   automáticamente.

La aplicación escucha en `0.0.0.0` usando la variable `$PORT` de Render y expone
`/health` como health check. La URL de producción tendrá este formato:

```text
https://<nombre-del-servicio>.onrender.com
```

Usa estas URLs desde el frontend o el ESP32:

```text
wss://<nombre-del-servicio>.onrender.com/ws/sensor
wss://<nombre-del-servicio>.onrender.com/ws/dashboard
https://<nombre-del-servicio>.onrender.com/api/telemetry
```

Para conectar el ESP32 desde Internet, debe tener acceso a la red y usar
`wss://`; no uses `ws://localhost` porque `localhost` sería el propio ESP32.

## Protocolos WebSocket

- `ws://localhost:8000/ws/sensor`: conexión del ESP32. Cada mensaje puede ser un
  número o JSON:
  `{"value": 0.041, "direction": "Z"}`
  También acepta `{"x": 0.01, "y": 0.02, "z": 0.04}`.
- `ws://localhost:8000/ws/dashboard`: conexión del frontend. Recibe un JSON con
  cada muestra y los campos del panel (estado, magnitud, señal filtrada,
  promedio móvil, nivel, eventos, umbrales y muestras recibidas).

Ejemplo mínimo para un ESP32 con Arduino:

```cpp
webSocket.begin("192.168.1.10", 8000, "/ws/sensor");
webSocket.sendTXT("{\"value\":0.041,\"direction\":\"Z\"}");
```

La API HTTP `GET /api/telemetry` devuelve el último estado y `GET /health`
permite verificar que el servicio está disponible.
