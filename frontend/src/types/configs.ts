export type LightingControlMode = "auto" | "manual";

export interface SensorThresholds {
  ultrasonicOccupiedMaxCm: number;
  ultrasonicDebounceSeconds: number;
  requireIrConfirmation: boolean;
  yoloMinConfidencePercent: number;
  heartbeatTimeoutSeconds: number;
}

export interface ManagedLightConfig {
  id: string;
  label: string;
  zone: string;
  mode: LightingControlMode;
  isOn: boolean;
  topic: string;
}

export interface LightingAutomationConfigs {
  globalMode: LightingControlMode;
  ldrTurnOnLux: number;
  ldrTurnOffLux: number;
  lights: ManagedLightConfig[];
}

export interface ManagedBayConfig {
  id: string;
  code: string;
  zone: string;
  deviceId: string;
  cameraId: string;
  enabled: boolean;
  online: boolean;
  lastSeenAt: string;
}

export interface GatewayNodeStatus {
  deviceId: string;
  label: string;
  hardware: string;
  status: "online" | "offline";
  version: string;
  mqttTopics: string[];
  lastSeenAt: string;
}

export type BarrierGateState = "open" | "closed";

export interface BarrierGateConfig {
  deviceId: string;
  state: BarrierGateState;
  mode: LightingControlMode;
  autoCloseEnabled: boolean;
  autoCloseDelaySeconds: number;
  irSafetyBeamEnabled: boolean;
  topic: string;
  lastOperatedAt: string;
}

export interface ParkingConfigsSnapshot {
  sensors: SensorThresholds;
  lighting: LightingAutomationConfigs;
  barrier: BarrierGateConfig;
  bays: ManagedBayConfig[];
  gateways: GatewayNodeStatus[];
  updatedAt: string;
  dataSource: "mock" | "live";
}
