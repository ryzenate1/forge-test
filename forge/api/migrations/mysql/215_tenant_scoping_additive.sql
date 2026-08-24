-- 215_tenant_scoping_additive.sql (MySQL dialect)
ALTER TABLE events ADD COLUMN tenant_id CHAR(36) NULL;
CREATE INDEX idx_events_tenant ON events (tenant_id);

ALTER TABLE placement_decisions ADD COLUMN tenant_id CHAR(36) NULL;
CREATE INDEX idx_placement_decisions_tenant ON placement_decisions (tenant_id);

ALTER TABLE reconcile_plans ADD COLUMN tenant_id CHAR(36) NULL;
CREATE INDEX idx_reconcile_plans_tenant ON reconcile_plans (tenant_id);

ALTER TABLE reconcile_events ADD COLUMN tenant_id CHAR(36) NULL;
CREATE INDEX idx_reconcile_events_tenant ON reconcile_events (tenant_id);

ALTER TABLE placement_reservations ADD COLUMN tenant_id CHAR(36) NULL;
CREATE INDEX idx_placement_reservations_tenant ON placement_reservations (tenant_id);

ALTER TABLE placement_intents ADD COLUMN tenant_id CHAR(36) NULL;
CREATE INDEX idx_placement_intents_tenant ON placement_intents (tenant_id);
