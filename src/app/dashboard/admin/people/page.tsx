import { permanentRedirect } from "next/navigation";

// The People page now lives under Students as "Student IDs".
export default function AdminPeopleRedirect() {
  permanentRedirect("/dashboard/admin/students/ids");
}
