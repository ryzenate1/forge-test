package daemon

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

func (c *Client) KubernetesPods(ctx context.Context, baseURL, nodeToken string) ([]map[string]any, error) {
	url := strings.TrimRight(baseURL, "/") + "/kubernetes/pods"
	req, err := c.newRequest(ctx, nodeToken, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	res, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
		return nil, fmt.Errorf("kubernetes pods: status %d: %s", res.StatusCode, strings.TrimSpace(string(b)))
	}
	var payload struct {
		Pods []map[string]any `json:"pods"`
	}
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return nil, err
	}
	return payload.Pods, nil
}

func (c *Client) KubernetesDeployments(ctx context.Context, baseURL, nodeToken string) ([]map[string]any, error) {
	url := strings.TrimRight(baseURL, "/") + "/kubernetes/deployments"
	req, err := c.newRequest(ctx, nodeToken, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	res, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
		return nil, fmt.Errorf("kubernetes deployments: status %d: %s", res.StatusCode, strings.TrimSpace(string(b)))
	}
	var payload struct {
		Deployments []map[string]any `json:"deployments"`
	}
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return nil, err
	}
	return payload.Deployments, nil
}

func (c *Client) KubernetesServices(ctx context.Context, baseURL, nodeToken string) ([]map[string]any, error) {
	url := strings.TrimRight(baseURL, "/") + "/kubernetes/services"
	req, err := c.newRequest(ctx, nodeToken, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	res, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
		return nil, fmt.Errorf("kubernetes services: status %d: %s", res.StatusCode, strings.TrimSpace(string(b)))
	}
	var payload struct {
		Services []map[string]any `json:"services"`
	}
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return nil, err
	}
	return payload.Services, nil
}

func (c *Client) KubernetesEvents(ctx context.Context, baseURL, nodeToken string) ([]map[string]any, error) {
	url := strings.TrimRight(baseURL, "/") + "/kubernetes/events"
	req, err := c.newRequest(ctx, nodeToken, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	res, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
		return nil, fmt.Errorf("kubernetes events: status %d: %s", res.StatusCode, strings.TrimSpace(string(b)))
	}
	var payload struct {
		Events []map[string]any `json:"events"`
	}
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return nil, err
	}
	return payload.Events, nil
}

func (c *Client) KubernetesScale(ctx context.Context, baseURL, nodeToken, deployment string, replicas int32) error {
	url := strings.TrimRight(baseURL, "/") + "/kubernetes/deployments/" + deployment + "/scale"
	body, _ := json.Marshal(map[string]any{"replicas": replicas})
	req, err := c.newRequest(ctx, nodeToken, http.MethodPost, url, body)
	if err != nil {
		return err
	}
	res, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
		return fmt.Errorf("kubernetes scale: status %d: %s", res.StatusCode, strings.TrimSpace(string(b)))
	}
	return nil
}
