import { notFound } from "next/navigation";
import { cloudEnabled } from "@/cloud/config";

// The page itself lives in src/cloud. This stub only exists because Next
// routes by file location, and it is a 404 unless SAMATA_CLOUD is set.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!cloudEnabled()) notFound();
  const { SupportPage } = await import("@/cloud/support/page");
  return <SupportPage searchParams={await searchParams} />;
}
