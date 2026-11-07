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
    githubUrl,
  };
}
