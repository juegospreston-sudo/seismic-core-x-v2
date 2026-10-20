
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import { CircleMarker, MapContainer, TileLayer } from "react-leaflet";
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
  const configured =
    import.meta.env.VITE_API_URL || "http://localhost:8000";

  const url = new URL(configured);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

  return `${url.origin}/ws/dashboard`;
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
  const radarStateRef = useRef({ connected, telemetry });

  useEffect(() => {
    radarStateRef.current = { connected, telemetry };
  }, [connected, telemetry]);

  const receiveTelemetry = useCallback((event) => {
    try {
      const next = JSON.parse(event.data);
      if (next.error) return;

      setTelemetry((previous) => ({ ...previous, ...next }));

      setSamples((previous) =>
        [
          ...previous,
          {
            value: Number(next.filtered_signal || 0),
            average: Number(next.moving_average || 0),
          },
        ].slice(-MAX_SAMPLES)
      );
    } catch {
      // Ignora mensajes incorrectos.
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

        if (!stopped) {
          retry = window.setTimeout(connect, 2000);
        }
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
    if (!chartRef.current) return;

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
          lineStyle: {
            color: "#63f5b0",
            width: 1,
            type: "dashed",
          },
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
    const chart = chartRef.current
      ? echarts.getInstanceByDom(chartRef.current)
      : null;

    if (!chart) return;

    chart.setOption({
      xAxis: { data: samples.map((_, index) => index + 1) },
      series: [
        { data: samples.map((sample) => sample.value) },
        { data: samples.map((sample) => sample.average) },
      ],
    });
  }, [samples]);

  // RADAR: ondas lentas como las que produce una gota de agua.
  // El mapa permanece visible debajo de la animación.
  useEffect(() => {
    const canvas = radarRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let frame;
    let width = 0;
    let height = 0;
    let ratio = 1;

    const startTime = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();

      if (!rect.width || !rect.height) return;

      width = rect.width;
      height = rect.height;
      ratio = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);

      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const draw = (now) => {
      context.clearRect(0, 0, width, height);

      const { connected: isConnected, telemetry: data } =
        radarStateRef.current;

      const magnitude = Math.max(
        Number(data.magnitude) || 0,
        Number(data.filtered_signal) || 0
      );

      const level = Number(data.level) || 0;
      const movementThreshold =
        Number(data.movement_threshold) || 0.035;
      const criticalThreshold =
        Number(data.critical_threshold) || 0.15;

      // Color de las ondas según la actividad detectada.
      let color = "#39ff78";

      if (level >= 4 || magnitude >= criticalThreshold) {
        color = "#ff3030";
      } else if (level >= 3) {
        color = "#ff8c32";
      } else if (
        level >= 2 ||
        magnitude >= movementThreshold
      ) {
        color = "#ffe34a";
      }

      const moving =
        isConnected &&
        (level >= 2 || magnitude >= movementThreshold);

      const centerX = width / 2;
      const centerY = height / 2;
      const maxRadius = Math.max(
        8,
        Math.min(width, height) * 0.46
      );

      // Velocidad reducida para un movimiento suave y lento.
      // Una vuelta completa de cada onda tarda aproximadamente
      // 6 segundos con movimiento y 15 segundos en estado estable.
      const speed = moving ? 0.16 : 0.065;
      const cycle = ((now - startTime) / 1000) * speed;

      // Círculos de referencia discretos.
      context.save();
      context.strokeStyle = "rgba(57,255,155,0.18)";
      context.lineWidth = 1;

      for (let ring = 1; ring <= 4; ring += 1) {
        context.beginPath();
        context.arc(
          centerX,
          centerY,
          (maxRadius * ring) / 4,
          0,
          Math.PI * 2
        );
        context.stroke();
      }

      context.restore();

      // Tres ondas que nacen en el centro y se abren lentamente.
      for (let i = 0; i < 3; i += 1) {
        const phase = (cycle + i / 3) % 1;
        const radius = 3 + phase * maxRadius;
        const opacity = (1 - phase) * (moving ? 0.85 : 0.32);

        context.save();
        context.beginPath();
        context.arc(
          centerX,
          centerY,
          radius,
          0,
          Math.PI * 2
        );

        context.strokeStyle = color;
        context.globalAlpha = opacity;
        context.lineWidth = moving ? 2 : 1.4;
        context.shadowColor = color;
        context.shadowBlur = moving ? 12 : 5;
        context.stroke();
        context.restore();
      }

      // Punto central que representa el origen de la onda.
      context.save();

      context.beginPath();
      context.arc(centerX, centerY, 3, 0, Math.PI * 2);
      context.fillStyle = color;
      context.shadowColor = color;
      context.shadowBlur = 12;
      context.fill();

      context.restore();

      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      context.clearRect(0, 0, width, height);
    };
  }, []);

  const statusClass = `status level${telemetry.level}${
    connected ? "" : " offline"
  }`;

  const intensity = Math.min(
    100,
    Math.max(0, telemetry.relative_intensity || 0)
  );

  const sensorText = telemetry.connected_sensors
    ? `${telemetry.connected_sensors} SENSOR${
        telemetry.connected_sensors > 1 ? "ES" : ""
      }`
    : "SIN SENSOR";

  const chartLabel = useMemo(
    () => `${samples.length} muestras en ventana`,
    [samples.length]
  );

  return (
    <>
      <header>
        <div>
          <div className="logo">SEISMIC CORE X</div>
          <div className="sub">
            EL SISTEMA ESTÁ DETECTANDO · TELEMETRÍA EN VIVO
          </div>
        </div>

        <div className="connection">
          <span
            className={`dot ${
              connected ? "online" : "offline-dot"
            }`}
          />
          {connected
            ? "WEBSOCKET CONECTADO"
            : "REINTENTANDO CONEXIÓN"}
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
                  radius={Math.max(
                    3,
                    Math.min(18, telemetry.magnitude * 100)
                  )}
                  pathOptions={{
                    color:
                      telemetry.level >= 4
                        ? "#ff3030"
                        : telemetry.level >= 3
                        ? "#ff8c32"
                        : telemetry.level >= 2
                        ? "#ffe34a"
                        : "#39ff78",
                    fillColor:
                      telemetry.level >= 4
                        ? "#ff3030"
                        : telemetry.level >= 3
                        ? "#ff8c32"
                        : telemetry.level >= 2
                        ? "#ffe34a"
                        : "#39ff78",
                    fillOpacity: connected ? 0.85 : 0.25,
                    weight: 2,
                  }}
                />
              </MapContainer>

              <canvas
                ref={radarRef}
                className="radar-canvas"
                aria-label="Ondas de actividad sísmica"
              />
            </div>

            <div className="radar-label">{sensorText}</div>

            <div className="clock-panel">
              <strong>
                {new Date().toLocaleTimeString("es-AR", {
                  hour12: false,
                })}
              </strong>
            </div>
          </section>

          <section className="panel">
            <div className="heading">02 / ESTADO DEL SISTEMA</div>

            <div className={statusClass}>
              {connected
                ? telemetry.system_status
                : "SIN CONEXIÓN"}
            </div>

            <div className="metrics">
              <Metric
                label="MAGNITUD"
                value={format(telemetry.magnitude)}
                unit="VALOR RECIBIDO"
              />
              <Metric
                label="SEÑAL FILTRADA"
                value={format(telemetry.filtered_signal)}
                unit="PROMEDIO MÓVIL"
              />
              <Metric
                label="NIVEL"
                value={telemetry.level}
                unit={telemetry.internal_classification}
              />
              <Metric
                label="EVENTOS"
                value={telemetry.events}
                unit="CONTADOR DE EVENTOS"
              />
            </div>

            <InfoRow
              label="INTENSIDAD RELATIVA"
              value={`${intensity.toFixed(1)}%`}
            />

            <div className="bar">
              <div
                className="bar-inner"
                style={{ width: `${intensity}%` }}
              />
            </div>
          </section>

          <section className="panel side">
            <div className="heading">03 / TELEMETRÍA</div>

            <InfoRow
              label="COMUNICACIÓN"
              value={telemetry.communication}
            />
            <InfoRow
              label="CALIBRACIÓN"
              value={telemetry.calibration}
            />
            <InfoRow label="DIRECCIÓN" value={telemetry.direction} />
            <InfoRow
              label="PICO DEL EVENTO"
              value={format(telemetry.event_peak)}
            />
            <InfoRow
              label="DURACIÓN"
              value={`${Number(
                telemetry.event_duration || 0
              ).toFixed(2)} s`}
            />
            <InfoRow
              label="ÚLTIMA SEÑAL"
              value={`${Number(
                telemetry.last_signal || 0
              ).toFixed(1)} s`}
            />
            <InfoRow
              label="UMBRAL MOVIMIENTO"
              value={format(telemetry.movement_threshold, 3)}
            />
            <InfoRow
              label="UMBRAL BRUSCO"
              value={format(telemetry.sudden_threshold, 3)}
            />
            <InfoRow
              label="UMBRAL ACTIVIDAD SOSTENIDA"
              value={`${format(
                telemetry.sustained_threshold,
                3
              )} / ${telemetry.sustained_seconds} s`}
            />
            <InfoRow
              label="UMBRAL CRÍTICO"
              value={format(telemetry.critical_threshold, 3)}
            />

            <div className="heading chart-heading">
              04 / SEÑAL EN VIVO
            </div>

            <div
              ref={chartRef}
              className="history-chart"
              aria-label="Gráfica de señal en vivo"
            />

            <InfoRow
              label="MUESTRAS RECIBIDAS"
              value={telemetry.samples_received}
            />

            <InfoRow
              label="CORREO"
              value={
                telemetry.email_type
                  ? `${telemetry.email_type} · ${
                      telemetry.email_ok === true
                        ? "OK"
                        : telemetry.email_ok === false
                        ? "ERROR"
                        : "PENDIENTE"
                    }`
                  : "SIN ENVÍOS"
              }
            />

            <div className="chart-caption">{chartLabel}</div>
          </section>
        </div>

        <div className="footer">
          SEISMIC CORE X · SISTEMA DE MONITOREO SÍSMICO · CANAL{" "}
          {connected ? "ACTIVO" : "DESCONECTADO"}
        </div>
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
  return (
    <div className="info-row">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export default App;
