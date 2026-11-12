import { DiscordIcon, GitHubIcon, XIcon } from "@/components/social-icons";
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { githubUrl } from "./shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      // The site bar above already carries the logo, so the sidebar's own
      // header only keeps its controls.
      title: null,
      url: "/",
    },
    // Icons in the sidebar footer. X and Discord have no destination yet, so
    // they point at "#".
    links: [
      {
        type: "icon",
        text: "GitHub",
        label: "GitHub",
        url: githubUrl,
        external: true,
        icon: <GitHubIcon className="size-4!" />,
        on: "menu",
      },
      {
        type: "icon",
        text: "X",
        label: "X",
        url: "#",
        icon: <XIcon className="size-4!" />,
        on: "menu",
      },
      {
        type: "icon",
        text: "Discord",
        label: "Discord",
        url: "#",
        icon: <DiscordIcon className="size-4!" />,
        on: "menu",
      },
    ],
  };
}
