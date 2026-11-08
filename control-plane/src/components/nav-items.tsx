import {
  BarChart3Icon,
  BotIcon,
  BracesIcon,
  CpuIcon,
  CreditCardIcon,
  KeyRoundIcon,
  PhoneIcon,
  ScrollTextIcon,
  UsersIcon,
  WrenchIcon,
} from "lucide-react";
import type { NavGroup } from "@/components/nav-main";

/**
 * Every top-level page. Drives both the sidebar and the command palette.
 * `cloud` adds the pages only the managed cloud has.
 */
export const navGroups = ({ cloud }: { cloud: boolean }): NavGroup[] => [
  {
    label: "Build",
    items: [
      { title: "Assistants", url: "/assistants", icon: <BotIcon /> },
      { title: "Tools", url: "/tools", icon: <WrenchIcon /> },
      { title: "Phone Numbers", url: "/phone-numbers", icon: <PhoneIcon /> },
    ],
  },
  {
    label: "Observe",
    items: [
      { title: "Logs", url: "/logs", icon: <ScrollTextIcon /> },
      {
        title: "Structured Outputs",
        url: "/structured-outputs",
        icon: <BracesIcon />,
      },
      { title: "Metrics", url: "/metrics", icon: <BarChart3Icon /> },
    ],
  },
  {
    label: "Integrate",
    items: [
      { title: "Provider Keys", url: "/provider-keys", icon: <CpuIcon /> },
      { title: "API Keys", url: "/api-keys", icon: <KeyRoundIcon /> },
    ],
  },
  {
    label: "Workspace",
    items: [
      { title: "Team", url: "/team", icon: <UsersIcon /> },
      ...(cloud
        ? [{ title: "Billing", url: "/billing", icon: <CreditCardIcon /> }]
        : []),
    ],
  },
];
