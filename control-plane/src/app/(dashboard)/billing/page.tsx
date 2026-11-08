import { notFound } from "next/navigation";
import { cloudEnabled } from "@/cloud/config";

// The page itself lives in src/cloud. This stub only exists because Next
// routes by file location, and it is a 404 unless SAMATA_CLOUD is set.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  if (!cloudEnabled()) notFound();
  const { BillingPage } = await import("@/cloud/billing/page");
  const { checkout } = await searchParams;
  return <BillingPage checkoutReturned={checkout === "success"} />;
}
