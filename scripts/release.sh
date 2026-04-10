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
ENV_FILE_PATH="${PROJECT_DIR}/.env"
DEFAULT_S3_RELEASE_PREFIX="release/macos"

MARKETING_VERSION_OVERRIDE=""
BUILD_NUMBER_OVERRIDE=""
WEB_BASE_URL_OVERRIDE="https://www.pointerly.xyz"
WORKER_BASE_URL_OVERRIDE="https://worker.pointerly.xyz"
NOTARY_PROFILE_OVERRIDE=""
SHOULD_CREATE_DMG=true
SHOULD_NOTARIZE=true
SHOULD_PUBLISH_S3=false
S3_BUCKET_OVERRIDE=""
S3_RELEASE_PREFIX_OVERRIDE=""

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
  --publish-s3                  Upload the generated artifacts to Cloudflare R2/S3.
                                Requires aws cli plus the APP_AWS_* settings.
  --s3-bucket <bucket-name>     Override the target R2/S3 bucket for --publish-s3.
  --s3-prefix <object-prefix>   Override the upload prefix for --publish-s3.
                                Defaults to release/macos.
  --create-dmg                  Retained for backward compatibility.
                                DMG creation is already enabled by default.
  --skip-dmg                    Skip DMG creation and only export the app + ZIP.
  --skip-notarization           Skip notarytool submission and stapling.
  -h, --help                    Show this help message.

Required:
  CLICKY_WEB_BASE_URL           The production Pointerly web app URL.
  CLICKY_WORKER_BASE_URL        The production Pointerly worker URL.

Required for --publish-s3:
  APP_AWS_ACCESS_KEY            Access key used to authenticate aws cli uploads.
  APP_AWS_SECRET_KEY            Secret key used to authenticate aws cli uploads.
  APP_AWS_S3_ENDPOINT           Cloudflare R2 S3 endpoint, for example:
                                https://<account-id>.r2.cloudflarestorage.com
  APP_AWS_S3_BUCKET             Target bucket name unless passed via --s3-bucket.

Notes:
  - The DMG is the primary website artifact for distribution.
  - If create-dmg is installed, the script uses the
    styled drag-to-Applications layout. Otherwise it falls back to hdiutil.
  - A ZIP is also generated as a secondary artifact.
  - If --publish-s3 is omitted, the script leaves ready-to-upload files in
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

trim_whitespace() {
    local value="$1"

    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"

    printf '%s' "$value"
}

strip_wrapping_quotes() {
    local value="$1"

    if [[ ${#value} -ge 2 && "$value" == \"*\" && "$value" == *\" ]]; then
        value="${value:1:${#value}-2}"
    elif [[ ${#value} -ge 2 && "$value" == \'*\' && "$value" == *\' ]]; then
        value="${value:1:${#value}-2}"
    fi

    printf '%s' "$value"
}

read_env_file_value() {
    local env_file_path="$1"
    local environment_variable_name="$2"

    [[ -f "$env_file_path" ]] || return 0

    local matching_line=""
    matching_line="$(grep -E "^[[:space:]]*${environment_variable_name}[[:space:]]*=" "$env_file_path" | tail -n 1 || true)"
    [[ -n "$matching_line" ]] || return 0

    local raw_value="${matching_line#*=}"
    raw_value="$(trim_whitespace "$raw_value")"
    raw_value="$(strip_wrapping_quotes "$raw_value")"

    printf '%s' "$raw_value"
}

apply_env_file_default_if_missing() {
    local environment_variable_name="$1"

    if [[ -n "${!environment_variable_name:-}" ]]; then
        return 0
    fi

    local env_file_value=""
    env_file_value="$(read_env_file_value "$ENV_FILE_PATH" "$environment_variable_name")"

    if [[ -n "$env_file_value" ]]; then
        printf -v "$environment_variable_name" "%s" "$env_file_value"
        export "$environment_variable_name"
    fi
}

normalize_s3_object_prefix() {
    local object_prefix="$1"

    object_prefix="$(trim_whitespace "$object_prefix")"
    object_prefix="${object_prefix#/}"
    object_prefix="${object_prefix%/}"

    printf '%s' "$object_prefix"
}

build_s3_object_key() {
    local object_prefix="$1"
    local file_name="$2"

    if [[ -n "$object_prefix" ]]; then
        printf '%s/%s' "$object_prefix" "$file_name"
        return 0
    fi

    printf '%s' "$file_name"
}

upload_file_to_s3() {
    local local_file_path="$1"
    local s3_bucket_name="$2"
    local s3_object_key="$3"
    local s3_endpoint_url="$4"
    local s3_region="$5"
    local s3_access_key="$6"
    local s3_secret_key="$7"

    local s3_uri="s3://${s3_bucket_name}/${s3_object_key}"
    echo "Uploading $(basename "$local_file_path") to ${s3_uri}..."

    env \
        AWS_ACCESS_KEY_ID="$s3_access_key" \
        AWS_SECRET_ACCESS_KEY="$s3_secret_key" \
        AWS_DEFAULT_REGION="$s3_region" \
        AWS_REGION="$s3_region" \
        AWS_EC2_METADATA_DISABLED=true \
        aws \
            --endpoint-url "$s3_endpoint_url" \
            s3 cp \
            "$local_file_path" \
            "$s3_uri" \
            --only-show-errors
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
            NOTARY_PROFILE_OVERRIDE="$2"
            shift 2
            ;;
        --publish-s3)
            SHOULD_PUBLISH_S3=true
            shift
            ;;
        --s3-bucket)
            [[ $# -ge 2 ]] || fail "Missing value for --s3-bucket"
            S3_BUCKET_OVERRIDE="$2"
            shift 2
            ;;
        --s3-prefix)
            [[ $# -ge 2 ]] || fail "Missing value for --s3-prefix"
            S3_RELEASE_PREFIX_OVERRIDE="$2"
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

apply_env_file_default_if_missing "CLICKY_WEB_BASE_URL"
apply_env_file_default_if_missing "CLICKY_WORKER_BASE_URL"
apply_env_file_default_if_missing "APPLE_NOTARY_PROFILE"
apply_env_file_default_if_missing "APP_AWS_ACCESS_KEY"
apply_env_file_default_if_missing "APP_AWS_SECRET_KEY"
apply_env_file_default_if_missing "APP_AWS_S3_ENDPOINT"
apply_env_file_default_if_missing "APP_AWS_S3_BUCKET"
apply_env_file_default_if_missing "APP_AWS_S3_REGION"
apply_env_file_default_if_missing "APP_AWS_S3_RELEASE_PREFIX"

CLICKY_WEB_BASE_URL="${WEB_BASE_URL_OVERRIDE:-${CLICKY_WEB_BASE_URL:-}}"
CLICKY_WORKER_BASE_URL="${WORKER_BASE_URL_OVERRIDE:-${CLICKY_WORKER_BASE_URL:-}}"
NOTARY_PROFILE="${NOTARY_PROFILE_OVERRIDE:-${APPLE_NOTARY_PROFILE:-AC_PASSWORD}}"
APP_AWS_ACCESS_KEY="${APP_AWS_ACCESS_KEY:-}"
APP_AWS_SECRET_KEY="${APP_AWS_SECRET_KEY:-}"
APP_AWS_S3_ENDPOINT="${APP_AWS_S3_ENDPOINT:-}"
APP_AWS_S3_BUCKET="${S3_BUCKET_OVERRIDE:-${APP_AWS_S3_BUCKET:-}}"
APP_AWS_S3_REGION="${APP_AWS_S3_REGION:-auto}"
APP_AWS_S3_RELEASE_PREFIX="${S3_RELEASE_PREFIX_OVERRIDE:-${APP_AWS_S3_RELEASE_PREFIX:-$DEFAULT_S3_RELEASE_PREFIX}}"
APP_AWS_S3_RELEASE_PREFIX="$(normalize_s3_object_prefix "$APP_AWS_S3_RELEASE_PREFIX")"

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

if $SHOULD_PUBLISH_S3; then
    require_command aws
    require_value "$APP_AWS_ACCESS_KEY" "APP_AWS_ACCESS_KEY"
    require_value "$APP_AWS_SECRET_KEY" "APP_AWS_SECRET_KEY"
    require_value "$APP_AWS_S3_ENDPOINT" "APP_AWS_S3_ENDPOINT"
    require_value "$APP_AWS_S3_BUCKET" "APP_AWS_S3_BUCKET or --s3-bucket"
fi

echo "Preparing Pointerly production build..."
echo "  Web base URL:    ${CLICKY_WEB_BASE_URL}"
echo "  Worker base URL: ${CLICKY_WORKER_BASE_URL}"
echo "  Notarization:    ${SHOULD_NOTARIZE}"
echo "  Create DMG:      ${SHOULD_CREATE_DMG}"
echo "  Publish to S3:   ${SHOULD_PUBLISH_S3}"
if $SHOULD_PUBLISH_S3; then
    echo "  S3 endpoint:     ${APP_AWS_S3_ENDPOINT}"
    echo "  S3 bucket:       ${APP_AWS_S3_BUCKET}"
    echo "  S3 prefix:       ${APP_AWS_S3_RELEASE_PREFIX:-/}"
fi

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
ARTIFACT_PATHS_TO_PUBLISH=(
    "$ZIP_PATH"
    "${ZIP_PATH}.sha256"
)

if [[ -n "$DMG_PATH" ]]; then
    ARTIFACT_PATHS_TO_PUBLISH+=(
        "$DMG_PATH"
        "${DMG_PATH}.sha256"
    )
fi

ARTIFACT_PATHS_TO_PUBLISH+=("$MANIFEST_PATH")

PUBLISHED_S3_URIS=()
if $SHOULD_PUBLISH_S3; then
    for artifact_path in "${ARTIFACT_PATHS_TO_PUBLISH[@]}"; do
        artifact_file_name="$(basename "$artifact_path")"
        artifact_object_key="$(build_s3_object_key "$APP_AWS_S3_RELEASE_PREFIX" "$artifact_file_name")"
        PUBLISHED_S3_URIS+=("s3://${APP_AWS_S3_BUCKET}/${artifact_object_key}")
    done
fi

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
    if $SHOULD_PUBLISH_S3; then
        echo "Published S3 Endpoint: ${APP_AWS_S3_ENDPOINT}"
        echo "Published S3 Bucket: ${APP_AWS_S3_BUCKET}"
        echo "Published S3 Prefix: ${APP_AWS_S3_RELEASE_PREFIX:-/}"
        echo "Published Files:"
        for published_s3_uri in "${PUBLISHED_S3_URIS[@]}"; do
            echo "  ${published_s3_uri}"
        done
    fi
} > "$MANIFEST_PATH"

if $SHOULD_PUBLISH_S3; then
    echo "Publishing release artifacts to Cloudflare R2/S3..."
    for artifact_path in "${ARTIFACT_PATHS_TO_PUBLISH[@]}"; do
        artifact_file_name="$(basename "$artifact_path")"
        artifact_object_key="$(build_s3_object_key "$APP_AWS_S3_RELEASE_PREFIX" "$artifact_file_name")"
        upload_file_to_s3 \
            "$artifact_path" \
            "$APP_AWS_S3_BUCKET" \
            "$artifact_object_key" \
            "$APP_AWS_S3_ENDPOINT" \
            "$APP_AWS_S3_REGION" \
            "$APP_AWS_ACCESS_KEY" \
            "$APP_AWS_SECRET_KEY"
    done
fi

echo
echo "Production artifacts are ready."
if [[ -n "$DMG_PATH" ]]; then
    echo "  DMG:      ${DMG_PATH}"
fi
echo "  ZIP:      ${ZIP_PATH}"
echo "  Manifest: ${MANIFEST_PATH}"
echo
if $SHOULD_PUBLISH_S3; then
    echo "Artifacts were uploaded to s3://${APP_AWS_S3_BUCKET}/${APP_AWS_S3_RELEASE_PREFIX}"
else
    echo "Upload the files from ${ARTIFACTS_DIR} to your S3 release folder."
fi
