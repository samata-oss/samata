"use client";

import { Panel } from "@/components/landing/panel";
import { Maximize2, X } from "lucide-react";
import Image from "next/image";
import { useRef } from "react";

const src = "/screenshots/assistant.png";
const alt =
  "The Samata control plane's assistant page, showing voice-to-voice latency by stage, the first message and system prompt, and the listen, think and speak voice stack.";

/**
 * A screenshot of the control plane dashboard, framed in the same flat box as
 * the install command above it. Click it to open a full-size view.
 *
 * The capture lives in `public/screenshots`. Take it at 1440 x 900
 * with a device pixel ratio of 2 (2880 x 1800), which keeps the 16:10 ratio set
 * below and stays sharp on retina screens.
 */
export function DashboardShot() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // A native modal dialog gives us the backdrop, focus trap and Escape for free.
  const open = () => {
    dialogRef.current?.showModal();
    document.body.style.overflow = "hidden";
  };
  const close = () => dialogRef.current?.close();

  return (
    <>
      <Panel title="Control plane" meta="Dashboard" className="max-w-xl">
        <button
          type="button"
          onClick={open}
          aria-label="Enlarge screenshot"
          className="group relative block w-full cursor-zoom-in"
        >
          <Image
            src={src}
            alt={alt}
            width={2880}
            height={1800}
            sizes="(min-width: 640px) 576px, 100vw"
            className="block h-auto w-full"
          />
          <span
            aria-hidden="true"
            className="absolute right-2 bottom-2 flex size-7 items-center justify-center border border-white/[0.14] bg-black/60 text-zinc-300 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            <Maximize2 className="size-3.5" />
          </span>
        </button>
      </Panel>

      <dialog
        ref={dialogRef}
        aria-label="Control plane screenshot"
        // Clicking anywhere on the dialog, including the backdrop, closes it.
        onClick={close}
        onClose={() => {
          document.body.style.overflow = "";
        }}
        className="m-auto size-fit max-h-none max-w-none cursor-zoom-out overflow-visible bg-transparent p-0 backdrop:bg-black/85 backdrop:backdrop-blur-sm"
      >
        <Image
          src={src}
          alt={alt}
          width={2880}
          height={1800}
          sizes="95vw"
          quality={90}
          className="block h-auto max-h-[92vh] w-auto max-w-[95vw] border border-white/[0.11] object-contain"
        />
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute -top-3 -right-3 flex size-8 cursor-pointer items-center justify-center border border-white/[0.14] bg-[oklch(0.105_0.004_270)] text-zinc-300 transition-colors hover:text-white"
        >
          <X className="size-4" />
        </button>
      </dialog>
    </>
  );
}
