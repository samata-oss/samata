import { gitConfig } from "./shared";

/**
 * The repo's star count, or null if GitHub can't be reached (or the repo is
 * private or new). The landing page just hides the number in that case.
 */
export async function getStars(): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${gitConfig.user}/${gitConfig.repo}`,
      {
        headers: { accept: "application/vnd.github+json" },
        next: { revalidate: 3600 },
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { stargazers_count?: number };
    return typeof json.stargazers_count === "number"
      ? json.stargazers_count
      : null;
  } catch {
    return null;
  }
}
