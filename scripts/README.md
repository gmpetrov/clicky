# Release Scripts

## `release.sh` — build a production Pointerly desktop artifact

This script packages the macOS app for direct website downloads, with the `.dmg` as the primary output.

What it does:

1. Archives the `leanring-buddy` scheme in `Release`
2. Exports a Developer ID-signed `Pointerly.app`
3. Injects the production web and worker URLs through Xcode build settings
4. Notarizes and staples the app
5. Creates a ready-to-upload `.dmg` for direct website distribution
6. Also packages a secondary `.zip`
7. Writes SHA256 checksum files next to each artifact

The script does not upload to S3. It leaves ready-to-upload files in `build/release/artifacts`.

### Quick start

```bash
CLICKY_WEB_BASE_URL=https://www.pointerly.xyz \
CLICKY_WORKER_BASE_URL=https://worker.pointerly.xyz \
./scripts/release.sh
```

### Common examples

```bash
# Override the app version and build number for this release only
CLICKY_WEB_BASE_URL=https://www.pointerly.xyz \
CLICKY_WORKER_BASE_URL=https://worker.pointerly.xyz \
./scripts/release.sh --version 1.2.0 --build 42

# Use a non-default notarytool keychain profile
CLICKY_WEB_BASE_URL=https://www.pointerly.xyz \
CLICKY_WORKER_BASE_URL=https://worker.pointerly.xyz \
./scripts/release.sh --notary-profile CLICKY_NOTARY

# Skip DMG creation if you only want the exported app + ZIP
CLICKY_WEB_BASE_URL=https://www.pointerly.xyz \
CLICKY_WORKER_BASE_URL=https://worker.pointerly.xyz \
./scripts/release.sh --skip-dmg
```

### Prerequisites

1. Xcode with your Developer ID certificate available for signing
2. A configured notarytool keychain profile:
   ```bash
   xcrun notarytool store-credentials "AC_PASSWORD" \
     --apple-id YOUR_APPLE_ID \
     --team-id YOUR_TEAM_ID
   ```
3. If you want the styled drag-to-Applications DMG, install `create-dmg`:
   ```bash
   brew install create-dmg
   ```

If `create-dmg` is not installed, the script falls back to a plain notarized DMG generated with macOS `hdiutil`.

### Output

After a successful run you will find:

- `build/release/artifacts/Pointerly-<version>-<build>.dmg`
- `build/release/artifacts/Pointerly-<version>-<build>.dmg.sha256`
- `build/release/artifacts/Pointerly-<version>-<build>.zip`
- `build/release/artifacts/Pointerly-<version>-<build>.zip.sha256`
- `build/release/artifacts/Pointerly-<version>-<build>.txt` with release metadata

For the website flow, upload the DMG and its checksum to your S3 folder. The ZIP is there as a secondary artifact if you want it.
