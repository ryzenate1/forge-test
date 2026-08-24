"use client";

import { useState } from "react";
import { AdminDatabases } from "@/components/admin/AdminDatabases";
import { DBContainerView } from "@/components/database/container-view";
import { ManagedDatabaseView } from "@/components/database/managed-database-view";
import { DatabaseServicesView } from "@/components/database/database-services-view";
import { AdminPageLayout, AdminPageHeader, AdminTabs } from "@/components/admin/admin-ui";
import { OfflineBanner } from "@/components/shared/states-offline";

type Tab = "hosts" | "containers" | "managed" | "services";

export default function AdminDatabasesPage() {
  const [activeTab, setActiveTab] = useState<Tab>("containers");

  const tabs = [
    { id: "hosts" as Tab, label: "Database Hosts" },
    { id: "containers" as Tab, label: "DB Containers" },
    { id: "managed" as Tab, label: "Managed DBs" },
    { id: "services" as Tab, label: "Services" },
  ];

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title="Databases"
        description="Database hosts, containers, managed database services — plus Restart/TestConnection/Templates via Services tab"
      />
      <OfflineBanner onRetry={() => window.location.reload()} />
      <AdminTabs active={activeTab} onChange={(id) => setActiveTab(id as Tab)} tabs={tabs} />
      {activeTab === "hosts" && <AdminDatabases />}
      {activeTab === "containers" && <DBContainerView />}
      {activeTab === "managed" && <ManagedDatabaseView />}
      {activeTab === "services" && <DatabaseServicesView />}
    </AdminPageLayout>
  );
}
