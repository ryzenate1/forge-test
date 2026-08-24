package placement

import (
	"context"
	"testing"
)

func TestSpreadEvenAcrossNodes(t *testing.T) {
	engine := NewEngine(&LeastLoadedScorer{}, NewConstraintChecker())
	candidates := []Candidate{
		{NodeID: "node-1", RegionID: "us-east", TotalMemory: 16384, TotalCPU: 8000, TotalDisk: 200000, AvailableMemory: 16384, AvailableCPU: 8000, AvailableDisk: 200000, ServerCount: 0},
		{NodeID: "node-2", RegionID: "us-east", TotalMemory: 16384, TotalCPU: 8000, TotalDisk: 200000, AvailableMemory: 16384, AvailableCPU: 8000, AvailableDisk: 200000, ServerCount: 0},
		{NodeID: "node-3", RegionID: "us-east", TotalMemory: 16384, TotalCPU: 8000, TotalDisk: 200000, AvailableMemory: 16384, AvailableCPU: 8000, AvailableDisk: 200000, ServerCount: 0},
	}
	replicas := make([]ReplicaSpec, 6)
	for i := 0; i < 6; i++ {
		replicas[i] = ReplicaSpec{Index: i, CPU: 100, MemoryMB: 512, DiskMB: 1000}
	}
	req := ReplicaPlacementRequest{
		AppID:    "app-1",
		Replicas: replicas,
		Spread:   &SpreadConfig{Attribute: "node", Weight: 100},
	}
	result, err := engine.PlaceReplicas(context.Background(), candidates, req)
	if err != nil {
		t.Fatalf("even spread err: %v", err)
	}
	if len(result.Placements) != 6 {
		t.Fatalf("expected 6 placements, got %d failures %d", len(result.Placements), len(result.Failures))
	}
	counts := map[string]int{}
	for _, p := range result.Placements {
		counts[p.NodeID]++
		t.Logf("idx %d -> %s score %.3f %v", p.Index, p.NodeID, p.Score, p.Reasons)
	}
	t.Logf("counts %v", counts)
	max, min := 0, 100
	for _, c := range counts {
		if c > max {
			max = c
		}
		if c < min {
			min = c
		}
	}
	if max-min > 1 {
		t.Errorf("even spread uneven max %d min %d counts %v", max, min, counts)
	}
}

func TestSpreadTargetAware(t *testing.T) {
	engine := NewEngine(&LeastLoadedScorer{}, NewConstraintChecker())
	candidates := []Candidate{
		{NodeID: "node-a", RegionID: "dc1", TotalMemory: 16384, TotalCPU: 8000, TotalDisk: 200000, AvailableMemory: 16384, AvailableCPU: 8000, AvailableDisk: 200000, ServerCount: 0},
		{NodeID: "node-b", RegionID: "dc1", TotalMemory: 16384, TotalCPU: 8000, TotalDisk: 200000, AvailableMemory: 16384, AvailableCPU: 8000, AvailableDisk: 200000, ServerCount: 0},
		{NodeID: "node-c", RegionID: "dc2", TotalMemory: 16384, TotalCPU: 8000, TotalDisk: 200000, AvailableMemory: 16384, AvailableCPU: 8000, AvailableDisk: 200000, ServerCount: 0},
		{NodeID: "node-d", RegionID: "dc2", TotalMemory: 16384, TotalCPU: 8000, TotalDisk: 200000, AvailableMemory: 16384, AvailableCPU: 8000, AvailableDisk: 200000, ServerCount: 0},
	}
	replicas := make([]ReplicaSpec, 4)
	for i := 0; i < 4; i++ {
		replicas[i] = ReplicaSpec{Index: i, CPU: 100, MemoryMB: 512, DiskMB: 1000}
	}
	req := ReplicaPlacementRequest{
		AppID:    "app-2",
		Replicas: replicas,
		Spread:   &SpreadConfig{Attribute: "region", Weight: 100, Targets: []SpreadTarget{{Value: "dc1", Percent: 50}, {Value: "dc2", Percent: 50}}},
	}
	result, err := engine.PlaceReplicas(context.Background(), candidates, req)
	if err != nil {
		t.Fatalf("target spread err: %v", err)
	}
	regionCounts := map[string]int{}
	nodeToRegion := map[string]string{"node-a": "dc1", "node-b": "dc1", "node-c": "dc2", "node-d": "dc2"}
	for _, p := range result.Placements {
		regionCounts[nodeToRegion[p.NodeID]]++
		t.Logf("idx %d -> %s (%s) score %.3f", p.Index, p.NodeID, nodeToRegion[p.NodeID], p.Score)
	}
	t.Logf("region counts %v", regionCounts)
	if regionCounts["dc1"] != 2 || regionCounts["dc2"] != 2 {
		t.Errorf("target spread not 50/50 got %v", regionCounts)
	}
}

func TestSpreadFallback(t *testing.T) {
	engine := NewEngine(&LeastLoadedScorer{}, NewConstraintChecker())
	candidates := []Candidate{
		{NodeID: "node-1", RegionID: "us-east", TotalMemory: 16384, TotalCPU: 8000, TotalDisk: 200000, AvailableMemory: 16384, AvailableCPU: 8000, AvailableDisk: 200000, ServerCount: 0},
		{NodeID: "node-2", RegionID: "us-east", TotalMemory: 16384, TotalCPU: 8000, TotalDisk: 200000, AvailableMemory: 16384, AvailableCPU: 8000, AvailableDisk: 200000, ServerCount: 0},
		{NodeID: "node-3", RegionID: "us-east", TotalMemory: 16384, TotalCPU: 8000, TotalDisk: 200000, AvailableMemory: 16384, AvailableCPU: 8000, AvailableDisk: 200000, ServerCount: 0},
	}
	replicas := make([]ReplicaSpec, 3)
	for i := 0; i < 3; i++ {
		replicas[i] = ReplicaSpec{Index: i, CPU: 100, MemoryMB: 512, DiskMB: 1000}
	}
	req := ReplicaPlacementRequest{AppID: "app-3", Replicas: replicas}
	result, err := engine.PlaceReplicas(context.Background(), candidates, req)
	if err != nil {
		t.Fatalf("fallback err %v", err)
	}
	if len(result.Placements) != 3 {
		t.Fatalf("expected 3 placements got %d", len(result.Placements))
	}
	for _, p := range result.Placements {
		t.Logf("%d -> %s score %.3f", p.Index, p.NodeID, p.Score)
	}
}

func TestSpreadScorerEven(t *testing.T) {
	scorer := NewSpreadScorer(&SpreadConfig{Attribute: "region", Weight: 100})
	cands := []Candidate{
		{NodeID: "n1", RegionID: "dc1", ServerCount: 0, AvailableCPU: 8000, AvailableMemory: 16384, AvailableDisk: 200000, TotalCPU: 8000, TotalMemory: 16384, TotalDisk: 200000},
		{NodeID: "n2", RegionID: "dc2", ServerCount: 0, AvailableCPU: 8000, AvailableMemory: 16384, AvailableDisk: 200000, TotalCPU: 8000, TotalMemory: 16384, TotalDisk: 200000},
	}
	ctx := context.Background()
	s1, _, _ := scorer.Score(ctx, cands[0], WorkloadRequest{Spread: &SpreadConfig{Attribute: "region", Weight: 100}, SpreadCounts: map[string]int{"dc1": 2, "dc2": 0}, SpreadTotal: 4})
	s2, _, _ := scorer.Score(ctx, cands[1], WorkloadRequest{Spread: &SpreadConfig{Attribute: "region", Weight: 100}, SpreadCounts: map[string]int{"dc1": 2, "dc2": 0}, SpreadTotal: 4})
	t.Logf("dc1 score %.3f dc2 score %.3f", s1, s2)
	if s2 <= s1 {
		t.Errorf("expected dc2 higher than dc1")
	}
}

func TestSpreadImplicitStar(t *testing.T) {
	// Verify implicit "*" bucket gets remaining percent
	cfg := &SpreadConfig{Attribute: "region", Weight: 100, Targets: []SpreadTarget{{Value: "dc1", Percent: 60}}}
	desired := desiredCountsForSpread(cfg, 10)
	if desired["dc1"] != 6 {
		t.Errorf("dc1 desired 6 got %v", desired["dc1"])
	}
	if desired["*"] != 4 {
		t.Errorf("implicit * desired 4 got %v", desired["*"])
	}
}
