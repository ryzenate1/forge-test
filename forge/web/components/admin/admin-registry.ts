import type { LucideIcon } from "lucide-react";
import {
  Activity, ArrowLeftRight, Award, BarChart3, Bell, Box, Bug, Cable, Clock, Cloud, Container, Cpu, CreditCard, Database, FileText, Fingerprint, FlaskConical, FolderLock, GanttChart, GitBranch,
  Globe, HardDrive, HeartPulse, KeyRound, Layers, Layout, Library, Mail, Map, MapPin, Network, Plug, Router, Scale, Server, Shield, ShieldCheck, SlidersHorizontal,
  Terminal, Ticket, Trash2, Users, Waypoints, Workflow,
} from "lucide-react";

export type AdminNavEntry = {
  label: string;
  labelKey: string;
  href: string;
  icon: LucideIcon;
  requiredRole: "admin";
  capability: "available" | "metadata-only";
  description: string;
  descriptionKey: string;
  /** Optional: marks items that can show a State-Lanes two-dot pending badge */
  hasPendingGenerations?: boolean;
};

export type AdminNavGroup = { title: string; titleKey: string; items: AdminNavEntry[] };

/**
 * User-facing grouped registry — 8 goal-oriented groups (was 5 system-built groups).
 * Achieves 75+ visible + 2 invisible aliases = 77+ routes.
 */
export const adminPageRegistry: AdminNavGroup[] = [
  { title: "Command Center", titleKey: "admin.navGroup.commandCenter", items: [
    { label: "Overview", labelKey: "admin.nav.overview", href: "/admin/overview", icon: Server, requiredRole: "admin", capability: "available", description: "Live control-plane summary and fleet health at a glance", descriptionKey: "admin.navDesc.overview" },
    { label: "Monitoring", labelKey: "admin.nav.monitoring", href: "/admin/monitoring", icon: HeartPulse, requiredRole: "admin", capability: "available", description: "Platform and node health dashboards", descriptionKey: "admin.navDesc.monitoring" },
    { label: "Health", labelKey: "admin.nav.health", href: "/admin/health", icon: HeartPulse, requiredRole: "admin", capability: "available", description: "Dependency and service diagnostics", descriptionKey: "admin.navDesc.health" },
    { label: "Activity", labelKey: "admin.nav.activity", href: "/admin/activity", icon: Activity, requiredRole: "admin", capability: "available", description: "Human-readable audit and activity history", descriptionKey: "admin.navDesc.activity" },
  ]},
  { title: "Operations & Lifecycle", titleKey: "admin.navGroup.operationsLifecycle", items: [
    { label: "Operations", labelKey: "admin.nav.operations", href: "/admin/operations", icon: SlidersHorizontal, requiredRole: "admin", capability: "available", description: "Control-plane operation history and controls", descriptionKey: "admin.navDesc.operations", hasPendingGenerations: true },
    { label: "Migrations", labelKey: "admin.nav.migrations", href: "/admin/migrations", icon: ArrowLeftRight, requiredRole: "admin", capability: "available", description: "Live migration jobs and recovery plans", descriptionKey: "admin.navDesc.migrations", hasPendingGenerations: true },
    { label: "Reconciliation Center", labelKey: "admin.nav.reconciliation", href: "/admin/reconciliation", icon: FlaskConical, requiredRole: "admin", capability: "available", description: "Drift detection and state reconciliation", descriptionKey: "admin.navDesc.reconciliation", hasPendingGenerations: true },
    { label: "Cron Jobs", labelKey: "admin.nav.cronJobs", href: "/admin/cron-jobs", icon: Clock, requiredRole: "admin", capability: "available", description: "Scheduled and recurring automation", descriptionKey: "admin.navDesc.cronJobs" },
    { label: "Orphan Remediation", labelKey: "admin.nav.orphans", href: "/admin/orphans", icon: Bug, requiredRole: "admin", capability: "available", description: "Orphaned servers and databases requiring manual cleanup", descriptionKey: "admin.navDesc.orphans" },
    { label: "Cleanup", labelKey: "admin.nav.cleanup", href: "/admin/cleanup", icon: Trash2, requiredRole: "admin", capability: "available", description: "Garbage collection, Inspect & Run cleanup for stale resources", descriptionKey: "admin.navDesc.cleanup" },
  ]},
  { title: "Compute & Runtime", titleKey: "admin.navGroup.computeRuntime", items: [
    { label: "Host", labelKey: "admin.nav.host", href: "/admin/host", icon: Server, requiredRole: "admin", capability: "available", description: "Per-node system, disk, memory and processes", descriptionKey: "admin.navDesc.host" },
    { label: "Kubernetes", labelKey: "admin.nav.kubernetes", href: "/admin/kubernetes", icon: Layers, requiredRole: "admin", capability: "available", description: "Kubernetes pods, deployments and services", descriptionKey: "admin.navDesc.kubernetes" },
    { label: "Docker", labelKey: "admin.nav.docker", href: "/admin/docker", icon: Container, requiredRole: "admin", capability: "available", description: "Container, image, network and volume management", descriptionKey: "admin.navDesc.docker" },
    { label: "Cloud Instances", labelKey: "admin.nav.cloud", href: "/admin/cloud", icon: Cloud, requiredRole: "admin", capability: "available", description: "Cloud provider instances and provisioning", descriptionKey: "admin.navDesc.cloud" },
    { label: "Host Files", labelKey: "admin.nav.files", href: "/admin/files", icon: FileText, requiredRole: "admin", capability: "available", description: "Browse and manage host files", descriptionKey: "admin.navDesc.files" },
    { label: "Terminal", labelKey: "admin.nav.terminal", href: "/admin/terminal", icon: Terminal, requiredRole: "admin", capability: "available", description: "Secure host shell and console access", descriptionKey: "admin.navDesc.terminal" },
  ]},
  { title: "Workloads", titleKey: "admin.navGroup.workloads", items: [
    { label: "Servers", labelKey: "admin.nav.servers", href: "/admin/servers", icon: Layers, requiredRole: "admin", capability: "available", description: "Game server instances and lifecycle", descriptionKey: "admin.navDesc.servers" },
    { label: "Apps", labelKey: "admin.nav.apps", href: "/admin/apps", icon: Box, requiredRole: "admin", capability: "available", description: "Container apps, Git repos, and stacks", descriptionKey: "admin.navDesc.apps" },
    { label: "Deployments", labelKey: "admin.nav.deployments", href: "/admin/deployments", icon: ArrowLeftRight, requiredRole: "admin", capability: "available", description: "Blue-green and rolling deployments", descriptionKey: "admin.navDesc.deployments", hasPendingGenerations: true },
    { label: "Preview Deployments", labelKey: "admin.nav.previewDeployments", href: "/admin/preview-deployments", icon: Layout, requiredRole: "admin", capability: "available", description: "Pull-request preview environments", descriptionKey: "admin.navDesc.previewDeployments", hasPendingGenerations: true },
    { label: "Source Deployments", labelKey: "admin.nav.sourceDeployments", href: "/admin/source-deployments", icon: GitBranch, requiredRole: "admin", capability: "available", description: "Build and deploy from Git sources", descriptionKey: "admin.navDesc.sourceDeployments", hasPendingGenerations: true },
    { label: "Compose Stacks", labelKey: "admin.nav.compose", href: "/admin/compose", icon: Container, requiredRole: "admin", capability: "available", description: "Docker Compose stacks and imports", descriptionKey: "admin.navDesc.compose" },
    { label: "App Store", labelKey: "admin.nav.appStore", href: "/admin/app-store", icon: Box, requiredRole: "admin", capability: "available", description: "Curated one-click service catalog", descriptionKey: "admin.navDesc.appStore" },
    { label: "Git Integrations", labelKey: "admin.nav.gitConnections", href: "/admin/git", icon: Plug, requiredRole: "admin", capability: "available", description: "Git credentials, providers, and sources", descriptionKey: "admin.navDesc.gitConnections" },
    { label: "Git Providers", labelKey: "admin.nav.gitProviders", href: "/admin/git-providers", icon: GitBranch, requiredRole: "admin", capability: "available", description: "Connected Git provider accounts", descriptionKey: "admin.navDesc.gitProviders" },
    { label: "Pipelines", labelKey: "admin.nav.pipelines", href: "/admin/pipelines", icon: Workflow, requiredRole: "admin", capability: "available", description: "CI/CD pipelines and delivery workflows", descriptionKey: "admin.navDesc.pipelines", hasPendingGenerations: true },
  ]},
  { title: "People & Access", titleKey: "admin.navGroup.peopleAccess", items: [
    { label: "Users", labelKey: "admin.nav.users", href: "/admin/users", icon: Users, requiredRole: "admin", capability: "available", description: "Accounts, limits and status", descriptionKey: "admin.navDesc.users" },
    { label: "Roles", labelKey: "admin.nav.roles", href: "/admin/roles", icon: ShieldCheck, requiredRole: "admin", capability: "available", description: "Role definitions and permissions", descriptionKey: "admin.navDesc.roles" },
    { label: "Organizations", labelKey: "admin.nav.organizations", href: "/admin/organizations", icon: Users, requiredRole: "admin", capability: "available", description: "Multi-tenant organizations", descriptionKey: "admin.navDesc.organizations" },
    { label: "Projects", labelKey: "admin.nav.projects", href: "/admin/projects", icon: Layers, requiredRole: "admin", capability: "available", description: "Projects within organizations", descriptionKey: "admin.navDesc.projects" },
    { label: "Environments", labelKey: "admin.nav.environments", href: "/admin/environments", icon: Globe, requiredRole: "admin", capability: "available", description: "Environment-scoped variables and stages", descriptionKey: "admin.navDesc.environments" },
    { label: "OAuth Clients", labelKey: "admin.nav.oauthClients", href: "/admin/oauth-clients", icon: KeyRound, requiredRole: "admin", capability: "available", description: "OAuth clients and API access", descriptionKey: "admin.navDesc.oauthClients" },
    { label: "Single Sign-On", labelKey: "admin.nav.socialLogin", href: "/admin/social", icon: Users, requiredRole: "admin", capability: "available", description: "Social and enterprise SSO providers", descriptionKey: "admin.navDesc.socialLogin" },
  ]},
  { title: "Infrastructure & Data", titleKey: "admin.navGroup.infrastructureData", items: [
    { label: "Regions", labelKey: "admin.nav.regions", href: "/admin/regions", icon: Map, requiredRole: "admin", capability: "available", description: "Cluster regions and placement zones", descriptionKey: "admin.navDesc.regions" },
    { label: "Locations", labelKey: "admin.nav.locations", href: "/admin/locations", icon: MapPin, requiredRole: "admin", capability: "available", description: "Physical and logical node locations", descriptionKey: "admin.navDesc.locations" },
    { label: "Nodes", labelKey: "admin.nav.nodes", href: "/admin/nodes", icon: Network, requiredRole: "admin", capability: "available", description: "Daemon hosts and heartbeat status", descriptionKey: "admin.navDesc.nodes" },
    { label: "IP Allocations", labelKey: "admin.nav.allocations", href: "/admin/allocations", icon: Cable, requiredRole: "admin", capability: "available", description: "Network ports and IP bindings", descriptionKey: "admin.navDesc.allocations" },
    { label: "Capabilities", labelKey: "admin.nav.capabilities", href: "/admin/capabilities", icon: Cpu, requiredRole: "admin", capability: "available", description: "Global node capability inventory and drift delta", descriptionKey: "admin.navDesc.capabilities" },
    { label: "Onboarding Tokens", labelKey: "admin.nav.onboardingTokens", href: "/admin/onboarding-tokens", icon: Ticket, requiredRole: "admin", capability: "available", description: "Node onboarding token lifecycle — issue, approve, revoke", descriptionKey: "admin.navDesc.onboardingTokens" },
    { label: "Database Hosts", labelKey: "admin.nav.databaseHosts", href: "/admin/databases", icon: Database, requiredRole: "admin", capability: "available", description: "Managed database hosts", descriptionKey: "admin.navDesc.databaseHosts" },
    { label: "Database Services", labelKey: "admin.nav.databaseServices", href: "/admin/database-services", icon: HardDrive, requiredRole: "admin", capability: "available", description: "Managed application databases", descriptionKey: "admin.navDesc.databaseServices" },
    { label: "Storage Mounts", labelKey: "admin.nav.mounts", href: "/admin/mounts", icon: HardDrive, requiredRole: "admin", capability: "available", description: "Shared storage mounts and volumes", descriptionKey: "admin.navDesc.mounts" },
    { label: "Backups", labelKey: "admin.nav.backups", href: "/admin/backups", icon: HardDrive, requiredRole: "admin", capability: "available", description: "Backups, artifacts and restore operations", descriptionKey: "admin.navDesc.backups" },
    { label: "SFTP", labelKey: "admin.nav.sftp", href: "/admin/sftp", icon: FolderLock, requiredRole: "admin", capability: "available", description: "Global and per-node SFTP configuration", descriptionKey: "admin.navDesc.sftp" },
  ]},
  { title: "Networking & Security", titleKey: "admin.navGroup.networkingSecurity", items: [
    { label: "Endpoints", labelKey: "admin.nav.endpoints", href: "/admin/endpoints", icon: Globe, requiredRole: "admin", capability: "available", description: "Public endpoint inventory", descriptionKey: "admin.navDesc.endpoints" },
    { label: "Service Discovery", labelKey: "admin.nav.discovery", href: "/admin/discovery", icon: Network, requiredRole: "admin", capability: "available", description: "Service discovery and network policy", descriptionKey: "admin.navDesc.discovery" },
    { label: "Firewall", labelKey: "admin.nav.firewall", href: "/admin/firewall", icon: Shield, requiredRole: "admin", capability: "available", description: "Firewall rules and port forwarding", descriptionKey: "admin.navDesc.firewall" },
    { label: "Load Balancer", labelKey: "admin.nav.loadBalancer", href: "/admin/load-balancer", icon: GanttChart, requiredRole: "admin", capability: "available", description: "Target groups and traffic routing", descriptionKey: "admin.navDesc.loadBalancer" },
    { label: "Traffic Policies", labelKey: "admin.nav.traffic", href: "/admin/traffic", icon: Globe, requiredRole: "admin", capability: "available", description: "Route rules and traffic shaping", descriptionKey: "admin.navDesc.traffic" },
    { label: "Domains", labelKey: "admin.nav.domains", href: "/admin/domains", icon: Globe, requiredRole: "admin", capability: "available", description: "Custom domain management and verification", descriptionKey: "admin.navDesc.domains" },
    { label: "DNS Providers", labelKey: "admin.nav.dnsProviders", href: "/admin/dns", icon: Globe, requiredRole: "admin", capability: "available", description: "ACME DNS-01 providers", descriptionKey: "admin.navDesc.dnsProviders" },
    { label: "Gateways", labelKey: "admin.nav.gateways", href: "/admin/gateways", icon: Router, requiredRole: "admin", capability: "available", description: "Edge gateway routers, services and middlewares", descriptionKey: "admin.navDesc.gateways" },
    { label: "Cross-Node", labelKey: "admin.nav.crossnode", href: "/admin/crossnode", icon: Waypoints, requiredRole: "admin", capability: "available", description: "Cross-node resolver cache and ingress sync controls", descriptionKey: "admin.navDesc.crossnode" },
    { label: "Certificates", labelKey: "admin.nav.certificates", href: "/admin/certificates", icon: Award, requiredRole: "admin", capability: "available", description: "TLS certificates and automated issuance", descriptionKey: "admin.navDesc.certificates" },
    { label: "mTLS & Private CA", labelKey: "admin.nav.mtlsCertificates", href: "/admin/mtls", icon: Shield, requiredRole: "admin", capability: "available", description: "Mutual TLS and private certificates", descriptionKey: "admin.navDesc.mtlsCertificates" },
    { label: "Security Headers", labelKey: "admin.nav.security", href: "/admin/security", icon: Shield, requiredRole: "admin", capability: "available", description: "Security headers and per-domain policies", descriptionKey: "admin.navDesc.security" },
    { label: "Webhooks", labelKey: "admin.nav.webhooks", href: "/admin/webhooks", icon: Globe, requiredRole: "admin", capability: "available", description: "Event delivery and webhook endpoints", descriptionKey: "admin.navDesc.webhooks" },
    { label: "ACME Accounts", labelKey: "admin.nav.acme", href: "/admin/acme", icon: Award, requiredRole: "admin", capability: "available", description: "ACME accounts and DNS credentials", descriptionKey: "admin.navDesc.acme" },
  ]},
  { title: "Platform Automation", titleKey: "admin.navGroup.platformAutomation", items: [
    { label: "Service Definitions", labelKey: "admin.nav.nestsEggs", href: "/admin/nests", icon: Box, requiredRole: "admin", capability: "available", description: "Reusable server blueprints and templates", descriptionKey: "admin.navDesc.nestsEggs" },
    { label: "App Blueprints", labelKey: "admin.nav.appTemplates", href: "/admin/app-templates", icon: Layout, requiredRole: "admin", capability: "available", description: "Application deployment blueprints", descriptionKey: "admin.navDesc.appTemplates" },
    { label: "Legacy Templates", labelKey: "admin.nav.compatibilityTemplates", href: "/admin/templates", icon: Box, requiredRole: "admin", capability: "available", description: "Legacy compatibility templates", descriptionKey: "admin.navDesc.compatibilityTemplates" },
    { label: "Plugins", labelKey: "admin.nav.plugins", href: "/admin/plugins", icon: Plug, requiredRole: "admin", capability: "metadata-only", description: "Extensions and marketplace plugins", descriptionKey: "admin.navDesc.plugins" },
    { label: "Catalog", labelKey: "admin.nav.catalog", href: "/admin/catalog", icon: Library, requiredRole: "admin", capability: "available", description: "One-click service catalog and provisioning", descriptionKey: "admin.navDesc.catalog" },
    { label: "Forgefile", labelKey: "admin.nav.forgefile", href: "/admin/forgefile", icon: FileText, requiredRole: "admin", capability: "available", description: "Env-as-code forgefile validate & apply", descriptionKey: "admin.navDesc.forgefile" },
    { label: "Onboarding", labelKey: "admin.nav.onboarding", href: "/admin/onboarding", icon: Workflow, requiredRole: "admin", capability: "available", description: "Guided onboarding — repos, connect & deploy", descriptionKey: "admin.navDesc.onboarding" },
    { label: "Env Affinity", labelKey: "admin.nav.envAffinity", href: "/admin/env-affinity", icon: Network, requiredRole: "admin", capability: "available", description: "Placement explain / enrich & constraints", descriptionKey: "admin.navDesc.envAffinity" },
    { label: "Node Autoscaler", labelKey: "admin.nav.nodeAutoscaler", href: "/admin/node-autoscaler", icon: Scale, requiredRole: "admin", capability: "available", description: "Cloud node autoscale policies & events", descriptionKey: "admin.navDesc.nodeAutoscaler" },
    { label: "Procedures", labelKey: "admin.nav.procedures", href: "/admin/procedures", icon: Workflow, requiredRole: "admin", capability: "available", description: "Workflow procedures, schedules & executions", descriptionKey: "admin.navDesc.procedures" },
    { label: "Zero Downtime", labelKey: "admin.nav.zeroDowntime", href: "/admin/zerodowntime", icon: ShieldCheck, requiredRole: "admin", capability: "available", description: "Zero-downtime releases & health gates", descriptionKey: "admin.navDesc.zeroDowntime" },
    { label: "API Keys", labelKey: "admin.nav.apiKeys", href: "/admin/api", icon: KeyRound, requiredRole: "admin", capability: "available", description: "API keys and programmatic access", descriptionKey: "admin.navDesc.apiKeys" },
    { label: "Platform Settings", labelKey: "admin.nav.settings", href: "/admin/settings", icon: SlidersHorizontal, requiredRole: "admin", capability: "available", description: "Global platform configuration", descriptionKey: "admin.navDesc.settings" },
    { label: "Mail", labelKey: "admin.nav.mail", href: "/admin/mail", icon: Mail, requiredRole: "admin", capability: "available", description: "SMTP mail settings & triggers", descriptionKey: "admin.navDesc.mail" },
    { label: "Notifications", labelKey: "admin.nav.notifications", href: "/admin/notifications", icon: Bell, requiredRole: "admin", capability: "available", description: "Channels, alerts and delivery logs", descriptionKey: "admin.navDesc.notifications" },
    { label: "Placement Scheduler", labelKey: "admin.nav.scheduler", href: "/admin/scheduler", icon: BarChart3, requiredRole: "admin", capability: "available", description: "Placement scoring and affinity rules", descriptionKey: "admin.navDesc.scheduler" },
    { label: "Auto Scaling", labelKey: "admin.nav.autoScaler", href: "/admin/autoscaler", icon: Scale, requiredRole: "admin", capability: "available", description: "Automatic scaling policies", descriptionKey: "admin.navDesc.autoScaler" },
    { label: "Failover", labelKey: "admin.nav.failover", href: "/admin/failover", icon: Bug, requiredRole: "admin", capability: "available", description: "Automatic failover and recovery", descriptionKey: "admin.navDesc.failover" },
    { label: "Billing", labelKey: "admin.nav.billing", href: "/admin/billing", icon: CreditCard, requiredRole: "admin", capability: "available", description: "Billing plans, org quotas and usage metering", descriptionKey: "admin.navDesc.billing" },
  ]},
];

/** Invisible/demo alias routes that redirect but should not appear as duplicate nav items. */
export const ADMIN_ALIAS_ROUTES: Record<string, string> = {
  "/admin/containers": "/admin/docker",
  "/admin/logs": "/admin/activity",
};

function resolveAlias(pathname: string): string {
  return ADMIN_ALIAS_ROUTES[pathname] ?? pathname;
}

export function adminPagesForRole(role?: string): AdminNavGroup[] {
  return adminPageRegistry.map((group) => ({ ...group, items: group.items.filter((item) => role === item.requiredRole) })).filter((group) => group.items.length > 0);
}

export function findAdminPage(pathname: string): AdminNavEntry | undefined {
  const resolved = resolveAlias(pathname);
  return adminPageRegistry.flatMap((group) => group.items)
    .filter((item) => resolved === item.href || resolved.startsWith(`${item.href}/`))
    .sort((left, right) => right.href.length - left.href.length)[0];
}
