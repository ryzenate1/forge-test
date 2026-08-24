import type { Metadata } from "next";
import { BeaconWorkspace } from "@/components/admin/beacon-workspace";

export const metadata: Metadata = { title: "Beacon — Forge Admin" };

export default function AdminNodeDetailPage() {
  return <BeaconWorkspace />;
}
