import { permanentRedirect } from "next/navigation";

export default function ContainersAlias() {
  // Containers inventory lives inside Docker manager tabs; this alias preserves deep links.
  permanentRedirect("/admin/docker");
}
