import { Panel } from "@/components/landing/panel";
import Image from "next/image";

/**
 * A screenshot of the control plane dashboard, framed in the same flat box as
 * the install command above it.
 *
 * The capture lives in `public/screenshots`. Take it at 1440 x 900
 * with a device pixel ratio of 2 (2880 x 1800), which keeps the 16:10 ratio set
 * below and stays sharp on retina screens.
 */
export function DashboardShot() {
  return (
    <Panel title="Control plane" meta="Dashboard">
      <Image
        src="/screenshots/assistant-page.png"
        alt="The Samata control plane's assistant page, showing voice-to-voice latency by stage, the first message and system prompt, and the listen, think and speak voice stack."
        width={2880}
        height={1800}
        sizes="(min-width: 1024px) 40vw, 100vw"
        className="block h-auto w-full"
      />
    </Panel>
  );
}
