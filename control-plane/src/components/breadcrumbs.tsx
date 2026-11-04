"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const LABELS: Record<string, string> = {
  assistants: "Assistants",
  tools: "Tools",
  "phone-numbers": "Phone Numbers",
  logs: "Logs",
  "structured-outputs": "Structured Outputs",
  metrics: "Metrics",
  "api-keys": "API Keys",
  team: "Team",
};

function label(segment: string) {
  const known = LABELS[segment];
  if (known) return known;
  const decoded = decodeURIComponent(segment);
  // Call and run ids are UUIDs: keep them readable.
  return /^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(decoded)
    ? `${decoded.slice(0, 8)}…`
    : decoded;
}

export function Breadcrumbs() {
  const segments = usePathname().split("/").filter(Boolean);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {segments.map((segment, i) => {
          const href = `/${segments.slice(0, i + 1).join("/")}`;
          const last = i === segments.length - 1;
          return (
            <React.Fragment key={href}>
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {last ? (
                  <BreadcrumbPage>{label(segment)}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink render={<Link href={href} />}>
                    {label(segment)}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
