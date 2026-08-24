import { fetchJSON, postJSON, patchJSON, deleteJSON } from "./http";

export type NotificationChannelType = "slack" | "discord" | "telegram" | "email" | "webhook";

export type NotificationChannel = {
  id: string;
  type: NotificationChannelType;
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NotificationEventSubscription = {
  id: string;
  channelId: string;
  eventType: string;
  template: string;
  lastSentAt?: string;
  deliveryStatus: "pending" | "delivered" | "failed";
  createdAt: string;
  updatedAt: string;
};

export type NotificationLog = {
  id: string;
  channelId: string;
  eventType: string;
  status: "pending" | "delivered" | "failed";
  error?: string;
  sentAt: string;
};

export const AVAILABLE_EVENTS = [
  "server.crash",
  "server.install.complete",
  "backup.complete",
  "backup.failed",
  "deployment.complete",
  "deployment.failed",
  "node.down",
  "node.up",
] as const;

export type AvailableEvent = (typeof AVAILABLE_EVENTS)[number];

export const EVENT_LABELS: Record<AvailableEvent, string> = {
  "server.crash": "Server Crash",
  "server.install.complete": "Server Install Complete",
  "backup.complete": "Backup Complete",
  "backup.failed": "Backup Failed",
  "deployment.complete": "Deployment Complete",
  "deployment.failed": "Deployment Failed",
  "node.down": "Node Offline",
  "node.up": "Node Online",
};

type ChannelsResponse = { channels: NotificationChannel[] };
type SubscriptionsResponse = { subscriptions: NotificationEventSubscription[] };
type LogsResponse = { logs: NotificationLog[] };

export async function fetchNotificationChannels(): Promise<NotificationChannel[]> {
  const res = await fetchJSON<ChannelsResponse>("/notification-channels");
  return res.channels;
}

export async function createNotificationChannel(data: {
  type: NotificationChannelType;
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
}): Promise<NotificationChannel> {
  return postJSON<NotificationChannel>("/notification-channels", data);
}

export async function getNotificationChannel(id: string): Promise<NotificationChannel> {
  return fetchJSON<NotificationChannel>(`/notification-channels/${encodeURIComponent(id)}`);
}

export async function updateNotificationChannel(
  id: string,
  data: { name?: string; config?: Record<string, unknown>; enabled?: boolean },
): Promise<NotificationChannel> {
  return patchJSON<NotificationChannel>(`/notification-channels/${encodeURIComponent(id)}`, data);
}

export async function deleteNotificationChannel(id: string): Promise<void> {
  return deleteJSON(`/notification-channels/${encodeURIComponent(id)}`);
}

export async function testNotificationChannel(id: string): Promise<void> {
  await postJSON(`/notification-channels/${encodeURIComponent(id)}/test`);
}

export async function fetchSubscriptions(channelId: string): Promise<NotificationEventSubscription[]> {
  const res = await fetchJSON<SubscriptionsResponse>(`/notification-channels/${encodeURIComponent(channelId)}/subscribe`);
  return res.subscriptions;
}

export async function createSubscription(channelId: string, eventType: string, template?: string): Promise<NotificationEventSubscription> {
  return postJSON<NotificationEventSubscription>(`/notification-channels/${encodeURIComponent(channelId)}/subscribe`, {
    eventType,
    template: template ?? "",
  });
}

export async function deleteSubscription(channelId: string, subId: string): Promise<void> {
  return deleteJSON(`/notification-channels/${encodeURIComponent(channelId)}/subscribe/${encodeURIComponent(subId)}`);
}

export async function fetchNotificationLogs(channelId?: string, limit = 100, offset = 0): Promise<NotificationLog[]> {
  const params = new URLSearchParams();
  if (channelId) params.set("channelId", channelId);
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  const res = await fetchJSON<LogsResponse>(`/notification-logs?${params.toString()}`);
  return res.logs;
}

// ---- Enhanced Notifications (handlers_notifications_enhanced.go) ----

export type AlertRule = {
  id: string;
  tenant_id: string;
  user_id?: string;
  name: string;
  description?: string;
  rule_type: "threshold" | "state" | "event" | string;
  entity_type: string;
  metric_name?: string;
  threshold_value?: number;
  comparison_operator?: string;
  state_value?: string;
  event_type?: string;
  duration_minutes: number;
  cooldown_minutes: number;
  severity: "info" | "warning" | "critical" | "emergency" | string;
  is_enabled: boolean;
  notification_channel_ids: string[];
  created_at: string;
  updated_at: string;
  last_triggered_at?: string;
};

export type AlertState = {
  id: string;
  alert_rule_id: string;
  entity_id: string;
  entity_type: string;
  current_value?: number;
  current_state?: string;
  triggered_at?: string;
  resolved_at?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type NotificationPreference = {
  id: string;
  user_id: string;
  tenant_id: string;
  channel_type: string;
  event_types: string[];
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

type AlertRulesResponse = { alertRules: AlertRule[] };
type AlertStatesResponse = { alertStates: AlertState[] };
type PreferencesResponse = { preferences: NotificationPreference[] };

export async function fetchAlertRules(params?: {
  tenantId?: string;
  userId?: string;
  entityType?: string;
}): Promise<AlertRule[]> {
  const q = new URLSearchParams();
  if (params?.tenantId) q.set("tenantId", params.tenantId);
  if (params?.userId) q.set("userId", params.userId);
  if (params?.entityType) q.set("entityType", params.entityType);
  const qs = q.toString();
  const res = await fetchJSON<AlertRulesResponse>(`/notifications/alerts${qs ? `?${qs}` : ""}`);
  return res.alertRules ?? [];
}

export async function createAlertRule(data: {
  name: string;
  description?: string;
  rule_type: string;
  entity_type: string;
  metric_name?: string;
  threshold_value?: number;
  comparison_operator?: string;
  state_value?: string;
  event_type?: string;
  duration_minutes?: number;
  cooldown_minutes?: number;
  severity?: string;
  is_enabled?: boolean;
  notification_channel_ids?: string[];
  tenant_id?: string;
  user_id?: string;
}): Promise<AlertRule> {
  return postJSON<AlertRule>("/notifications/alerts", data);
}

export async function getAlertRule(id: string): Promise<AlertRule> {
  return fetchJSON<AlertRule>(`/notifications/alerts/${encodeURIComponent(id)}`);
}

export async function updateAlertRule(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    rule_type: string;
    entity_type: string;
    metric_name: string;
    threshold_value: number;
    comparison_operator: string;
    state_value: string;
    event_type: string;
    duration_minutes: number;
    cooldown_minutes: number;
    severity: string;
    is_enabled: boolean;
    notification_channel_ids: string[];
  }>,
): Promise<AlertRule> {
  return patchJSON<AlertRule>(`/notifications/alerts/${encodeURIComponent(id)}`, data);
}

export async function deleteAlertRule(id: string): Promise<void> {
  return deleteJSON(`/notifications/alerts/${encodeURIComponent(id)}`);
}

export async function fetchAlertStates(alertRuleId: string, params?: { tenantId?: string }): Promise<AlertState[]> {
  const q = new URLSearchParams();
  if (params?.tenantId) q.set("tenantId", params.tenantId);
  const qs = q.toString();
  const res = await fetchJSON<AlertStatesResponse>(
    `/notifications/alerts/${encodeURIComponent(alertRuleId)}/states${qs ? `?${qs}` : ""}`,
  );
  return res.alertStates ?? [];
}

export async function fetchNotificationPreferences(params?: { tenantId?: string }): Promise<NotificationPreference[]> {
  const q = new URLSearchParams();
  if (params?.tenantId) q.set("tenantId", params.tenantId);
  const qs = q.toString();
  const res = await fetchJSON<PreferencesResponse>(`/notifications/preferences${qs ? `?${qs}` : ""}`);
  return res.preferences ?? [];
}

export async function createNotificationPreference(data: {
  channelType: string;
  channel_type?: string;
  tenantId?: string;
  tenant_id?: string;
  eventTypes?: string[];
  event_types?: string[];
  isEnabled?: boolean;
  is_enabled?: boolean;
}): Promise<NotificationPreference> {
  // backend expects channelType and tenantId mapping; send both snake and camel for compat
  return postJSON<NotificationPreference>("/notifications/preferences", data);
}

export async function getNotificationPreference(id: string, params?: { tenantId?: string; channelType?: string }): Promise<NotificationPreference> {
  const q = new URLSearchParams();
  if (params?.tenantId) q.set("tenantId", params.tenantId);
  if (params?.channelType) q.set("channelType", params.channelType);
  const qs = q.toString();
  return fetchJSON<NotificationPreference>(`/notifications/preferences/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`);
}

export async function updateNotificationPreference(
  id: string,
  data: { event_types?: string[]; eventTypes?: string[]; is_enabled?: boolean; isEnabled?: boolean },
): Promise<NotificationPreference> {
  return patchJSON<NotificationPreference>(`/notifications/preferences/${encodeURIComponent(id)}`, data);
}

export async function deleteNotificationPreference(id: string): Promise<void> {
  return deleteJSON(`/notifications/preferences/${encodeURIComponent(id)}`);
}

export async function testNotification(channelId: string): Promise<void> {
  await postJSON("/notifications/test", { channelId });
}
