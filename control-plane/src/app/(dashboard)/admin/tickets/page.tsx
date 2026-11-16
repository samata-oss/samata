import { notFound } from "next/navigation";
import { cloudEnabled } from "@/cloud/config";

// The page itself lives in src/cloud. This stub only exists because Next
// routes by file location, and it is a 404 unless SAMATA_CLOUD is set (and
// the page itself is a 404 for anyone but the superuser).
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!cloudEnabled()) notFound();
  const { AdminTicketsPage } = await import("@/cloud/support/admin-page");
  return <AdminTicketsPage searchParams={await searchParams} />;
}
