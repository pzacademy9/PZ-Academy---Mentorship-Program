import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getBatchTitle, searchBatchIds } from "@/lib/data/pz-people";
import { FindMyId } from "@/components/marketing/FindMyId";
import { findMyId } from "./actions";

export const metadata: Metadata = { title: "Find your PZ ID", robots: { index: false } };

export default async function FindIdPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const known = await searchBatchIds(slug, "");
  if (!known) notFound();
  const title = await getBatchTitle(slug);

  return (
    <main className="min-h-screen bg-pz-offwhite px-4 py-12">
      <div className="mx-auto max-w-xl">
        <p className="text-sm font-semibold text-pz-mid">PZ Academy</p>
        <h1 className="mt-1 font-poppins text-2xl font-bold text-pz-deep">Find your PZ ID</h1>
        {title ? <p className="mt-1 text-pz-mid">{title}</p> : null}
        <p className="mt-4 text-sm text-pz-mid">
          Type your name to see your personal PZ ID. You will use it for your certificate.
        </p>
        <FindMyId slug={slug} search={findMyId} />
      </div>
    </main>
  );
}
