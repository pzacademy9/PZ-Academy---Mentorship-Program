import { redirect } from "next/navigation";

// Batch access now lives on each batch's Portal access screen; keep old links and bookmarks working.
export default function BatchAccessPage() {
  redirect("/dashboard/admin/enrollments/registrations");
}
