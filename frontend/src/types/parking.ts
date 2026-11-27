export type ParkingSlotStatus = "available" | "occupied" | "offline";

export type VehicleType = "car" | "suv" | "motorcycle" | "truck" | "unknown";

export interface VehicleDetection {
  cameraId: string;
  vehicleType: VehicleType;
  confidence: number;
  detectedAt: string;
}

export interface ParkingSlot {
  id: string;
  code: string;
  zone: string;
  status: ParkingSlotStatus;
  deviceId: string;
  ultrasonicDistanceCm: number | null;
  irObstacleDetected: boolean | null;
  cameraDetection: VehicleDetection | null;
  occupiedSince: string | null;
  updatedAt: string;
}

export type LightCondition = "bright" | "moderate" | "dim" | "dark";

export interface EnvironmentTelemetry {
  deviceId: string;
  temperatureC: number;
  humidityPercent: number;
  pressureHpa: number;
  lightLux: number;
  lightCondition: LightCondition;
  updatedAt: string;
}

export interface ParkingLight {
  id: string;
  label: string;
  zone: string;
  isOn: boolean;
  mode: "auto" | "manual";
  updatedAt: string;
}

export type EntranceQueueStatus = "NO_VEHICLE" | "IN_QUEUE";

export interface EntranceQueue {
  status: EntranceQueueStatus;
  distance: number | null;
  timestamp: string | null;
}

export type ParkingDataSource = "mock" | "live";

export interface OccupancyTrendPoint {
  timestamp: string;
  occupancyPercent: number;
  occupied: number;
  available: number;
}

export type ParkingActivityType =
  | "entry"
  | "exit"
  | "offline"
  | "online"
  | "lighting";

export interface ParkingActivityEvent {
  id: string;
  type: ParkingActivityType;
  slotId?: string;
  slotCode?: string;
  summary: string;
  detail: string;
  timestamp: string;
}

export interface ParkingOverviewSnapshot {
  slots: ParkingSlot[];
  environment: EnvironmentTelemetry;
  lights: ParkingLight[];
  entranceQueue: EntranceQueue;
  occupancyHistory: OccupancyTrendPoint[];
  recentActivity: ParkingActivityEvent[];
  updatedAt: string;
  dataSource: ParkingDataSource;
}

export type ParkingStreamStatus =
  | "mock"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export type ParkingWebSocketEvent =
  | { type: "snapshot"; payload: ParkingOverviewSnapshot }
  | { type: "slot_status"; payload: ParkingSlot }
  | { type: "environment_update"; payload: EnvironmentTelemetry }
  | { type: "lighting_status"; payload: ParkingLight[] }
  | { type: "entrance_queue"; payload: EntranceQueue }
  | { type: "activity_event"; payload: ParkingActivityEvent };
