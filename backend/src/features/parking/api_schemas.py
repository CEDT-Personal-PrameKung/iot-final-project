"""REST API request and response schemas for parking, reports, and configs."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from src.mqtt.publisher import LightingCommand

ParkingSlotStatusType = Literal["available", "occupied", "offline"]
VehicleType = Literal["car", "suv", "motorcycle", "truck", "unknown"]
LightConditionType = Literal["bright", "moderate", "dim", "dark"]
LightingControlModeType = Literal["auto", "manual"]
ParkingActivityType = Literal["entry", "exit", "offline", "online", "lighting"]
BarrierGateStateType = Literal["open", "closed"]
DataSourceType = Literal["mock", "live"]


class ApiModel(BaseModel):
    """Base schema supporting camelCase JSON serialization for frontend contracts."""

    model_config = ConfigDict(populate_by_name=True)


class VehicleDetectionResponse(ApiModel):
    camera_id: str = Field(alias="cameraId")
    vehicle_type: VehicleType = Field(alias="vehicleType")
    confidence: float = Field(ge=0.0, le=1.0)
    detected_at: datetime = Field(alias="detectedAt")


class ParkingSlotResponse(ApiModel):
    id: str
    code: str
    zone: str
    status: ParkingSlotStatusType
    device_id: str = Field(alias="deviceId")
    ultrasonic_distance_cm: float | None = Field(default=None, alias="ultrasonicDistanceCm")
    ir_obstacle_detected: bool | None = Field(default=None, alias="irObstacleDetected")
    camera_detection: VehicleDetectionResponse | None = Field(
        default=None, alias="cameraDetection"
    )
    occupied_since: datetime | None = Field(default=None, alias="occupiedSince")
    updated_at: datetime = Field(alias="updatedAt")


class EnvironmentTelemetryResponse(ApiModel):
    device_id: str = Field(alias="deviceId")
    temperature_c: float = Field(alias="temperatureC")
    humidity_percent: float = Field(alias="humidityPercent")
    pressure_hpa: float = Field(alias="pressureHpa")
    light_lux: int = Field(alias="lightLux")
    light_condition: LightConditionType = Field(alias="lightCondition")
    updated_at: datetime = Field(alias="updatedAt")


class ParkingLightResponse(ApiModel):
    id: str
    label: str
    zone: str
    is_on: bool = Field(alias="isOn")
    mode: LightingControlModeType
    updated_at: datetime = Field(alias="updatedAt")


class OccupancyTrendPointResponse(ApiModel):
    timestamp: datetime
    occupancy_percent: float = Field(alias="occupancyPercent")
    occupied: int
    available: int


class ParkingActivityEventResponse(ApiModel):
    id: str
    type: ParkingActivityType
    slot_id: str | None = Field(default=None, alias="slotId")
    slot_code: str | None = Field(default=None, alias="slotCode")
    summary: str
    detail: str
    timestamp: datetime


class ParkingOverviewResponse(ApiModel):
    slots: list[ParkingSlotResponse]
    environment: EnvironmentTelemetryResponse
    lights: list[ParkingLightResponse]
    occupancy_history: list[OccupancyTrendPointResponse] = Field(alias="occupancyHistory")
    recent_activity: list[ParkingActivityEventResponse] = Field(alias="recentActivity")
    updated_at: datetime = Field(alias="updatedAt")
    data_source: DataSourceType = Field(default="live", alias="dataSource")


class LightingCommandRequest(ApiModel):
    command: LightingCommand | None = None
    is_on: bool | None = Field(default=None, alias="isOn")
    light_id: str | None = Field(default=None, alias="lightId")

    @model_validator(mode="after")
    def ensure_command_or_is_on(self) -> LightingCommandRequest:
        if self.command is None and self.is_on is None:
            raise ValueError("Either 'command' ('ON'|'OFF'|'AUTO') or 'isOn' must be provided")
        return self

    def resolved_command(self) -> LightingCommand:
        if self.command is not None:
            return self.command
        return "ON" if self.is_on else "OFF"


class LightingCommandResponse(ApiModel):
    light_id: str = Field(alias="lightId")
    command: LightingCommand
    is_on: bool = Field(alias="isOn")
    mode: LightingControlModeType
    updated_at: datetime = Field(alias="updatedAt")


class ActivityReportsResponse(ApiModel):
    logs: list[ParkingActivityEventResponse]
    updated_at: datetime = Field(alias="updatedAt")
    data_source: DataSourceType = Field(default="live", alias="dataSource")


class SensorThresholdsConfig(ApiModel):
    ultrasonic_occupied_max_cm: float = Field(default=60.0, gt=0, alias="ultrasonicOccupiedMaxCm")
    ultrasonic_debounce_seconds: float = Field(default=3.0, ge=0, alias="ultrasonicDebounceSeconds")
    require_ir_confirmation: bool = Field(default=True, alias="requireIrConfirmation")
    yolo_min_confidence_percent: int = Field(
        default=75, ge=0, le=100, alias="yoloMinConfidencePercent"
    )
    heartbeat_timeout_seconds: int = Field(
        default=30, ge=5, le=3600, alias="heartbeatTimeoutSeconds"
    )


class ManagedLightConfig(ApiModel):
    id: str
    label: str
    zone: str
    mode: LightingControlModeType
    is_on: bool = Field(alias="isOn")
    topic: str = "parking/control/lighting"


class LightingAutomationConfig(ApiModel):
    global_mode: LightingControlModeType = Field(default="auto", alias="globalMode")
    ldr_turn_on_lux: int = Field(default=350, ge=0, alias="ldrTurnOnLux")
    ldr_turn_off_lux: int = Field(default=500, ge=0, alias="ldrTurnOffLux")
    lights: list[ManagedLightConfig]


class ManagedBayConfig(ApiModel):
    id: str
    code: str
    zone: str
    device_id: str = Field(alias="deviceId")
    camera_id: str = Field(alias="cameraId")
    enabled: bool = True
    online: bool = True
    last_seen_at: datetime = Field(alias="lastSeenAt")


class GatewayNodeStatus(ApiModel):
    device_id: str = Field(alias="deviceId")
    label: str
    hardware: str
    status: Literal["online", "offline"]
    version: str
    mqtt_topics: list[str] = Field(alias="mqttTopics")
    last_seen_at: datetime = Field(alias="lastSeenAt")


class BarrierGateConfig(ApiModel):
    device_id: str = Field(default="rpi5-gateway-01", alias="deviceId")
    state: BarrierGateStateType = "closed"
    mode: LightingControlModeType = "auto"
    auto_close_enabled: bool = Field(default=True, alias="autoCloseEnabled")
    auto_close_delay_seconds: int = Field(
        default=8, ge=1, le=300, alias="autoCloseDelaySeconds"
    )
    ir_safety_beam_enabled: bool = Field(default=True, alias="irSafetyBeamEnabled")
    topic: str = "parking/actuator/command"
    last_operated_at: datetime = Field(alias="lastOperatedAt")


class ParkingConfigsResponse(ApiModel):
    sensors: SensorThresholdsConfig
    lighting: LightingAutomationConfig
    barrier: BarrierGateConfig
    bays: list[ManagedBayConfig]
    gateways: list[GatewayNodeStatus]
    updated_at: datetime = Field(alias="updatedAt")
    data_source: DataSourceType = Field(default="live", alias="dataSource")


class ParkingConfigsUpdateRequest(ApiModel):
    sensors: SensorThresholdsConfig
    lighting: LightingAutomationConfig
    barrier: BarrierGateConfig
    bays: list[ManagedBayConfig]
