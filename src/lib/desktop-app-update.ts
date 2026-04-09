import "server-only";

import { z } from "zod";

const latestDesktopAppReleaseSchema = z.object({
  version: z.string().min(1),
  buildNumber: z.string().min(1).optional(),
  minimumSupportedVersion: z.string().min(1).optional(),
  downloadURL: z.string().url(),
});

export type LatestDesktopAppRelease = z.infer<
  typeof latestDesktopAppReleaseSchema
>;

const defaultDesktopAppVersion = "1.0.0";

export function getLatestDesktopAppRelease(): LatestDesktopAppRelease {
  const latestDesktopAppVersion =
    nonEmptyString(process.env.CLICKY_DESKTOP_LATEST_VERSION) ??
    defaultDesktopAppVersion;

  return latestDesktopAppReleaseSchema.parse({
    version: latestDesktopAppVersion,
    buildNumber: nonEmptyString(process.env.CLICKY_DESKTOP_LATEST_BUILD_NUMBER),
    minimumSupportedVersion: nonEmptyString(
      process.env.CLICKY_DESKTOP_MINIMUM_SUPPORTED_VERSION,
    ),
    downloadURL:
      nonEmptyString(process.env.CLICKY_DESKTOP_LATEST_DOWNLOAD_URL) ??
      `https://s3.pointerly.xyz/release/macos/Pointerly-${latestDesktopAppVersion}.dmg`,
  });
}

function nonEmptyString(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}
