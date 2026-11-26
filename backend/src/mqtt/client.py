"""EMQX Cloud MQTT client configuration and TLS factory."""

from __future__ import annotations

import ssl
from dataclasses import dataclass
from typing import Any

import paho.mqtt.client as mqtt

from src.settings import Settings, get_settings

DEFAULT_KEEPALIVE_SECONDS = 60
DEFAULT_MIN_RECONNECT_DELAY_SECONDS = 1
DEFAULT_MAX_RECONNECT_DELAY_SECONDS = 60


@dataclass(frozen=True, slots=True)
class MqttConfig:
    """Validated connection parameters for the cloud MQTT broker."""

    host: str
    port: int
    username: str
    password: str
    client_id: str = "smart-parking-backend"
    ca_cert_path: str | None = None
    keepalive_seconds: int = DEFAULT_KEEPALIVE_SECONDS


def load_mqtt_config(settings: Settings | None = None) -> MqttConfig:
    """Build an MqttConfig from application settings, raising if incomplete."""
    resolved = settings or get_settings()
    missing: list[str] = []

    host = (resolved.emqx_host or "").strip()
    username = (resolved.emqx_username or "").strip()
    password = (
        resolved.emqx_password.get_secret_value().strip()
        if resolved.emqx_password is not None
        else ""
    )

    if not host:
        missing.append("EMQX_HOST")
    if not username:
        missing.append("EMQX_USERNAME")
    if not password:
        missing.append("EMQX_PASSWORD")

    if missing:
        raise RuntimeError(
            f"EMQX configuration is incomplete; missing: {', '.join(missing)}"
        )

    ca_cert_path = (
        resolved.emqx_ca_cert_path.strip()
        if resolved.emqx_ca_cert_path and resolved.emqx_ca_cert_path.strip()
        else None
    )

    return MqttConfig(
        host=host,
        port=resolved.emqx_port,
        username=username,
        password=password,
        client_id=resolved.emqx_client_id.strip() or "smart-parking-backend",
        ca_cert_path=ca_cert_path,
    )


def build_tls_context(ca_cert_path: str | None = None) -> ssl.SSLContext:
    """Create a strict TLS 1.2+ context using system roots or an explicit CA file."""
    context = ssl.create_default_context(cafile=ca_cert_path)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.check_hostname = True
    context.verify_mode = ssl.CERT_REQUIRED
    return context


def create_mqtt_client(
    config: MqttConfig,
    *,
    client_id: str | None = None,
    on_connect: Any | None = None,
    on_disconnect: Any | None = None,
    on_message: Any | None = None,
) -> mqtt.Client:
    """Create a configured Paho MQTT v2 client for EMQX Cloud over TLS."""
    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id=client_id or config.client_id,
        protocol=mqtt.MQTTv311,
        clean_session=True,
    )
    client.username_pw_set(config.username, config.password)
    client.tls_set_context(build_tls_context(config.ca_cert_path))
    client.reconnect_delay_set(
        min_delay=DEFAULT_MIN_RECONNECT_DELAY_SECONDS,
        max_delay=DEFAULT_MAX_RECONNECT_DELAY_SECONDS,
    )

    if on_connect is not None:
        client.on_connect = on_connect
    if on_disconnect is not None:
        client.on_disconnect = on_disconnect
    if on_message is not None:
        client.on_message = on_message

    return client
