import { existsSync } from "fs";
import { join } from "path";

/** Filenames that must never ship in the GitHub Pages dist. */
export const FOUNDER_ONLY_DIST_FILES = ["security-battlecard.html"];

export function founderOnlyFilesIn(dir) {
  return FOUNDER_ONLY_DIST_FILES.filter((name) => existsSync(join(dir, name)));
}
