#!/bin/bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_PATH="${PROJECT_DIR}/leanring-buddy.xcodeproj"
SCHEME="leanring-buddy"
APP_NAME="Pointerly"
BUILD_ROOT="${PROJECT_DIR}/build/release"
ARCHIVE_PATH="${BUILD_ROOT}/archive/${APP_NAME}.xcarchive"
EXPORT_DIR="${BUILD_ROOT}/export"
ARTIFACTS_DIR="${BUILD_ROOT}/artifacts"
NOTARIZATION_DIR="${BUILD_ROOT}/notarization"
DMG_BACKGROUND_PATH="${PROJECT_DIR}/dmg-background.png"

MARKETING_VERSION_OVERRIDE=""
BUILD_NUMBER_OVERRIDE=""
WEB_BASE_URL_OVERRIDE="https://www.pointerly.xyz"
WORKER_BASE_URL_OVERRIDE="https://worker.pointerly.xyz"
NOTARY_PROFILE="${APPLE_NOTARY_PROFILE:-AC_PASSWORD}"
SHOULD_CREATE_DMG=true
SHOULD_NOTARIZE=true

usage() {
    cat <<'EOF'
Build a signed macOS production artifact for Pointerly.

Usage:
  CLICKY_WEB_BASE_URL=https://www.pointerly.xyz \
  CLICKY_WORKER_BASE_URL=https://worker.pointerly.xyz \
  ./scripts/release.sh [options]

Options:
  --version <version>           Override MARKETING_VERSION for this build.
  --build <build-number>        Override CURRENT_PROJECT_VERSION for this build.
  --web-base-url <url>          Override the Pointerly web base URL for this build.
  --worker-base-url <url>       Override the Pointerly worker base URL for this build.
  --notary-profile <name>       Keychain profile used by notarytool.
                                Defaults to APPLE_NOTARY_PROFILE or AC_PASSWORD.
  --create-dmg                  Retained for backward compatibility.
                                DMG creation is already enabled by default.
  --skip-dmg                    Skip DMG creation and only export the app + ZIP.
  --skip-notarization           Skip notarytool submission and stapling.
  -h, --help                    Show this help message.

Required:
  CLICKY_WEB_BASE_URL           The production Pointerly web app URL.
  CLICKY_WORKER_BASE_URL        The production Pointerly worker URL.

Notes:
  - The DMG is the primary website artifact for distribution.
  - If create-dmg is installed, the script uses the
    styled drag-to-Applications layout. Otherwise it falls back to hdiutil.
  - A ZIP is also generated as a secondary artifact.
  - The script does not upload anything. It leaves ready-to-upload files in
    build/release/artifacts.
EOF
}

fail() {
    echo "Error: $*" >&2
    exit 1
}

require_command() {
    local command_name="$1"

    if ! command -v "$command_name" >/dev/null 2>&1; then
        fail "Missing required command: ${command_name}"
    fi
}

command_exists() {
    local command_name="$1"

    command -v "$command_name" >/dev/null 2>&1
}

require_value() {
    local value="$1"
    local value_name="$2"

    if [[ -z "$value" ]]; then
        fail "Missing required value: ${value_name}"
    fi
}

validate_notary_profile() {
    local notary_profile_name="$1"

    if xcrun notarytool history --keychain-profile "$notary_profile_name" >/dev/null 2>&1; then
        return 0
    fi

    cat >&2 <<EOF
Error: Apple notarization profile '${notary_profile_name}' is not available in your Keychain.

Create it once with:
  xcrun notarytool store-credentials "${notary_profile_name}" \\
    --apple-id YOUR_APPLE_ID \\
    --team-id YOUR_TEAM_ID \\
    --password YOUR_APP_SPECIFIC_PASSWORD

Then rerun:
  ./scripts/release.sh --version ${MARKETING_VERSION_OVERRIDE:-<version>} --build ${BUILD_NUMBER_OVERRIDE:-<build>}

If you want to skip notarization temporarily:
  ./scripts/release.sh --skip-notarization
EOF
    exit 1
}

read_plist_value() {
    local plist_path="$1"
    local plist_key="$2"

    /usr/libexec/PlistBuddy -c "Print :${plist_key}" "$plist_path"
}

write_sha256_file() {
    local artifact_path="$1"

    shasum -a 256 "$artifact_path" > "${artifact_path}.sha256"
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --version)
            [[ $# -ge 2 ]] || fail "Missing value for --version"
            MARKETING_VERSION_OVERRIDE="$2"
            shift 2
            ;;
        --build)
            [[ $# -ge 2 ]] || fail "Missing value for --build"
            BUILD_NUMBER_OVERRIDE="$2"
            shift 2
            ;;
        --web-base-url)
            [[ $# -ge 2 ]] || fail "Missing value for --web-base-url"
            WEB_BASE_URL_OVERRIDE="$2"
            shift 2
            ;;
        --worker-base-url)
            [[ $# -ge 2 ]] || fail "Missing value for --worker-base-url"
            WORKER_BASE_URL_OVERRIDE="$2"
            shift 2
            ;;
        --notary-profile)
            [[ $# -ge 2 ]] || fail "Missing value for --notary-profile"
            NOTARY_PROFILE="$2"
            shift 2
            ;;
        --create-dmg)
            SHOULD_CREATE_DMG=true
            shift
            ;;
        --skip-dmg)
            SHOULD_CREATE_DMG=false
            shift
            ;;
        --skip-notarization)
            SHOULD_NOTARIZE=false
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            fail "Unknown argument: $1"
            ;;
    esac
done

CLICKY_WEB_BASE_URL="${WEB_BASE_URL_OVERRIDE:-${CLICKY_WEB_BASE_URL:-}}"
CLICKY_WORKER_BASE_URL="${WORKER_BASE_URL_OVERRIDE:-${CLICKY_WORKER_BASE_URL:-}}"

require_command xcodebuild
require_command xcrun
require_command ditto
require_command shasum
require_command codesign
require_command spctl

require_value "$CLICKY_WEB_BASE_URL" "CLICKY_WEB_BASE_URL or --web-base-url"
require_value "$CLICKY_WORKER_BASE_URL" "CLICKY_WORKER_BASE_URL or --worker-base-url"

if $SHOULD_CREATE_DMG; then
    require_command hdiutil
fi

if $SHOULD_NOTARIZE; then
    require_value "$NOTARY_PROFILE" "APPLE_NOTARY_PROFILE or --notary-profile"
    validate_notary_profile "$NOTARY_PROFILE"
fi

echo "Preparing Pointerly production build..."
echo "  Web base URL:    ${CLICKY_WEB_BASE_URL}"
echo "  Worker base URL: ${CLICKY_WORKER_BASE_URL}"
echo "  Notarization:    ${SHOULD_NOTARIZE}"
echo "  Create DMG:      ${SHOULD_CREATE_DMG}"

rm -rf "$BUILD_ROOT"
mkdir -p "$BUILD_ROOT" "$ARTIFACTS_DIR" "$NOTARIZATION_DIR"

EXPORT_OPTIONS_PATH="${BUILD_ROOT}/ExportOptions.plist"
cat > "$EXPORT_OPTIONS_PATH" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>developer-id</string>
    <key>destination</key>
    <string>export</string>
    <key>signingStyle</key>
    <string>automatic</string>
</dict>
</plist>
PLIST

archive_command=(
    xcodebuild
    archive
    -project "$PROJECT_PATH"
    -scheme "$SCHEME"
    -configuration Release
    -destination "generic/platform=macOS"
    -archivePath "$ARCHIVE_PATH"
    "CLICKY_WEB_BASE_URL=$CLICKY_WEB_BASE_URL"
    "CLICKY_WORKER_BASE_URL=$CLICKY_WORKER_BASE_URL"
    "COMPILER_INDEX_STORE_ENABLE=NO"
)

if [[ -n "$MARKETING_VERSION_OVERRIDE" ]]; then
    archive_command+=("MARKETING_VERSION=$MARKETING_VERSION_OVERRIDE")
fi

if [[ -n "$BUILD_NUMBER_OVERRIDE" ]]; then
    archive_command+=("CURRENT_PROJECT_VERSION=$BUILD_NUMBER_OVERRIDE")
fi

echo "Archiving Release build..."
"${archive_command[@]}"

echo "Exporting Developer ID-signed app..."
xcodebuild -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportPath "$EXPORT_DIR" \
    -exportOptionsPlist "$EXPORT_OPTIONS_PATH"

APP_PATH="$(find "$EXPORT_DIR" -maxdepth 1 -type d -name "*.app" -print -quit)"
[[ -n "$APP_PATH" ]] || fail "Could not find exported .app inside ${EXPORT_DIR}"

APP_INFO_PLIST="${APP_PATH}/Contents/Info.plist"
ACTUAL_MARKETING_VERSION="$(read_plist_value "$APP_INFO_PLIST" "CFBundleShortVersionString")"
ACTUAL_BUILD_NUMBER="$(read_plist_value "$APP_INFO_PLIST" "CFBundleVersion")"
ACTUAL_BUNDLE_IDENTIFIER="$(read_plist_value "$APP_INFO_PLIST" "CFBundleIdentifier")"
ACTUAL_WEB_BASE_URL="$(read_plist_value "$APP_INFO_PLIST" "ClickyWebBaseURL")"
ACTUAL_WORKER_BASE_URL="$(read_plist_value "$APP_INFO_PLIST" "ClickyWorkerBaseURL")"
ARTIFACT_STEM="${APP_NAME}-${ACTUAL_MARKETING_VERSION}-${ACTUAL_BUILD_NUMBER}"
ZIP_PATH="${ARTIFACTS_DIR}/${ARTIFACT_STEM}.zip"
ZIP_NOTARIZATION_PATH="${NOTARIZATION_DIR}/${ARTIFACT_STEM}-notarization.zip"

if $SHOULD_NOTARIZE; then
    echo "Creating notarization ZIP..."
    ditto -c -k --keepParent --sequesterRsrc "$APP_PATH" "$ZIP_NOTARIZATION_PATH"

    echo "Submitting app for notarization..."
    xcrun notarytool submit "$ZIP_NOTARIZATION_PATH" \
        --keychain-profile "$NOTARY_PROFILE" \
        --wait

    echo "Stapling notarization ticket to app..."
    xcrun stapler staple "$APP_PATH"
fi

echo "Verifying exported app signature..."
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

if $SHOULD_NOTARIZE; then
    echo "Checking Gatekeeper assessment..."
    spctl --assess --type execute --verbose=4 "$APP_PATH"
fi

echo "Creating secondary ZIP artifact..."
ditto -c -k --keepParent --sequesterRsrc "$APP_PATH" "$ZIP_PATH"
write_sha256_file "$ZIP_PATH"

DMG_PATH=""
if $SHOULD_CREATE_DMG; then
    DMG_PATH="${ARTIFACTS_DIR}/${ARTIFACT_STEM}.dmg"
    DMG_STAGING_DIR="${BUILD_ROOT}/dmg-staging"
    rm -rf "$DMG_STAGING_DIR"
    mkdir -p "$DMG_STAGING_DIR"
    cp -R "$APP_PATH" "$DMG_STAGING_DIR/"
    ln -s /Applications "$DMG_STAGING_DIR/Applications"

    if command_exists create-dmg; then
        [[ -f "$DMG_BACKGROUND_PATH" ]] || fail "Missing DMG background: ${DMG_BACKGROUND_PATH}"

        echo "Creating styled DMG artifact with create-dmg..."
        create-dmg \
            --volname "$APP_NAME" \
            --window-pos 200 120 \
            --window-size 660 400 \
            --icon-size 100 \
            --icon "${APP_NAME}.app" 160 195 \
            --app-drop-link 500 195 \
            --background "$DMG_BACKGROUND_PATH" \
            "$DMG_PATH" \
            "$APP_PATH"
    else
        echo "create-dmg is not installed. Falling back to a plain macOS DMG..."
        hdiutil create \
            -volname "$APP_NAME" \
            -srcfolder "$DMG_STAGING_DIR" \
            -ov \
            -format UDZO \
            "$DMG_PATH"
    fi

    if $SHOULD_NOTARIZE; then
        echo "Submitting DMG for notarization..."
        xcrun notarytool submit "$DMG_PATH" \
            --keychain-profile "$NOTARY_PROFILE" \
            --wait

        echo "Stapling notarization ticket to DMG..."
        xcrun stapler staple "$DMG_PATH"
    fi

    write_sha256_file "$DMG_PATH"
fi

MANIFEST_PATH="${ARTIFACTS_DIR}/${ARTIFACT_STEM}.txt"
{
    echo "App Name: ${APP_NAME}"
    echo "Bundle Identifier: ${ACTUAL_BUNDLE_IDENTIFIER}"
    echo "Marketing Version: ${ACTUAL_MARKETING_VERSION}"
    echo "Build Number: ${ACTUAL_BUILD_NUMBER}"
    echo "Web Base URL: ${ACTUAL_WEB_BASE_URL}"
    echo "Worker Base URL: ${ACTUAL_WORKER_BASE_URL}"
    echo "ZIP Artifact: ${ZIP_PATH}"
    echo "ZIP SHA256:"
    cat "${ZIP_PATH}.sha256"
    if [[ -n "$DMG_PATH" ]]; then
        echo "DMG Artifact: ${DMG_PATH}"
        echo "DMG SHA256:"
        cat "${DMG_PATH}.sha256"
    fi
} > "$MANIFEST_PATH"

echo
echo "Production artifacts are ready."
if [[ -n "$DMG_PATH" ]]; then
    echo "  DMG:      ${DMG_PATH}"
fi
echo "  ZIP:      ${ZIP_PATH}"
echo "  Manifest: ${MANIFEST_PATH}"
echo
echo "Upload the files from ${ARTIFACTS_DIR} to your S3 release folder."
