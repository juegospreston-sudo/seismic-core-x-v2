import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import { CircleMarker, MapContainer, Marker, TileLayer, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const MAX_SAMPLES = 160;
const SENSOR_LOCATION = [-33.4937, -70.7474];
const initialTelemetry = {
  system_status: "ESPERANDO SENSOR",
  magnitude: 0,
  filtered_signal: 0,
  moving_average: 0,
  level: 1,
  internal_classification: "SIN ACTIVIDAD",
  events: 0,
  relative_intensity: 0,
  communication: "ESPERANDO",
  calibration: "PENDIENTE",
  direction: "--",
  event_peak: 0,
  event_duration: 0,
  last_signal: 0,
  movement_threshold: 0.035,
  sudden_threshold: 0.06,
  sustained_threshold: 0.06,
  sustained_seconds: 3,
  critical_threshold: 0.15,
  samples_received: 0,
  connected_sensors: 0,
};

function websocketUrl() {
  const configured = import.meta.env.VITE_API_URL || "http://localhost:8000";
  if (configured) {
    const url = new URL(configured);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return `${url.origin}/ws/dashboard`;
  }
}

function format(value, digits = 6) {
  return Number(value || 0).toFixed(digits);
}

function App() {
  const [telemetry, setTelemetry] = useState(initialTelemetry);
  const [samples, setSamples] = useState([]);
  const [connected, setConnected] = useState(false);
  const chartRef = useRef(null);
  const radarRef = useRef(null);

  const receiveTelemetry = useCallback((event) => {
    try {
      const next = JSON.parse(event.data);
      if (next.error) return;
      setTelemetry((previous) => ({ ...previous, ...next }));
      setSamples((previous) => [
        ...previous,
        {
          value: Number(next.filtered_signal || 0),
          average: Number(next.moving_average || 0),
        },
      ].slice(-MAX_SAMPLES));
    } catch {
      // Ignore malformed dashboard messages; the backend reports input errors.
    }
  }, []);

  useEffect(() => {
    let socket;
    let retry;
    let stopped = false;

    const connect = () => {
      socket = new WebSocket(websocketUrl());
      socket.addEventListener("open", () => setConnected(true));
      socket.addEventListener("message", receiveTelemetry);
      socket.addEventListener("close", () => {
        setConnected(false);
        if (!stopped) retry = window.setTimeout(connect, 2000);
      });
      socket.addEventListener("error", () => setConnected(false));
    };

    connect();
    return () => {
      stopped = true;
      window.clearTimeout(retry);
      socket?.close();
    };
  }, [receiveTelemetry]);

  useEffect(() => {
    const chart = echarts.init(chartRef.current);
    const resize = () => chart.resize();
    chart.setOption({
      animation: false,
      grid: { left: 36, right: 14, top: 14, bottom: 24 },
      xAxis: {
        type: "category",
        boundaryGap: false,
        axisLabel: { color: "#668391", fontSize: 9 },
        axisLine: { lineStyle: { color: "#1b3949" } },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 0.2,
        axisLabel: { color: "#668391", fontSize: 9 },
        splitLine: { lineStyle: { color: "#123040" } },
      },
      series: [
        {
          type: "line",
          smooth: true,
          showSymbol: false,
          data: [],
          lineStyle: { color: "#64e8ff", width: 2 },
          areaStyle: { color: "rgba(100,232,255,.12)" },
        },
        {
          type: "line",
          smooth: true,
          showSymbol: false,
          data: [],
          lineStyle: { color: "#63f5b0", width: 1, type: "dashed" },
        },
      ],
    });
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, []);

  useEffect(() => {
    const chart = echarts.getInstanceByDom(chartRef.current);
    if (!chart) return;
    chart.setOption({
      xAxis: { data: samples.map((_, index) => index + 1) },
      series: [
        { data: samples.map((sample) => sample.value) },
        { data: samples.map((sample) => sample.average) },
      ],
    });
  }, [samples]);

  useEffect(() => {
    const canvas = radarRef.current;
    const context = canvas.getContext("2d");
    let frame;
    let angle = 0;

    const draw = () => {
      const size = canvas.clientWidth;
      const ratio = window.devicePixelRatio || 1;
      if (canvas.width !== size * ratio) {
        canvas.width = size * ratio;
        canvas.height = size * ratio;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const center = size / 2;
      const radius = size * 0.43;
      context.clearRect(0, 0, size, size);
      context.strokeStyle = "rgba(57,255,155,.28)";
      context.lineWidth = 1;
      for (let ring = 1; ring <= 4; ring += 1) {
        context.beginPath();
        context.arc(center, center, radius * ring / 4, 0, Math.PI * 2);
        context.stroke();
      }
      context.beginPath();
      context.moveTo(center - radius, center);
      context.lineTo(center + radius, center);
      context.moveTo(center, center - radius);
      context.lineTo(center, center + radius);
      context.stroke();

      const sweep = context.createRadialGradient(center, center, 0, center, center, radius);
      sweep.addColorStop(0, "rgba(57,255,155,.02)");
      sweep.addColorStop(1, "rgba(57,255,155,.20)");
      context.beginPath();
      context.moveTo(center, center);
      context.arc(center, center, radius, angle - 0.45, angle);
      context.closePath();
      context.fillStyle = sweep;
      context.fill();
      context.beginPath();
      context.moveTo(center, center);
      context.lineTo(center + Math.cos(angle) * radius, center + Math.sin(angle) * radius);
      context.strokeStyle = "rgba(99,255,180,.95)";
      context.lineWidth = 2;
      context.shadowColor = "#39ff9b";
      context.shadowBlur = 12;
      context.stroke();
      context.shadowBlur = 0;

      if (connected && telemetry.magnitude > 0.001) {
        const intensity = Math.min(telemetry.magnitude / telemetry.critical_threshold, 1);
        const distance = radius * (0.2 + intensity * 0.65);
        const pointX = center + Math.cos(angle * 0.7) * distance;
        const pointY = center + Math.sin(angle * 0.7) * distance;
        const color = telemetry.level >= 4 ? "#ff5874" : telemetry.level === 3 ? "#ffad70" : telemetry.level === 2 ? "#ffd66b" : "#63f5b0";
        context.beginPath();
        context.arc(pointX, pointY, 5 + intensity * 7, 0, Math.PI * 2);
        context.fillStyle = color;
        context.shadowColor = color;
        context.shadowBlur = 20;
        context.fill();
        context.beginPath();
        context.arc(pointX, pointY, 12 + intensity * 10, 0, Math.PI * 2);
        context.strokeStyle = color;
        context.lineWidth = 1.5;
        context.stroke();
        context.shadowBlur = 0;
      }
      angle = (angle + 0.012) % (Math.PI * 2);
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [connected, telemetry.magnitude, telemetry.level, telemetry.critical_threshold]);

  const statusClass = `status level${telemetry.level}${connected ? "" : " offline"}`;
  const intensity = Math.min(100, Math.max(0, telemetry.relative_intensity || 0));
  const sensorText = telemetry.connected_sensors
    ? `${telemetry.connected_sensors} SENSOR${telemetry.connected_sensors > 1 ? "ES" : ""}`
    : "SIN SENSOR";
  const chartLabel = useMemo(
    () => `${samples.length} muestras en ventana`,
    [samples.length],
  );

  return (
    <>
      <header>
        <div>
          <div className="logo">SEISMIC CORE X</div>
          <div className="sub">EL SISTEMA ESTÁ DETECTANDO · TELEMETRÍA EN VIVO</div>
        </div>
        <div className="connection">
          <span className={`dot ${connected ? "online" : "offline-dot"}`} />
          {connected ? "WEBSOCKET CONECTADO" : "REINTENTANDO CONEXIÓN"}
        </div>
      </header>

      <main>
        <div className="grid">
          <section className="panel radar-panel">
            <div className="heading">01 / RADAR DE ACTIVIDAD</div>
            <div className="radar-wrap">
              <MapContainer
                center={SENSOR_LOCATION}
                zoom={15}
                zoomControl={false}
                dragging={false}
                scrollWheelZoom={false}
                doubleClickZoom={false}
                touchZoom={false}
                keyboard={false}
                attributionControl={false}
                className="radar-map"
              >
                <TileLayer
                  attribution="&copy; OpenStreetMap contributors"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  maxZoom={19}
                />
                <CircleMarker
                  center={SENSOR_LOCATION}
                  radius={Math.max(3, Math.min(18, telemetry.magnitude * 100))}
                  pathOptions={{
                    color: telemetry.level >= 4 ? "#ff5874" : telemetry.level === 3 ? "#ffad70" : "#63f5b0",
                    fillColor: telemetry.level >= 4 ? "#ff5874" : telemetry.level === 3 ? "#ffad70" : "#63f5b0",
                    fillOpacity: connected ? 0.85 : 0.25,
                    weight: 2,
                  }}
                  
                >
                  <Tooltip permanent direction="top" offset={[0, -2]} className="street-text-label">
                    PUERTO CÁRDENAS
                  </Tooltip>
                </CircleMarker>
              </MapContainer>
              <canvas ref={radarRef} className="radar-canvas" aria-label="Radar de actividad" />
            </div>
            <div className="radar-label">{sensorText}</div>
            <div className="clock-panel">
              <strong>{new Date().toLocaleTimeString("es-AR", { hour12: false })}</strong>
            </div>
          </section>

          <section className="panel">
            <div className="heading">02 / ESTADO DEL SISTEMA</div>
            <div className={statusClass}>{connected ? telemetry.system_status : "SIN CONEXIÓN"}</div>
            <div className="metrics">
              <Metric label="MAGNITUD" value={format(telemetry.magnitude)} unit="VALOR RECIBIDO" />
              <Metric label="SEÑAL FILTRADA" value={format(telemetry.filtered_signal)} unit="PROMEDIO MÓVIL" />
              <Metric label="NIVEL" value={telemetry.level} unit={telemetry.internal_classification} />
              <Metric label="EVENTOS" value={telemetry.events} unit="CONTADOR DE EVENTOS" />
            </div>
            <InfoRow label="INTENSIDAD RELATIVA" value={`${intensity.toFixed(1)}%`} />
            <div className="bar"><div className="bar-inner" style={{ width: `${intensity}%` }} /></div>
          </section>

          <section className="panel side">
            <div className="heading">03 / TELEMETRÍA</div>
            <InfoRow label="COMUNICACIÓN" value={telemetry.communication} />
            <InfoRow label="CALIBRACIÓN" value={telemetry.calibration} />
            <InfoRow label="DIRECCIÓN" value={telemetry.direction} />
            <InfoRow label="PICO DEL EVENTO" value={format(telemetry.event_peak)} />
            <InfoRow label="DURACIÓN" value={`${Number(telemetry.event_duration || 0).toFixed(2)} s`} />
            <InfoRow label="ÚLTIMA SEÑAL" value={`${Number(telemetry.last_signal || 0).toFixed(1)} s`} />
            <InfoRow label="UMBRAL MOVIMIENTO" value={format(telemetry.movement_threshold, 3)} />
            <InfoRow label="UMBRAL BRUSCO" value={format(telemetry.sudden_threshold, 3)} />
            <InfoRow label="UMBRAL ACTIVIDAD SOSTENIDA" value={`${format(telemetry.sustained_threshold, 3)} / ${telemetry.sustained_seconds} s`} />
            <InfoRow label="UMBRAL CRÍTICO" value={format(telemetry.critical_threshold, 3)} />
            <div className="heading chart-heading">04 / SEÑAL EN VIVO</div>
            <div ref={chartRef} className="history-chart" aria-label="Gráfica de señal en vivo" />
            <InfoRow label="MUESTRAS RECIBIDAS" value={telemetry.samples_received} />
            <InfoRow
              label="CORREO"
              value={telemetry.email_type ? `${telemetry.email_type} · ${telemetry.email_ok === true ? "OK" : telemetry.email_ok === false ? "ERROR" : "PENDIENTE"}` : "SIN ENVÍOS"}
            />
            <div className="chart-caption">{chartLabel}</div>
          </section>
        </div>
        <div className="footer">SEISMIC CORE X · SISTEMA DE MONITOREO SÍSMICO · CANAL {connected ? "ACTIVO" : "DESCONECTADO"}</div>
      </main>
    </>
  );
}

function Metric({ label, value, unit }) {
  return (
    <div className="metric">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      <div className="unit">{unit}</div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return <div className="info-row"><span>{label}</span><span>{value}</span></div>;
}

export default App;
