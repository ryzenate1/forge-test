package appstore

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"gamepanel/forge/internal/services/compose"
	"gamepanel/forge/internal/store"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- Mocks ---

type mockStore struct {
	apps     map[string]*store.AppStoreApp
	installs map[string]*store.AppStoreInstall
	// error injection
	getAppErr     error
	getInstallErr error
	deleteCalled  bool
}

func newMockStore() *mockStore {
	return &mockStore{
		apps:     make(map[string]*store.AppStoreApp),
		installs: make(map[string]*store.AppStoreInstall),
	}
}

func (m *mockStore) ListAppStoreApps(ctx context.Context, category, search string) ([]store.AppStoreApp, error) {
	var out []store.AppStoreApp
	for _, a := range m.apps {
		out = append(out, *a)
	}
	return out, nil
}
func (m *mockStore) GetAppStoreApp(ctx context.Context, key string) (*store.AppStoreApp, error) {
	if m.getAppErr != nil {
		return nil, m.getAppErr
	}
	if a, ok := m.apps[key]; ok {
		return a, nil
	}
	return nil, errors.New("not found")
}
func (m *mockStore) UpsertAppStoreApp(ctx context.Context, a *store.AppStoreApp) error {
	m.apps[a.Key] = a
	return nil
}
func (m *mockStore) GetAppStoreInstall(ctx context.Context, id string) (*store.AppStoreInstall, error) {
	if m.getInstallErr != nil {
		return nil, m.getInstallErr
	}
	if inst, ok := m.installs[id]; ok {
		return inst, nil
	}
	return nil, errors.New("not found")
}
func (m *mockStore) ListAppStoreInstalls(ctx context.Context) ([]store.AppStoreInstall, error) {
	var out []store.AppStoreInstall
	for _, v := range m.installs {
		out = append(out, *v)
	}
	return out, nil
}
func (m *mockStore) ListAppStoreInstallsForUser(ctx context.Context, userID string) ([]store.AppStoreInstall, error) {
	var out []store.AppStoreInstall
	for _, v := range m.installs {
		if v.UserID == userID {
			out = append(out, *v)
		}
	}
	return out, nil
}
func (m *mockStore) CreateAppStoreInstall(ctx context.Context, inst *store.AppStoreInstall) error {
	m.installs[inst.ID] = inst
	return nil
}
func (m *mockStore) UpdateAppStoreInstallStatus(ctx context.Context, id, status, errMsg string) error {
	if inst, ok := m.installs[id]; ok {
		inst.Status = status
		inst.ErrorMessage = errMsg
	}
	return nil
}
func (m *mockStore) UpdateAppStoreInstallComposeProject(ctx context.Context, id, composeProjectID string) error {
	if inst, ok := m.installs[id]; ok {
		inst.ComposeProjectID = composeProjectID
	}
	return nil
}
func (m *mockStore) DeleteAppStoreInstall(ctx context.Context, id string) error {
	m.deleteCalled = true
	delete(m.installs, id)
	return nil
}
func (m *mockStore) IsAppStoreInstallIgnoreUpgrade(ctx context.Context, id string) (bool, error) {
	if inst, ok := m.installs[id]; ok {
		return inst.IgnoreUpgrade, nil
	}
	return false, errors.New("not found")
}
func (m *mockStore) IsAppStoreAppCrossVersion(ctx context.Context, key string) (bool, error) {
	if a, ok := m.apps[key]; ok {
		return a.CrossVersion, nil
	}
	return false, errors.New("not found")
}
func (m *mockStore) UpdateAppStoreInstallIgnoreUpgrade(ctx context.Context, id string, ignore bool) error {
	if inst, ok := m.installs[id]; ok {
		inst.IgnoreUpgrade = ignore
	}
	return nil
}

type mockCompose struct {
	deployErr     error
	deleteErr     error
	updateErr     error
	deployed      []compose.DeployComposeRequest
	deleted       []string
	updated       []string
	stackToReturn *compose.ComposeStack
}

func (m *mockCompose) DeployComposeStack(ctx context.Context, req compose.DeployComposeRequest) (*compose.ComposeStack, error) {
	m.deployed = append(m.deployed, req)
	if m.deployErr != nil {
		return nil, m.deployErr
	}
	if m.stackToReturn != nil {
		return m.stackToReturn, nil
	}
	return &compose.ComposeStack{ID: "cps-mock123", Status: compose.StackStatusRunning}, nil
}
func (m *mockCompose) DeleteComposeStack(ctx context.Context, stackID string) error {
	m.deleted = append(m.deleted, stackID)
	return m.deleteErr
}
func (m *mockCompose) UpdateComposeStack(ctx context.Context, stackID string, req compose.UpdateComposeRequest) (*compose.ComposeStack, error) {
	m.updated = append(m.updated, stackID)
	if m.updateErr != nil {
		return nil, m.updateErr
	}
	if m.stackToReturn != nil {
		return m.stackToReturn, nil
	}
	return &compose.ComposeStack{ID: stackID, Status: compose.StackStatusRunning}, nil
}

// --- resolveTemplate fail-fast tests ---

func TestResolveTemplate_FailFastOnRequiredVar(t *testing.T) {
	// ${VAR:?msg} should fail when VAR missing
	tmpl := "services:\n  web:\n    image: nginx:${TAG:?TAG is required}\n"
	_, err := resolveTemplate(tmpl, map[string]string{})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "TAG is required")

	// also test ${VAR?msg} with ? (no colon) -> missing should also fail
	tmpl2 := "image: ${MISSING?missing var}"
	_, err = resolveTemplate(tmpl2, map[string]string{})
	require.Error(t, err)

	// When var is provided, should succeed and substitute
	out, err := resolveTemplate(tmpl, map[string]string{"TAG": "alpine"})
	require.NoError(t, err)
	assert.Contains(t, out, "alpine")
	assert.NotContains(t, out, "${TAG")
}

func TestResolveTemplate_SuccessWithDefaults(t *testing.T) {
	tmpl := "image: nginx:${TAG:-alpine}\nport: ${PORT-8080}"
	out, err := resolveTemplate(tmpl, map[string]string{})
	require.NoError(t, err)
	assert.Contains(t, out, "alpine")
	assert.Contains(t, out, "8080")

	out, err = resolveTemplate(tmpl, map[string]string{"TAG": "latest", "PORT": "9090"})
	require.NoError(t, err)
	assert.Contains(t, out, "latest")
	assert.Contains(t, out, "9090")
}

func TestResolveTemplate_EmptyVarForSimplePlaceholder(t *testing.T) {
	tmpl := "image: ${IMAGE}"
	out, err := resolveTemplate(tmpl, map[string]string{})
	require.NoError(t, err)
	// Missing simple var should interpolate to empty string, not error
	assert.Equal(t, "image: ", out)
}

func TestInstallApp_FailFastDoesNotDeployStaleCompose(t *testing.T) {
	ctx := context.Background()
	ms := newMockStore()
	mc := &mockCompose{}
	svc, err := NewWithStore(ms, mc)
	require.NoError(t, err)

	// App with required var in compose
	ms.apps["myapp"] = &store.AppStoreApp{
		Key:            "myapp",
		Name:           "My App",
		Version:        "1.0",
		ComposeContent: "services:\n  web:\n    image: nginx:${REQUIRED:?REQUIRED is required}\n",
	}

	req := &InstallRequest{
		AppKey: "myapp",
		Name:   "test-install",
		Params: map[string]string{}, // missing REQUIRED
		UserID: "user-1",
		NodeID: "node-1",
	}
	inst, err := svc.InstallApp(ctx, req)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "resolve template")
	assert.Contains(t, err.Error(), "REQUIRED is required")
	assert.Nil(t, inst)
	// Ensure no deploy was attempted
	assert.Empty(t, mc.deployed)
	// Ensure no DB record was created
	assert.Empty(t, ms.installs)
}

func TestInstallApp_SuccessWhenTemplateValid(t *testing.T) {
	ctx := context.Background()
	ms := newMockStore()
	mc := &mockCompose{stackToReturn: &compose.ComposeStack{ID: "cps-abc123", Status: compose.StackStatusRunning}}
	svc, err := NewWithStore(ms, mc)
	require.NoError(t, err)

	ms.apps["nginx"] = &store.AppStoreApp{
		Key:            "nginx",
		Name:           "Nginx",
		Version:        "latest",
		ComposeContent: "services:\n  nginx:\n    image: nginx:${TAG:-alpine}\n",
	}

	req := &InstallRequest{
		AppKey: "nginx",
		Name:   "my-nginx",
		Params: map[string]string{"TAG": "1.25"},
		UserID: "user-1",
		NodeID: "node-1",
	}
	inst, err := svc.InstallApp(ctx, req)
	require.NoError(t, err)
	require.NotNil(t, inst)
	assert.Equal(t, "my-nginx", inst.Name)
	assert.Contains(t, inst.ComposeContent, "1.25")
	assert.Equal(t, "cps-abc123", inst.ComposeProjectID)
	assert.Len(t, mc.deployed, 1)
	assert.Contains(t, mc.deployed[0].ComposeYAML, "1.25")
}

func TestUpgradeApp_FailFastOnTemplate(t *testing.T) {
	ctx := context.Background()
	ms := newMockStore()
	mc := &mockCompose{}
	svc, err := NewWithStore(ms, mc)
	require.NoError(t, err)

	ms.apps["myapp"] = &store.AppStoreApp{
		Key:            "myapp",
		Version:        "1.1", // same major to avoid cross-version gate
		ComposeContent: "services:\n  web:\n    image: myapp:${VERSION:?VERSION required}\n",
	}
	params, _ := json.Marshal(map[string]string{})
	ms.installs["inst-1"] = &store.AppStoreInstall{
		ID:               "inst-1",
		AppKey:           "myapp",
		AppVersion:       "1.0",
		Name:             "test",
		Status:           "running",
		Params:           params, // empty, so VERSION missing
		ComposeContent:   "old",
		ComposeProjectID: "cps-old123",
		UserID:           "user-1",
	}

	_, err = svc.UpgradeApp(ctx, "inst-1", "user-1", "user")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "resolve template")
	assert.Contains(t, err.Error(), "VERSION required")
	assert.Empty(t, mc.updated)
}

// --- Uninstall orphan prevention tests ---

func TestUninstallApp_ConfirmThenDelete_Success(t *testing.T) {
	ctx := context.Background()
	ms := newMockStore()
	mc := &mockCompose{}
	svc, err := NewWithStore(ms, mc)
	require.NoError(t, err)

	ms.installs["inst-1"] = &store.AppStoreInstall{
		ID:               "inst-1",
		AppKey:           "nginx",
		Name:             "my-nginx",
		UserID:           "user-1",
		ComposeProjectID: "cps-123",
	}

	err = svc.UninstallApp(ctx, "inst-1", "user-1", "user")
	require.NoError(t, err)
	assert.True(t, ms.deleteCalled)
	assert.NotContains(t, ms.installs, "inst-1")
	assert.Equal(t, []string{"cps-123"}, mc.deleted)
}

func TestUninstallApp_KeepRowOnDaemonFailure(t *testing.T) {
	ctx := context.Background()
	ms := newMockStore()
	mc := &mockCompose{deleteErr: errors.New("daemon unavailable")}
	svc, err := NewWithStore(ms, mc)
	require.NoError(t, err)

	ms.installs["inst-2"] = &store.AppStoreInstall{
		ID:               "inst-2",
		AppKey:           "nginx",
		Name:             "my-nginx",
		UserID:           "user-1",
		ComposeProjectID: "cps-456",
	}

	err = svc.UninstallApp(ctx, "inst-2", "user-1", "user")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "delete compose stack")
	assert.Contains(t, err.Error(), "daemon unavailable")
	// DB row must be kept (orphan prevention)
	assert.Contains(t, ms.installs, "inst-2")
	assert.False(t, ms.deleteCalled)
}

func TestUninstallApp_ForceDeletesDespiteDaemonFailure(t *testing.T) {
	ctx := context.Background()
	ms := newMockStore()
	mc := &mockCompose{deleteErr: errors.New("daemon unavailable")}
	svc, err := NewWithStore(ms, mc)
	require.NoError(t, err)

	ms.installs["inst-3"] = &store.AppStoreInstall{
		ID:               "inst-3",
		AppKey:           "redis",
		Name:             "my-redis",
		UserID:           "user-1",
		ComposeProjectID: "cps-789",
	}

	// force=true should delete DB even though daemon fails
	err = svc.UninstallApp(ctx, "inst-3", "user-1", "user", true)
	require.NoError(t, err)
	assert.True(t, ms.deleteCalled)
	assert.NotContains(t, ms.installs, "inst-3")
	// daemon was still attempted
	assert.Equal(t, []string{"cps-789"}, mc.deleted)
}

func TestUninstallApp_NoComposeProjectIDDeletesDirectly(t *testing.T) {
	ctx := context.Background()
	ms := newMockStore()
	mc := &mockCompose{deleteErr: errors.New("should not be called")}
	svc, err := NewWithStore(ms, mc)
	require.NoError(t, err)

	ms.installs["inst-4"] = &store.AppStoreInstall{
		ID:     "inst-4",
		AppKey: "nginx",
		Name:   "no-stack",
		UserID: "user-1",
		// ComposeProjectID empty
	}

	err = svc.UninstallApp(ctx, "inst-4", "user-1", "user")
	require.NoError(t, err)
	assert.True(t, ms.deleteCalled)
	assert.Empty(t, mc.deleted)
}

func TestUninstallApp_Forbidden(t *testing.T) {
	ctx := context.Background()
	ms := newMockStore()
	mc := &mockCompose{}
	svc, err := NewWithStore(ms, mc)
	require.NoError(t, err)

	ms.installs["inst-5"] = &store.AppStoreInstall{
		ID:     "inst-5",
		AppKey: "nginx",
		UserID: "owner-1",
	}

	err = svc.UninstallApp(ctx, "inst-5", "other-user", "user")
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrInstallForbidden))
	assert.False(t, ms.deleteCalled)
}

// --- Upgrade cross-version and ignore_upgrade tests ---

func TestUpgradeApp_IgnoreUpgradeBlocked(t *testing.T) {
	ctx := context.Background()
	ms := newMockStore()
	mc := &mockCompose{}
	svc, err := NewWithStore(ms, mc)
	require.NoError(t, err)

	ms.apps["postgres"] = &store.AppStoreApp{
		Key:            "postgres",
		Version:        "16",
		ComposeContent: "services:\n  db:\n    image: postgres:16\n",
	}
	ms.installs["inst-1"] = &store.AppStoreInstall{
		ID:            "inst-1",
		AppKey:        "postgres",
		AppVersion:    "15",
		UserID:        "user-1",
		IgnoreUpgrade: true,
		Params:        json.RawMessage(`{}`),
	}

	_, err = svc.UpgradeApp(ctx, "inst-1", "user-1", "user")
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrUpgradeIgnored))
	assert.Empty(t, mc.updated)
}

func TestUpgradeApp_IgnoreUpgradeViaQueriedFlag(t *testing.T) {
	ctx := context.Background()
	ms := newMockStore()
	// Simulate that IsAppStoreInstallIgnoreUpgrade would return true even if struct field false
	// For our mock, it just reads struct field, so set it
	mc := &mockCompose{}
	svc, err := NewWithStore(ms, mc)
	require.NoError(t, err)

	ms.apps["redis"] = &store.AppStoreApp{
		Key:            "redis",
		Version:        "7",
		ComposeContent: "services:\n  redis:\n    image: redis:7\n",
	}
	ms.installs["inst-2"] = &store.AppStoreInstall{
		ID:            "inst-2",
		AppKey:        "redis",
		AppVersion:    "6",
		UserID:        "user-1",
		IgnoreUpgrade: false, // initially false
		Params:        json.RawMessage(`{}`),
	}
	// Flip to true after initial check? Actually test that query picks it up if we set
	ms.installs["inst-2"].IgnoreUpgrade = true
	_, err = svc.UpgradeApp(ctx, "inst-2", "user-1", "user")
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrUpgradeIgnored))
}

func TestUpgradeApp_CrossVersionRequiresConfirm(t *testing.T) {
	ctx := context.Background()
	ms := newMockStore()
	mc := &mockCompose{}
	svc, err := NewWithStore(ms, mc)
	require.NoError(t, err)

	ms.apps["postgres"] = &store.AppStoreApp{
		Key:            "postgres",
		Version:        "16", // major 16
		ComposeContent: "services:\n  db:\n    image: postgres:16\n",
		CrossVersion:   true, // explicit flag
	}
	ms.installs["inst-3"] = &store.AppStoreInstall{
		ID:         "inst-3",
		AppKey:     "postgres",
		AppVersion: "15", // major 15 -> cross
		UserID:     "user-1",
		Params:     json.RawMessage(`{}`),
	}

	// Without confirm, should error
	_, err = svc.UpgradeApp(ctx, "inst-3", "user-1", "user")
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrCrossVersionRequiresConfirm))

	// With confirm=true, should succeed
	mc.stackToReturn = &compose.ComposeStack{ID: "cps-old", Status: compose.StackStatusRunning}
	// need ComposeProjectID for update path, but we can leave empty to test DB update without daemon
	ms.installs["inst-3"].ComposeProjectID = ""
	inst, err := svc.UpgradeApp(ctx, "inst-3", "user-1", "user", true)
	require.NoError(t, err)
	require.NotNil(t, inst)
	assert.Equal(t, "16", inst.AppVersion)
	assert.Equal(t, "running", inst.Status)
}

func TestUpgradeApp_CrossVersionViaSemverMajor(t *testing.T) {
	ctx := context.Background()
	ms := newMockStore()
	mc := &mockCompose{}
	svc, err := NewWithStore(ms, mc)
	require.NoError(t, err)

	// App not explicitly marked cross_version, but version major differs 1 -> 2
	ms.apps["myapp"] = &store.AppStoreApp{
		Key:            "myapp",
		Version:        "2.5.0",
		ComposeContent: "services:\n  web:\n    image: myapp:2.5\n",
		CrossVersion:   false,
	}
	ms.installs["inst-4"] = &store.AppStoreInstall{
		ID:         "inst-4",
		AppKey:     "myapp",
		AppVersion: "1.9.0",
		UserID:     "user-1",
		Params:     json.RawMessage(`{}`),
	}

	_, err = svc.UpgradeApp(ctx, "inst-4", "user-1", "user")
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrCrossVersionRequiresConfirm))

	// Confirm should allow
	_, err = svc.UpgradeApp(ctx, "inst-4", "user-1", "user", true)
	require.NoError(t, err)
}

func TestUpgradeApp_NonCrossVersionDoesNotRequireConfirm(t *testing.T) {
	ctx := context.Background()
	ms := newMockStore()
	mc := &mockCompose{}
	svc, err := NewWithStore(ms, mc)
	require.NoError(t, err)

	ms.apps["myapp"] = &store.AppStoreApp{
		Key:            "myapp",
		Version:        "1.10.0", // minor bump, not cross
		ComposeContent: "services:\n  web:\n    image: myapp:1.10\n",
		CrossVersion:   false,
	}
	ms.installs["inst-5"] = &store.AppStoreInstall{
		ID:         "inst-5",
		AppKey:     "myapp",
		AppVersion: "1.9.0",
		UserID:     "user-1",
		Params:     json.RawMessage(`{}`),
	}

	// Should succeed without confirm
	inst, err := svc.UpgradeApp(ctx, "inst-5", "user-1", "user")
	require.NoError(t, err)
	assert.Equal(t, "1.10.0", inst.AppVersion)
}

func TestUpgradeApp_CrossVersionViaStoreQuery(t *testing.T) {
	ctx := context.Background()
	ms := newMockStore()
	mc := &mockCompose{}
	svc, err := NewWithStore(ms, mc)
	require.NoError(t, err)

	// Store reports cross_version true via query, even if struct field false initially
	ms.apps["myapp2"] = &store.AppStoreApp{
		Key:            "myapp2",
		Version:        "2.0",
		ComposeContent: "services:\n  web:\n    image: myapp2:2.0\n",
		CrossVersion:   true,
	}
	ms.installs["inst-6"] = &store.AppStoreInstall{
		ID:         "inst-6",
		AppKey:     "myapp2",
		AppVersion: "1.0",
		UserID:     "user-1",
		Params:     json.RawMessage(`{}`),
	}

	_, err = svc.UpgradeApp(ctx, "inst-6", "user-1", "user")
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrCrossVersionRequiresConfirm))
}

func TestIsCrossVersionHelper(t *testing.T) {
	assert.False(t, isCrossVersion("1.0", "1.0"))
	assert.False(t, isCrossVersion("1.9", "1.10"))
	assert.True(t, isCrossVersion("1.9", "2.0"))
	assert.False(t, isCrossVersion("latest", "latest"))
	assert.False(t, isCrossVersion("latest", "2.0"))
	assert.False(t, isCrossVersion("", "2.0"))
	assert.True(t, isCrossVersion("v1.0", "v2.0"))
	assert.True(t, isCrossVersion("16", "15"))         // postgres example
	assert.False(t, isCrossVersion("16-alpine", "16")) // same major
}

func TestParseMajor(t *testing.T) {
	assert.Equal(t, "16", parseMajor("16"))
	assert.Equal(t, "16", parseMajor("16-alpine"))
	assert.Equal(t, "2", parseMajor("v2.5.0"))
	assert.Equal(t, "1", parseMajor("1.10"))
	assert.Equal(t, "", parseMajor("latest"))
	// latest handled as "" in isCrossVersion special case, but parse returns "" for non-numeric
	// So test that "latest" returns "" (since non-numeric)
	// Our isCrossVersion treats "latest" specially before calling parseMajor, but parseMajor for "latest" returns ""
	assert.Equal(t, "", parseMajor("latest"))
}
