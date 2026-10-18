# Seismic Core X Dashboard

Dashboard React + ECharts para consumir `ws://.../ws/dashboard`.

## Desarrollo

```bash
npm install
copy .env.example .env
npm run dev
```

Puedes copiar `.env.example` como `.env` para configurar la URL del backend:

```powershell
Copy-Item .env.example .env
```

Por defecto se conecta a `http://localhost:8000` y transforma automáticamente
la URL en `ws://localhost:8000/ws/dashboard`. Si existe un archivo `.env`
local, verifica que no tenga `VITE_API_URL=http://localhost:5173`; ese puerto
es el frontend de Vite y no el backend.

## Render

Configura `VITE_API_URL` con la URL pública del backend, por ejemplo:

```text
VITE_API_URL=https://seismic-core-x-api.onrender.com
```

El frontend usará automáticamente:

```text
wss://seismic-core-x-api.onrender.com/ws/dashboard
```

En Render se despliega como sitio estático, sin Docker. Configura
`VITE_API_URL` en el servicio estático antes del build. El dashboard conserva el
diseño oscuro de Seismic Core X y actualiza las métricas y la gráfica en vivo
cada vez que el backend recibe una muestra.
