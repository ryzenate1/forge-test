import { AdminShell } from "@/components/admin/admin-layout";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
