from __future__ import annotations

import html
import json
import os
import threading
import urllib.error
import urllib.request
from datetime import datetime
from typing import Any

from app.core.config import SeismicSettings, settings


class EmailAlertService:
    """Sends alert emails through Brevo without blocking sensor processing."""

    def __init__(self, configuration: SeismicSettings = settings) -> None:
        self.settings = configuration
        self._lock = threading.Lock()
        self._last_status: dict[str, Any] = {
            "type": None,
            "ok": None,
            "detail": "Aún no se ha enviado ninguna alerta",
            "time": None,
        }

    def status(self) -> dict[str, Any]:
        with self._lock:
            return {
                **self._last_status,
                "recipients": len(self.settings.alert_recipients),
            }

    def send_async(
        self,
        alert_type: str,
        subject: str,
        magnitude: float,
        filtered_signal: float,
        duration: float,
        state: str,
    ) -> None:
        self._set_status(alert_type, None, "Enviando alerta")
        thread = threading.Thread(
            target=self._send,
            args=(
                alert_type,
                subject,
                magnitude,
                filtered_signal,
                duration,
                state,
            ),
            daemon=True,
        )
        thread.start()

    def _send(
        self,
        alert_type: str,
        subject: str,
        magnitude: float,
        filtered_signal: float,
        duration: float,
        state: str,
    ) -> None:
        api_key = os.getenv("BREVO_API_KEY")
        recipients = self.settings.alert_recipients
        if not api_key:
            self._set_status(alert_type, False, "Falta BREVO_API_KEY")
            return
        if not recipients:
            self._set_status(alert_type, False, "No hay destinatarios válidos")
            return

        payload = {
            "sender": {
                "name": self.settings.alert_sender_name,
                "email": self.settings.alert_sender_email,
            },
            "to": [{"email": address} for address in recipients],
            "subject": subject,
            "htmlContent": self._html_alert(
                alert_type, magnitude, filtered_signal, duration, state
            ),
        }
        request = urllib.request.Request(
            "https://api.brevo.com/v3/smtp/email",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "api-key": api_key,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                detail = response.read().decode("utf-8", errors="replace")
                self._set_status(
                    alert_type,
                    response.status in (200, 201, 202),
                    detail or f"HTTP {response.status}",
                )
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            self._set_status(alert_type, False, f"Brevo HTTP {error.code}: {detail}")
        except (OSError, urllib.error.URLError) as error:
            self._set_status(alert_type, False, str(error))

    def _set_status(self, alert_type: str, ok: bool | None, detail: str) -> None:
        with self._lock:
            self._last_status = {
                "type": alert_type,
                "ok": ok,
                "detail": detail[:1000],
                "time": datetime.now().isoformat(timespec="seconds"),
            }

    def _html_alert(
        self,
        alert_type: str,
        magnitude: float,
        filtered_signal: float,
        duration: float,
        state: str,
    ) -> str:
        color = "#ff355e" if alert_type == "CRITICAL" else "#ff984a"
        return f"""<!doctype html>
<html lang="es"><body style="background:#07111b;color:#d7f8ff;font-family:Arial;padding:24px">
<div style="max-width:650px;margin:auto;border:1px solid {color};padding:24px;background:#0a1b28">
<h1 style="color:#00eaff">SENSOR ACTIVO</h1>
<p style="color:#79aabb;letter-spacing:2px">MONITOREO EN CURSO · SEISMIC CORE X</p>
<h2 style="color:{color}">{html.escape(alert_type)}</h2>
<p><b>Estado:</b> {html.escape(state)}</p>
<p><b>Magnitud:</b> {magnitude:.6f}</p>
<p><b>Señal filtrada:</b> {filtered_signal:.6f}</p>
<p><b>Duración:</b> {duration:.2f} s</p>
<p>Hora: {datetime.now().isoformat(timespec="seconds")}</p>
<hr><small>Monitor experimental de vibraciones; no es una alerta oficial.</small>
</div></body></html>"""


email_alert_service = EmailAlertService()
