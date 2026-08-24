import type { QueryClient } from "@tanstack/react-query";

/**
 * Central queryKeyFactory for stale query keys.
 * Ensures consistent keys for servers, nodes, backups, domains
 * so invalidation covers all variants (e.g. ["nodes"] and ["nodes","all"]).
 */
export const queryKeys = {
  servers: {
    all: ["servers"] as const,
    lists: () => [...queryKeys.servers.all] as const,
    allLists: () => [...queryKeys.servers.all, "all"] as const,
    detail: (id: string) => [...queryKeys.servers.all, "detail", id] as const,
    page: (page: number, perPage: number) => [...queryKeys.servers.all, "page", page, perPage] as const,
  },
  nodes: {
    all: ["nodes"] as const,
    /** Base list key ["nodes"] */
    lists: () => [...queryKeys.nodes.all] as const,
    /** Aggregated all-pages key ["nodes","all"] used by fetchAllNodes */
    allLists: () => [...queryKeys.nodes.all, "all"] as const,
    detail: (id: string) => [...queryKeys.nodes.all, "detail", id] as const,
    allocations: (nodeId: string) => [...queryKeys.nodes.all, "allocations", nodeId] as const,
    lifecycle: (nodeId: string) => [...queryKeys.nodes.all, "lifecycle", nodeId] as const,
    servers: (nodeId: string) => [...queryKeys.nodes.all, "servers", nodeId] as const,
  },
  backups: {
    all: ["backups"] as const,
    lists: () => [...queryKeys.backups.all] as const,
    byServer: (serverId: string) => [...queryKeys.backups.all, "server", serverId] as const,
    admin: {
      all: ["admin", "backups"] as const,
      configs: () => [...queryKeys.backups.admin.all, "configs"] as const,
      jobs: () => [...queryKeys.backups.admin.all, "jobs"] as const,
      artifacts: () => [...queryKeys.backups.admin.all, "artifacts"] as const,
      restores: () => [...queryKeys.backups.admin.all, "restores"] as const,
      status: () => [...queryKeys.backups.admin.all, "status"] as const,
    },
  },
  domains: {
    all: ["domains"] as const,
    lists: () => [...queryKeys.domains.all] as const,
    byServer: (serverId: string | "all") => [...queryKeys.domains.all, serverId] as const,
    detail: (id: string) => [...queryKeys.domains.all, "detail", id] as const,
  },
} as const;

/**
 * Invalidate all node-related queries. Covers both ["nodes"] and ["nodes","all"]
 * because some views use fetchNodes (["nodes"]) and others use fetchAllNodes (["nodes","all"]).
 * A prefix invalidation on ["nodes"] already matches ["nodes","all"] unless exact:true,
 * but we invalidate both explicitly to avoid stale data when callers use exact:true.
 */
export function invalidateNodes(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.nodes.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.nodes.allLists() });
}

export function invalidateServers(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.servers.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.servers.allLists() });
}

export function invalidateBackups(queryClient: QueryClient, serverId?: string): void {
  if (serverId) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.backups.byServer(serverId) });
  }
  void queryClient.invalidateQueries({ queryKey: queryKeys.backups.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.backups.admin.all });
}

export function invalidateDomains(queryClient: QueryClient, serverId?: string): void {
  if (serverId) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.domains.byServer(serverId) });
  }
  void queryClient.invalidateQueries({ queryKey: queryKeys.domains.all });
}
