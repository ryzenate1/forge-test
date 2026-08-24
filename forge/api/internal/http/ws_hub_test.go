package http

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"gamepanel/forge/internal/events"
	"gamepanel/forge/internal/models"

	"github.com/gofiber/fiber/v2"
)

func httptestNewGetRequest(target string) *http.Request {
	return httptest.NewRequest(http.MethodGet, target, nil)
}

func serverEvent(id string) events.Envelope {
	return events.Envelope{
		ID:           id,
		Type:         events.EventServerStopped,
		Timestamp:    time.Now().UTC(),
		Source:       "test",
		ResourceType: "server",
		ResourceID:   "srv-1",
		Payload:      map[string]any{},
	}
}

func TestWSHub_FanoutToSameUser(t *testing.T) {
	hub := newWSHub(func(_ context.Context, ev events.Envelope) []string {
		return []string{"user-1"}
	}, 50)

	a := hub.Subscribe("user-1", "user", "")
	b := hub.Subscribe("user-1", "user", "")
	other := hub.Subscribe("user-2", "user", "")
	defer func() {
		hub.Unsubscribe(a)
		hub.Unsubscribe(b)
		hub.Unsubscribe(other)
	}()

	if err := hub.Handle(context.Background(), serverEvent("ev-1")); err != nil {
		t.Fatalf("Handle: %v", err)
	}

	for name, sub := range map[string]*hubSubscription{"a": a, "b": b} {
		select {
		case ev := <-sub.Outbox():
			if ev.ID != "ev-1" {
				t.Fatalf("%s got event %q", name, ev.ID)
			}
		case <-time.After(time.Second):
			t.Fatalf("%s did not receive fanout event", name)
		}
	}
	select {
	case ev := <-other.Outbox():
		t.Fatalf("unrelated user received event %q", ev.ID)
	default:
	}
}

func TestWSHub_AdminReceivesUnmappedEvents(t *testing.T) {
	hub := newWSHub(func(_ context.Context, _ events.Envelope) []string {
		return nil
	}, 50)
	admin := hub.Subscribe("admin-1", "admin", "")
	user := hub.Subscribe("user-1", "user", "")
	defer func() {
		hub.Unsubscribe(admin)
		hub.Unsubscribe(user)
	}()

	ev := serverEvent("ev-node")
	ev.Type = events.EventNodeOffline // not in hubEventTypes → dropped entirely
	if err := hub.Handle(context.Background(), ev); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	select {
	case e := <-admin.Outbox():
		t.Fatalf("non-whitelisted event delivered: %q", e.ID)
	default:
	}

	ev.Type = events.EventServerBackupCreated
	ev.Payload = map[string]any{"backupName": "nightly"}
	if err := hub.Handle(context.Background(), ev); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	select {
	case <-admin.Outbox():
	case <-time.After(time.Second):
		t.Fatal("admin should receive whitelisted events even without user mapping")
	}
	select {
	case e := <-user.Outbox():
		t.Fatalf("non-admin should not receive unmapped event %q", e.ID)
	default:
	}
}

func TestWSHub_DropOldestWhenOutboxFull(t *testing.T) {
	hub := newWSHub(func(_ context.Context, _ events.Envelope) []string {
		return []string{"user-1"}
	}, 10)

	sub := hub.Subscribe("user-1", "user", "")
	defer hub.Unsubscribe(sub)

	for i := 0; i < perUserOutboxCapacity+25; i++ {
		if err := hub.Handle(context.Background(), serverEvent("ev-"+strings.Repeat("x", 1)+time.Now().Format("150405.000000000")+string(rune('a'+i%26))+strconvItoa(i))); err != nil {
			t.Fatalf("Handle: %v", err)
		}
	}

	dropped := sub.Dropped()
	if dropped == 0 {
		t.Fatal("expected oldest envelopes to be dropped once outbox filled")
	}
	if dropped > 25 {
		t.Fatalf("dropped = %d, want <= 25 (capacity+incoming overflow)", dropped)
	}
	// Outbox still holds exactly capacity items and remains consumable.
	count := 0
	consuming := true
	for consuming {
		select {
		case <-sub.Outbox():
			count++
		default:
			consuming = false
		}
	}
	if count != perUserOutboxCapacity {
		t.Fatalf("outbox len = %d, want %d", count, perUserOutboxCapacity)
	}
}

// strconvItoa is a tiny local helper to avoid importing strconv twice in the
// drop test's synthetic IDs.
func strconvItoa(i int) string {
	if i == 0 {
		return "0"
	}
	var buf [20]byte
	pos := len(buf)
	for i > 0 {
		pos--
		buf[pos] = byte('0' + i%10)
		i /= 10
	}
	return string(buf[pos:])
}

func TestWSHub_UnsubscribeStopsDelivery(t *testing.T) {
	hub := newWSHub(func(_ context.Context, _ events.Envelope) []string {
		return []string{"user-1"}
	}, 10)
	sub := hub.Subscribe("user-1", "user", "")
	hub.Unsubscribe(sub)
	hub.Unsubscribe(sub) // idempotent

	if err := hub.Handle(context.Background(), serverEvent("ev-after")); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	select {
	case ev := <-sub.Outbox():
		t.Fatalf("closed subscription received %q", ev.ID)
	default:
	}
	select {
	case <-sub.Done():
	default:
		t.Fatal("Done should be closed after Unsubscribe")
	}
}

func TestWSHub_PublishUserNotificationExplicitRecipientOnly(t *testing.T) {
	hub := newWSHub(func(_ context.Context, _ events.Envelope) []string {
		return nil
	}, 50)
	owner := hub.Subscribe("user-1", "user", "")
	admin := hub.Subscribe("admin-1", "admin", "")
	other := hub.Subscribe("user-2", "user", "")
	defer func() {
		hub.Unsubscribe(owner)
		hub.Unsubscribe(admin)
		hub.Unsubscribe(other)
	}()

	row := models.Notification{
		UUIDModel: models.UUIDModel{ID: "notif-1"},
		UserID:    "user-1",
		Type:      "ServerBackupCreated",
		Title:     "backup.complete",
	}
	hub.PublishUserNotification("user-1", row)

	select {
	case ev := <-owner.Outbox():
		got, ok := notificationRowFromEnvelope(ev)
		if !ok || got.ID != "notif-1" {
			t.Fatalf("owner push missing row: ok=%v id=%q", ok, ev.ID)
		}
	case <-time.After(time.Second):
		t.Fatal("owner did not receive pushed notification")
	}
	for name, sub := range map[string]*hubSubscription{"admin": admin, "other": other} {
		select {
		case ev := <-sub.Outbox():
			t.Fatalf("%s received another user's notification %q", name, ev.ID)
		default:
		}
	}

	// Stopped hub must not deliver.
	hub.Stop()
	hub.PublishUserNotification("user-1", row)
	select {
	case ev := <-owner.Outbox():
		t.Fatalf("stopped hub delivered %q", ev.ID)
	default:
	}
}

func TestWSUpgraderOrigins(t *testing.T) {
	cases := []struct {
		name    string
		allowed []string
		want    []string
	}{
		{"wildcard preserved", []string{"*"}, []string{"*"}},
		{"wildcard among entries", []string{"https://panel.example.com", "*"}, []string{"*"}},
		{"empty list permits only missing-origin", []string{}, []string{""}},
		{"entries prefixed with missing-origin", []string{"https://panel.example.com"}, []string{"", "https://panel.example.com"}},
	}
	for _, tc := range cases {
		got := wsUpgraderOrigins(tc.allowed)
		if len(got) != len(tc.want) {
			t.Fatalf("%s: got %v want %v", tc.name, got, tc.want)
		}
		for i := range got {
			if got[i] != tc.want[i] {
				t.Fatalf("%s: got %v want %v", tc.name, got, tc.want)
			}
		}
	}
}

func TestNotificationWebSocketUpgrade_RejectsDisallowedOrigin(t *testing.T) {
	t.Setenv("PANEL_URL", "https://panel.example.com")
	t.Setenv("API_WS_ALLOWED_ORIGINS", "https://panel.example.com")
	cfg := Config{
		AppEnv:     "development",
		AuthSecret: "secret",
		CORSConfig: CORSConfig{AllowedOrigins: []string{"https://panel.example.com"}},
	}
	app := fiber.New(fiber.Config{DisableStartupMessage: true})
	app.Get("/notifications/ws", handleNotificationWebSocket(nil, cfg))

	// Disallowed Origin must be rejected before any upgrade happens.
	req := httptestNewGetRequest("/notifications/ws")
	req.Header.Set("Origin", "https://evil.example.com")
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Sec-WebSocket-Version", "13")
	req.Header.Set("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ==")
	res, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != fiber.StatusForbidden {
		t.Fatalf("status = %d, want 403 for disallowed origin", res.StatusCode)
	}
}

func TestNotificationWSHandler_OriginRejectedAtRouteMiddleware(t *testing.T) {
	t.Setenv("PANEL_URL", "https://panel.example.com")
	t.Setenv("API_WS_ALLOWED_ORIGINS", "https://panel.example.com")
	cfg := Config{
		AppEnv:     "development",
		AuthSecret: "secret",
		CORSConfig: CORSConfig{AllowedOrigins: []string{"https://panel.example.com"}},
	}
	app := fiber.New(fiber.Config{DisableStartupMessage: true})
	protected := app.Group("/", func(c *fiber.Ctx) error { return c.Next() })
	registerEnhancedNotificationRoutes(protected, cfg, nil, func(c *fiber.Ctx) error { return c.Next() })

	req := httptestNewGetRequest("/notifications/ws")
	req.Header.Set("Origin", "https://evil.example.com")
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Sec-WebSocket-Version", "13")
	req.Header.Set("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ==")
	res, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != fiber.StatusForbidden {
		t.Fatalf("status = %d, want 403 for disallowed origin on registered route", res.StatusCode)
	}
}
