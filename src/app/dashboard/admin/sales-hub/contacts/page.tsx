import { requireAdminPage } from "@/lib/auth/require-admin";
import { listContacts } from "@/lib/data/admin-crm-contacts";
import { ContactsPanel } from "@/components/admin/crm/ContactsPanel";

export const metadata = { title: "Contacts — Sales Hub — PZ Academy" };

export default async function SalesHubContactsPage() {
  await requireAdminPage("sales_hub");
  const contacts = await listContacts({ limit: 50, offset: 0 });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Contacts</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">Everyone who has registered or bought. Find people, then choose what to do.</p>
      </div>
      <ContactsPanel initialRows={contacts.rows} initialTotal={contacts.total} />
    </div>
  );
}
