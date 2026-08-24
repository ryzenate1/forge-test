package http

import (
	"github.com/gofiber/fiber/v2"
)

func registerKubernetesRoutes(protected fiber.Router, cfg Config, adminIPAccess fiber.Handler) {
	ks := protected.Group("/admin/kubernetes", adminIPAccess)
	ks.Get("/nodes", requireRole("admin"), func(c *fiber.Ctx) error { return listKubernetesNodes(c, cfg) })
	ks.Get("/pods", requireRole("admin"), func(c *fiber.Ctx) error { return kubernetesPods(c, cfg) })
	ks.Get("/deployments", requireRole("admin"), func(c *fiber.Ctx) error { return kubernetesDeployments(c, cfg) })
	ks.Get("/services", requireRole("admin"), func(c *fiber.Ctx) error { return kubernetesServices(c, cfg) })
	ks.Get("/events", requireRole("admin"), func(c *fiber.Ctx) error { return kubernetesEvents(c, cfg) })
	ks.Post("/deployments/:name/scale", requireRole("admin"), func(c *fiber.Ctx) error { return kubernetesScale(c, cfg) })
}

func listKubernetesNodes(c *fiber.Ctx, cfg Config) error {
	if cfg.Store == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "store unavailable")
	}
	ctx, cancel := requestContext()
	defer cancel()
	nodes, err := cfg.Store.ListNodes(ctx)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	var k8sNodes []fiber.Map
	for _, n := range nodes {
		if n.RuntimeProvider == "kubernetes" || n.RuntimeProvider == "k8s" {
			k8sNodes = append(k8sNodes, fiber.Map{
				"id": n.ID, "name": n.Name, "baseUrl": n.BaseURL, "runtimeProvider": n.RuntimeProvider,
				"runtimeStatus": n.RuntimeStatus, "status": n.Status, "regionId": n.RegionID,
			})
		}
	}
	if k8sNodes == nil {
		k8sNodes = []fiber.Map{}
	}
	return c.JSON(fiber.Map{"nodes": k8sNodes})
}

func resolveKubernetesDaemonTarget(c *fiber.Ctx, cfg Config) (string, string, error) {
	nodeID := c.Query("nodeId")
	if nodeID == "" {
		nodeID = c.Query("node_id")
	}
	if cfg.Store == nil {
		return "", "", fiber.NewError(fiber.StatusServiceUnavailable, "store unavailable")
	}
	ctx, cancel := requestContext()
	defer cancel()
	if nodeID != "" {
		n, err := cfg.Store.GetNode(ctx, nodeID)
		if err != nil {
			return "", "", fiber.NewError(fiber.StatusNotFound, "node not found")
		}
		if n.RuntimeProvider != "kubernetes" && n.RuntimeProvider != "k8s" {
			return "", "", fiber.NewError(fiber.StatusBadRequest, "node is not a kubernetes node (runtime="+n.RuntimeProvider+")")
		}
		if n.BaseURL != "" {
			return n.BaseURL, "", nil
		}
		servers, err := cfg.Store.ListServersForNode(ctx, n.ID)
		if err != nil || len(servers) == 0 {
			return "", "", fiber.NewError(fiber.StatusBadGateway, "cannot resolve node daemon target: no servers on node")
		}
		target, err := cfg.Store.ServerControlTarget(ctx, servers[0].ID)
		if err != nil {
			return "", "", fiber.NewError(fiber.StatusBadGateway, "cannot resolve node daemon target: "+err.Error())
		}
		return target.NodeURL, target.NodeToken, nil
	}
	all, err := cfg.Store.ListNodes(ctx)
	if err != nil {
		return "", "", err
	}
	for _, n := range all {
		if n.RuntimeProvider == "kubernetes" || n.RuntimeProvider == "k8s" {
			if n.BaseURL != "" {
				return n.BaseURL, "", nil
			}
			servers, err := cfg.Store.ListServersForNode(ctx, n.ID)
			if err != nil || len(servers) == 0 {
				continue
			}
			target, err := cfg.Store.ServerControlTarget(ctx, servers[0].ID)
			if err == nil {
				return target.NodeURL, target.NodeToken, nil
			}
		}
	}
	return "", "", fiber.NewError(fiber.StatusNotFound, "no kubernetes nodes available; add a node with runtime=kubernetes")
}

func kubernetesPods(c *fiber.Ctx, cfg Config) error {
	if cfg.Daemon == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "daemon client unavailable")
	}
	baseURL, token, err := resolveKubernetesDaemonTarget(c, cfg)
	if err != nil {
		return err
	}
	ctx, cancel := longRequestContext()
	defer cancel()
	pods, err := cfg.Daemon.KubernetesPods(ctx, baseURL, token)
	if err != nil {
		return fiber.NewError(fiber.StatusBadGateway, err.Error())
	}
	return c.JSON(fiber.Map{"pods": pods})
}

func kubernetesDeployments(c *fiber.Ctx, cfg Config) error {
	if cfg.Daemon == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "daemon client unavailable")
	}
	baseURL, token, err := resolveKubernetesDaemonTarget(c, cfg)
	if err != nil {
		return err
	}
	ctx, cancel := longRequestContext()
	defer cancel()
	deps, err := cfg.Daemon.KubernetesDeployments(ctx, baseURL, token)
	if err != nil {
		return fiber.NewError(fiber.StatusBadGateway, err.Error())
	}
	return c.JSON(fiber.Map{"deployments": deps})
}

func kubernetesServices(c *fiber.Ctx, cfg Config) error {
	if cfg.Daemon == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "daemon client unavailable")
	}
	baseURL, token, err := resolveKubernetesDaemonTarget(c, cfg)
	if err != nil {
		return err
	}
	ctx, cancel := longRequestContext()
	defer cancel()
	svcs, err := cfg.Daemon.KubernetesServices(ctx, baseURL, token)
	if err != nil {
		return fiber.NewError(fiber.StatusBadGateway, err.Error())
	}
	return c.JSON(fiber.Map{"services": svcs})
}

func kubernetesEvents(c *fiber.Ctx, cfg Config) error {
	if cfg.Daemon == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "daemon client unavailable")
	}
	baseURL, token, err := resolveKubernetesDaemonTarget(c, cfg)
	if err != nil {
		return err
	}
	ctx, cancel := longRequestContext()
	defer cancel()
	events, err := cfg.Daemon.KubernetesEvents(ctx, baseURL, token)
	if err != nil {
		return fiber.NewError(fiber.StatusBadGateway, err.Error())
	}
	return c.JSON(fiber.Map{"events": events})
}

func kubernetesScale(c *fiber.Ctx, cfg Config) error {
	if cfg.Daemon == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "daemon client unavailable")
	}
	name := c.Params("name")
	if name == "" {
		return fiber.NewError(fiber.StatusBadRequest, "deployment name required")
	}
	var body struct {
		Replicas int32 `json:"replicas"`
	}
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	baseURL, token, err := resolveKubernetesDaemonTarget(c, cfg)
	if err != nil {
		return err
	}
	ctx, cancel := longRequestContext()
	defer cancel()
	if err := cfg.Daemon.KubernetesScale(ctx, baseURL, token, name, body.Replicas); err != nil {
		return fiber.NewError(fiber.StatusBadGateway, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true, "deployment": name, "replicas": body.Replicas})
}
