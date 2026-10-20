import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";

const MAX_SAMPLES = 160;
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
  const radarDataRef = useRef({ connected: false, magnitude: 0, filtered_signal: 0, level: 1, movement_threshold: 0.035, critical_threshold: 0.15 });

  useEffect(() => {
    radarDataRef.current = {
      connected,
      magnitude: Number(telemetry.magnitude || 0),
      filtered_signal: Number(telemetry.filtered_signal || 0),
      level: Number(telemetry.level || 1),
      movement_threshold: Number(telemetry.movement_threshold || 0.035),
      critical_threshold: Number(telemetry.critical_threshold || 0.15),
    };
  }, [connected, telemetry.magnitude, telemetry.filtered_signal, telemetry.level, telemetry.movement_threshold, telemetry.critical_threshold]);

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
    if (!canvas) return undefined;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    let frame;
    let angle = 0;
    let pulse = 0;

    const draw = () => {
      const size = Math.max(1, canvas.clientWidth || 320);
      const height = Math.max(1, canvas.clientHeight || size);
      const ratio = window.devicePixelRatio || 1;
      if (canvas.width !== size * ratio || canvas.height !== height * ratio) {
        canvas.width = size * ratio;
        canvas.height = height * ratio;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, size, height);

      const centerX = size / 2;
      const centerY = height / 2;
      const radius = Math.min(size, height) * 0.43;
      const data = radarDataRef.current;
      const signal = Math.max(data.magnitude, data.filtered_signal);
      const moving = data.connected && (data.level >= 2 || signal >= data.movement_threshold);
      const color = !data.connected ? "#49636a"
        : data.level >= 4 || signal >= data.critical_threshold ? "#ff4d67"
        : data.level === 3 ? "#ff963d"
        : moving || data.level === 2 ? "#ffd447"
        : "#39ff9b";
      const intensity = Math.max(0, Math.min(1, signal / Math.max(data.critical_threshold, 0.001)));

      // Fondo oscuro y esfera luminosa
      const background = context.createRadialGradient(centerX, centerY, radius * 0.05, centerX, centerY, radius * 1.2);
      background.addColorStop(0, moving ? "rgba(255,212,71,0.11)" : "rgba(57,255,155,0.10)");
      background.addColorStop(0.72, "rgba(3,20,24,0.96)");
      background.addColorStop(1, "rgba(1,8,12,0.99)");
      context.fillStyle = background;
      context.fillRect(0, 0, size, height);

      // Halo exterior de la esfera
      context.save();
      context.shadowColor = color;
      context.shadowBlur = moving ? 24 : 15;
      context.strokeStyle = color;
      context.globalAlpha = data.connected ? 0.72 : 0.25;
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.stroke();
      context.restore();

      // Esfera 3D con gradiente radial
      const sphere = context.createRadialGradient(
        centerX - radius * 0.32, centerY - radius * 0.36, radius * 0.04,
        centerX, centerY, radius
      );
      sphere.addColorStop(0, moving ? "rgba(255,245,173,0.30)" : "rgba(180,255,219,0.25)");
      sphere.addColorStop(0.35, moving ? "rgba(181,151,28,0.22)" : "rgba(18,145,85,0.23)");
      sphere.addColorStop(0.78, "rgba(3,44,37,0.72)");
      sphere.addColorStop(1, "rgba(0,8,13,0.97)");
      context.fillStyle = sphere;
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.fill();

      // Anillos concéntricos de la esfera
      context.save();
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.clip();
      context.strokeStyle = color;
      context.lineWidth = 1;
      for (let ring = 1; ring <= 4; ring += 1) {
        context.globalAlpha = 0.13 + ring * 0.035;
        context.beginPath();
        context.arc(centerX, centerY, radius * ring / 4, 0, Math.PI * 2);
        context.stroke();
      }
      // Meridianos para dar apariencia esférica
      context.globalAlpha = 0.22;
      for (const squash of [0.32, 0.62]) {
        context.beginPath();
        context.ellipse(centerX, centerY, radius * squash, radius, angle * 0.12, 0, Math.PI * 2);
        context.stroke();
      }
      context.beginPath();
      context.ellipse(centerX, centerY, radius, radius * 0.34, 0, 0, Math.PI * 2);
      context.stroke();
      context.restore();

      // Barrido radar suave
      const sweep = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
      sweep.addColorStop(0, `${color}00`);
      sweep.addColorStop(1, data.connected ? "rgba(57,255,155,0.10)" : "rgba(90,120,130,0.04)");
      context.fillStyle = sweep;
      context.beginPath();
      context.moveTo(centerX, centerY);
      context.arc(centerX, centerY, radius, angle - 0.55, angle);
      context.closePath();
      context.fill();
      context.strokeStyle = color;
      context.globalAlpha = 0.75;
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(centerX, centerY);
      context.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
      context.stroke();
      context.globalAlpha = 1;

      // Cuando hay movimiento real, nacen ondas pequeñas en el centro y crecen
      if (moving) {
        pulse = (pulse + 0.012 + intensity * 0.018) % 1;
        for (let wave = 0; wave < 3; wave += 1) {
          const phase = (pulse + wave / 3) % 1;
          const waveRadius = radius * (0.06 + phase * 0.88);
          context.beginPath();
          context.arc(centerX, centerY, waveRadius, 0, Math.PI * 2);
          context.strokeStyle = color;
          context.lineWidth = 1.2 + intensity * 1.8;
          context.globalAlpha = (1 - phase) * (0.35 + intensity * 0.65);
          context.shadowColor = color;
          context.shadowBlur = 10 + intensity * 18;
          context.stroke();
        }
        context.globalAlpha = 1;
        context.shadowBlur = 0;
        // Núcleo central: se ilumina con la señal
        context.beginPath();
        context.arc(centerX, centerY, 3 + intensity * 7, 0, Math.PI * 2);
        context.fillStyle = color;
        context.shadowColor = color;
        context.shadowBlur = 16 + intensity * 20;
        context.fill();
        context.shadowBlur = 0;
      } else {
        // Pulso lento en verde cuando está estable
        const breathing = 0.5 + 0.5 * Math.sin(angle * 1.4);
        context.beginPath();
        context.arc(centerX, centerY, 3 + breathing * 2, 0, Math.PI * 2);
        context.fillStyle = color;
        context.globalAlpha = data.connected ? 0.45 + breathing * 0.45 : 0.25;
        context.fill();
        context.globalAlpha = 1;
      }

      angle = (angle + (moving ? 0.018 : 0.008)) % (Math.PI * 2);
      frame = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(frame);
  }, []);

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
              <canvas
                ref={radarRef}
                className="radar-canvas"
                aria-label="Esfera sísmica animada: verde estable, amarillo en movimiento, naranja intenso y rojo crítico"
                role="img"
              />
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
