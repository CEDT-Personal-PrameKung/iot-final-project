import type {
  EntranceQueueStatus,
  LightCondition,
} from "@/types/parking";

export type CrowdLevel = "low" | "moderate" | "busy" | "full";

export type WeatherMood =
  | "comfortable"
  | "warm"
  | "hot"
  | "humid"
  | "cool"
  | "unknown";

export type InsightSource = "gemini" | "fallback";

export interface DailyInsightMetrics {
  dateBangkok: string;
  occupiedSlots: number;
  availableSlots: number;
  offlineSlots: number;
  totalSlots: number;
  currentOccupancyPercent: number;
  avgOccupancyPercent: number | null;
  peakOccupancyPercent: number | null;
  peakHour: number | null;
  entriesToday: number;
  exitsToday: number;
  queueEventsToday: number;
  currentQueueStatus: EntranceQueueStatus;
  queueDistanceCm: number | null;
  barrierState: "open" | "closed";
  lightsOn: boolean;
  lightingMode: "auto" | "manual";
  temperatureC: number | null;
  minTemperatureC: number | null;
  maxTemperatureC: number | null;
  humidityPercent: number | null;
  pressureHpa: number | null;
  lightLux: number | null;
  lightCondition: LightCondition | null;
  hasEnvironmentData: boolean;
}

export interface DailyAiInsight {
  headline: string;
  crowdLevel: CrowdLevel;
  crowdSummary: string;
  weatherMood: WeatherMood;
  weatherSummary: string;
  recommendation: string;
  highlights: string[];
  metrics: DailyInsightMetrics;
  source: InsightSource;
  model: string | null;
  cached: boolean;
  generatedAt: string;
}
