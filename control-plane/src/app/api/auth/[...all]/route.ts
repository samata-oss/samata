import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth";

// pg needs the Node runtime.
export const runtime = "nodejs";

export const { GET, POST } = toNextJsHandler(auth);
