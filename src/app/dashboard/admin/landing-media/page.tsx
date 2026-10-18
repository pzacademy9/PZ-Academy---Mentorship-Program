import { requireAdminPage } from "@/lib/auth/require-admin";
import { listMedia } from "@/lib/data/landing-media";
import { MediaLibrary } from "@/components/admin/landing/MediaLibrary";

export const metadata = { title: "Media Library — PZ Academy" };

export default async function AdminLandingMediaPage() {
  await requireAdminPage();
  const items = await listMedia();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Media Library</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Pictures shared by all your landing pages. Upload once, reuse anywhere.
        </p>
      </div>
      <MediaLibrary initialItems={items} />
    </div>
  );
}
