import Link from "next/link";
import { ChipTabs } from "@/components/ui/chip-tabs";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { listBanners, listFeaturedItems, listAvailableCourses } from "@/lib/data/admin-marketing";
import { BannersPanel } from "@/components/admin/marketing/BannersPanel";
import { FeaturedBoard } from "@/components/admin/marketing/FeaturedBoard";

export const metadata = { title: "Marketing CMS — PZ Academy" };

function parseTab(value: string | undefined): "banners" | "featured" {
  return value === "featured" ? "featured" : "banners";
}

export default async function AdminMarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireAdminPage();
  const { tab: tabParam } = await searchParams;
  const tab = parseTab(tabParam);

  const [banners, featuredItems, availableCourses] = await Promise.all([
    listBanners(),
    listFeaturedItems(),
    listAvailableCourses(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Marketing CMS</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Manage homepage banners and the featured courses row.
        </p>
      </div>

      <ChipTabs label="Marketing sections">
        <Link
          href="/dashboard/admin/marketing?tab=banners"
          aria-current={tab === "banners" ? "page" : undefined}
          className={`px-5 py-2 rounded-full font-headline text-sm transition-all ${tab === "banners" ? "bg-pz-primary-container text-pz-on-primary-container font-semibold" : "bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant font-medium"}`}
        >
          Banners <span className="ml-2 tabular-nums">{banners.length}</span>
        </Link>
        <Link
          href="/dashboard/admin/marketing?tab=featured"
          aria-current={tab === "featured" ? "page" : undefined}
          className={`px-5 py-2 rounded-full font-headline text-sm transition-all ${tab === "featured" ? "bg-pz-primary-container text-pz-on-primary-container font-semibold" : "bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant font-medium"}`}
        >
          Featured Content <span className="ml-2 tabular-nums">{featuredItems.length}</span>
        </Link>
      </ChipTabs>

      {tab === "banners" ? (
        <BannersPanel initialBanners={banners} />
      ) : (
        <FeaturedBoard initialAvailable={availableCourses} initialFeatured={featuredItems} />
      )}
    </div>
  );
}
