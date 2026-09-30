
export type IconName = string;

export interface Category {
  id: string;
  name: string;
  color: string; // Tailwind text color class or hex
  icon?: IconName;
  order: number;
}

export interface DockerStats {
  cpu: number; // CPU percentage
  ram: number; // RAM percentage
  ramUsed: number; // RAM used in bytes
  ramLimit: number; // RAM limit in bytes
  networkRx: number; // Network RX bytes
  networkTx: number; // Network TX bytes
  diskRead: number; // Disk read bytes
  diskWrite: number; // Disk write bytes
  uptime: string; // Uptime formatted (e.g., "2d 3h")
  status: 'running' | 'stopped' | 'paused' | 'unknown';
}

export interface DockerLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
}

export interface Service {
  id: string;
  name: string;
  description?: string;
  url: string;
  categoryId: string;
  tags: string[];
  icon: IconName;
  customImage?: string;
  isFavorite: boolean;
  status: 'online' | 'offline' | 'maintenance' | 'unknown';
  openInNewTab: boolean;
  isVisible: boolean;
  order: number;
  stats?: {
    dockerContainer?: string; // Docker container name/ID
    dockerEnabled?: boolean; // Enable Docker monitoring
    cpu?: number;
    ram?: number;
    disk?: number;
    uptime?: string;
    networkRx?: number;
    networkTx?: number;
    alertThresholds?: {
      cpuPercent?: number;
      ramPercent?: number;
    };
  };
}

export interface ThemeConfig {
  mode: 'light' | 'dark' | 'auto';
  primaryColor: string;
  backgroundType: 'solid' | 'gradient' | 'image';
  backgroundValue: string; // Hex, css gradient, or url
  density: 'compact' | 'normal' | 'spacious';
  showClock: boolean;
  showWeather: boolean;
  showDescriptions: boolean;
  showSystemStats?: boolean;
  systemStatsPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' | 'custom';
  systemStatsCustomPosition?: { x: number; y: number };
  weatherCity?: string;
  weatherUnit?: 'metric' | 'imperial';
  /** First name for the greeting. */
  userName?: string;
  /** `user@host` for the SSH actions; the server running the containers. */
  sshTarget?: string;
  /** Visual style (theme/skins.ts): the default BoardUI look, Papier, Terminal… */
  skin?: import('./theme/skins').Skin;
}

/** One probe of the backend health monitor. */
export interface HealthSample {
  t: number;
  up: boolean;
  ms: number | null;
}

export interface ServiceHealth {
  status: 'online' | 'offline';
  latency: number | null;
  history: HealthSample[];
  container?: { name: string; cpu: number; ram: number };
  checkedAt: number;
  uptime24h?: number | null;
  uptime7d?: number | null;
}

/** Live line on a tile (qBittorrent speeds, Jellyfin now playing…). */
export interface Widget {
  type: string;
  serviceId: string | null;
  ok: boolean;
  summary: string;
  items: string[];
  active?: boolean;
  at: number;
}

/** One Home Assistant entity (backend routes/integrations.ts, /homeassistant/entities). */
export interface HaEntity {
  id: string;
  domain: string;
  name: string;
  state: string;
  unit: string | null;
  deviceClass: string | null;
  area: string | null;
  changed: string;
}

export type HaWidgetKind = 'value' | 'room' | 'status' | 'control';

/** A Home Assistant widget (backend routes/ha.ts). */
export interface HaWidget {
  id: number;
  kind: HaWidgetKind;
  title: string;
  entities: string[];
  onHome: boolean;
  size: 'small' | 'wide';
  position: number;
}

/** Live state of an entity used by a widget. */
export interface HaLive {
  id: string;
  domain: string;
  name: string;
  state: string;
  unit: string | null;
  deviceClass: string | null;
  changed: string;
  position: number | null;
  brightness: number | null;
  /** Lights: supported colour modes (onoff, brightness, color_temp, rgb, xy, hs…). */
  colorModes?: string[] | null;
  rgb?: [number, number, number] | null;
  kelvin?: number | null;
  minKelvin?: number | null;
  maxKelvin?: number | null;
}

/** An entity shown in the status bar in place of the city weather (backend routes/ha.ts). */
export interface HaBarItem {
  id: string;
  domain: string;
  name: string;
  state: string;
  unit: string | null;
  deviceClass: string | null;
  changed: string;
  /** Weather entities: OpenWeather-style icon code, French condition, humidity. */
  icon: string | null;
  condition: string | null;
  humidity: number | null;
}

export interface HaWidgetsData {
  widgets: HaWidget[];
  states: Record<string, HaLive>;
  history: Record<string, { t: number; v: number }[]>;
}

/** One entry of a storage folder (sidebar → Stockage; backend routes/integrations.ts). */
export interface TreeItem {
  name: string;
  /** What to pass to open this folder (Nextcloud path, kDrive id); null for a file. */
  open: string | null;
  folder: boolean;
  size: number | null;
  /** Last change, ms since epoch. */
  modified: number | null;
  /** The containing folder, same form as `open`. */
  parent: string | null;
  /** Full path, for display. */
  path: string;
  url: string;
}

/** A Nextcloud file search hit (backend routes/integrations.ts). */
export interface NcFile {
  title: string;
  sub: string;
  url: string;
  folder: boolean;
}

export type NcAction = 'upgrade' | 'cron' | 'scan' | 'apps' | 'indices' | 'maintenance-on' | 'maintenance-off';

/** A Jellyseerr search hit (backend routes/integrations.ts). */
export interface SeerrResult {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: string | null;
  poster: string | null;
  status: 'none' | 'requested' | 'partial' | 'available';
}

export interface IntegrationConfig {
  type: 'qbittorrent' | 'jellyfin' | 'sonarr' | 'radarr' | 'jellyseerr' | 'nextcloud' | 'kdrive' | 'homeassistant';
  configured: boolean;
  enabled: boolean;
  serviceId: string | null;
  url: string;
  username: string;
  hasApiKey: boolean;
  hasPassword: boolean;
  options: { entities?: string; [key: string]: unknown };
  state: { ok: boolean; summary: string; error?: string; at: number } | null;
}

export interface ContainerOverview {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  cpu: number;
  ram: number;
  ramUsed: number;
  ramLimit: number;
  history: { t: number; cpu: number; ram: number }[];
}

/** GET /api/docker/topology (backend services/topology.ts). */
export interface TopoContainer {
  name: string;
  image: string;
  state: string;
  health: string | null;
  project: string | null;
  networks: string[];
  via: string | null;
  ports: { public: number; private: number }[];
  cpu: number;
  ram: number;
  rx: number;
  tx: number;
}
export interface Topology {
  at: number;
  containers: TopoContainer[];
  networks: { name: string; kind: 'host' | 'bridge' | 'custom'; members: number }[];
}

/** GET /api/docker/updates (backend services/updates.ts). */
export type UpdateState = 'current' | 'available' | 'recreate' | 'local' | 'self' | 'error';
export interface ContainerUpdate {
  container: string;
  image: string;
  state: UpdateState;
  error?: string;
  dependents: string[];
}
export interface UpdateJob {
  container: string;
  status: 'queued' | 'pulling' | 'recreating' | 'done' | 'failed';
  step: string;
  error?: string;
  startedAt: number;
  endedAt?: number;
}
export interface UpdatesData {
  checkedAt: number | null;
  checking: boolean;
  containers: Record<string, ContainerUpdate>;
  jobs: Record<string, UpdateJob>;
}
export interface PrunePreview {
  containers: { count: number; bytes: number; names: string[] };
  dangling: { count: number; bytes: number };
  unused: { count: number; bytes: number; names: string[] };
  networks: { count: number };
  buildCache: { count: number; bytes: number };
  volumes: { count: number; bytes: number; named: number };
}

/** GET /api/wrapped: a month in numbers (Paris time). */
export interface WrappedData {
  month: string;
  label: string;
  isCurrent: boolean;
  months: { key: string; label: string }[];
  userName: string;
  opens: {
    total: number;
    activeDays: number;
    daysInPeriod: number;
    longestStreak: { days: number; from: string; to: string } | null;
    busiestDay: { date: string; count: number } | null;
    hours: number[];
    /** Monday first. */
    weekdays: number[];
    night: number;
    early: number;
    distinctServices: number;
    totalServices: number;
  };
  top: { serviceId: string; count: number }[];
  discoveries: { serviceId: string; at: string }[];
  added: string[];
  health: {
    checks: number;
    uptime: number | null;
    outages: number;
    longestOutage: { serviceId: string; seconds: number; day: string } | null;
    mostReliable: { serviceId: string; uptime: number; checks: number; outages: number } | null;
    leastReliable: { serviceId: string; uptime: number; checks: number; outages: number } | null;
    perfectDays: number;
    daysMeasured: number;
  };
}

export interface AppData {
  /** Container image updates and running update jobs. */
  updates: UpdatesData;
  /** Styles made in the Studio. */
  customSkins: import('./theme/skins').CustomSkin[];
  services: Service[];
  categories: Category[];
  theme: ThemeConfig;
  /** Keyed by service id. */
  health: Record<string, ServiceHealth>;
  /** Live tile widgets, keyed by service id. */
  widgets: Record<string, Widget>;
  /** Last opened links (newest first) and 30-day open counts. */
  recent: { id: string; at: string }[];
  usage: Record<string, number>;
}
