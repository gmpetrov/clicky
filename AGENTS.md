# Clicky - Agent Instructions

<!-- This is the single source of truth for all AI coding agents. CLAUDE.md is a symlink to this file. -->
<!-- AGENTS.md spec: https://github.com/agentsmd/agents.md — supported by Claude Code, Cursor, Copilot, Gemini CLI, and others. -->

## Overview

Clicky now has two surfaces:

1. A macOS menu bar companion app that lives entirely in the status bar (no dock icon, no main window). Clicking the menu bar icon opens a custom floating panel with voice controls, account state, and the paywall gate. Push-to-talk (ctrl+option) captures voice input, transcribes it via AssemblyAI streaming, and sends the transcript plus screenshots of the user's screen through the authenticated worker. The AI responds with text (streamed via SSE) and voice (ElevenLabs TTS). A blue cursor overlay can fly to and point at UI elements the model references on any connected monitor.
2. A Next.js web app that handles landing page marketing, auth, billing, dashboard management, and Better Auth device authorization for the desktop app.

AI provider keys live on the Cloudflare Worker. Auth and billing secrets live server-side in the Next.js app. Nothing sensitive ships in the macOS app binary.

## Architecture

- **App Type**: Menu bar-only (`LSUIElement=true`), no dock icon or main window
- **Framework**: SwiftUI (macOS native) with AppKit bridging for menu bar panel and cursor overlay
- **Web App**: Next.js 16 App Router at repo root with server components and client auth/billing islands
- **Web Styling**: Tailwind CSS v4 + shadcn/ui with the `b3XpCmvNqK` preset powering the dashboard component layer
- **Pattern**: MVVM with `@StateObject` / `@Published` state management
- **Database**: PostgreSQL via Prisma 7
- **Authentication**: Better Auth with email/password, optional Google OAuth, bearer tokens, and device authorization
- **Billing**: Stripe via the Better Auth Stripe plugin using the existing Starter monthly price
- **AI Chat**: OpenRouter (Anthropic Sonnet 4.6 default, Opus 4.6 optional) via Cloudflare Worker proxy with SSE streaming
- **Speech-to-Text**: AssemblyAI real-time streaming (`u3-rt-pro` model) via websocket, with OpenAI and Apple Speech as fallbacks
- **Text-to-Speech**: ElevenLabs (`eleven_flash_v2_5` model) via Cloudflare Worker proxy
- **Screen Capture**: ScreenCaptureKit (macOS 14.2+), multi-monitor support
- **Voice Input**: Push-to-talk via `AVAudioEngine` + pluggable transcription-provider layer. System-wide keyboard shortcut via listen-only CGEvent tap.
- **Desktop Auth Flow**: The macOS app requests a Better Auth device code, opens the browser to approve it, stores the returned bearer token in Keychain, and reuses that token for dashboard and worker access
- **Paywall Enforcement**: The macOS panel blocks usage when the user is signed out or unsubscribed. The Worker also validates the bearer token against the Next.js entitlement endpoint before proxying AI requests
- **Usage Metering**: OpenRouter and ElevenLabs usage is recorded from the Worker, while AssemblyAI streaming usage is reported from the macOS app after websocket termination. The Next.js app stores an append-only usage ledger plus billing-period cost summaries in PostgreSQL for later dashboard/reporting work.
- **Element Pointing**: The model embeds `[POINT:x,y:label:screenN]` tags in responses. The overlay parses these, maps coordinates to the correct monitor, and animates the blue cursor along a bezier arc to the target.
- **Concurrency**: `@MainActor` isolation, async/await throughout
- **Analytics**: PostHog via `ClickyAnalytics.swift`

### API Proxy (Cloudflare Worker)

The macOS app never calls OpenRouter or ElevenLabs directly. All chat and TTS requests go through the Cloudflare Worker (`worker/src/index.ts`). The Worker requires the desktop bearer token on every route, checks entitlement against the Next.js backend, proxies the request upstream, and asynchronously posts usage events back to the Next.js app. AssemblyAI transcription still uses a direct websocket from the macOS app, so the desktop app reports the billed session duration to the Next.js backend after each completed stream.

| Route | Upstream | Purpose |
|-------|----------|---------|
| `POST /chat` | `openrouter.ai/api/v1/chat/completions` | OpenRouter vision + streaming chat |
| `POST /tts` | `api.elevenlabs.io/v1/text-to-speech/{voiceId}` | ElevenLabs TTS audio |
| `POST /transcribe-token` | `streaming.assemblyai.com/v3/token` | Fetches a short-lived (480s) AssemblyAI websocket token |

Worker secrets: `OPENROUTER_API_KEY`, `ASSEMBLYAI_API_KEY`, `ELEVENLABS_API_KEY`, `USAGE_METERING_SECRET`
Worker vars: `ELEVENLABS_VOICE_ID`, `CLICKY_APP_URL`

### Key Architecture Decisions

**Menu Bar Panel Pattern**: The companion panel uses `NSStatusItem` for the menu bar icon and a custom borderless `NSPanel` for the floating control panel. This gives full control over appearance (dark, rounded corners, custom shadow) and avoids the standard macOS menu/popover chrome. The panel is non-activating so it doesn't steal focus. A global event monitor auto-dismisses it on outside clicks.

**Cursor Overlay**: A full-screen transparent `NSPanel` hosts the blue cursor companion. It's non-activating, joins all Spaces, and never steals focus. The cursor position, response text, waveform, and pointing animations all render in this overlay via SwiftUI through `NSHostingView`.

**Global Push-To-Talk Shortcut**: Background push-to-talk uses a listen-only `CGEvent` tap instead of an AppKit global monitor so modifier-based shortcuts like `ctrl + option` are detected more reliably while the app is running in the background.

**Shared URLSession for AssemblyAI**: A single long-lived `URLSession` is shared across all AssemblyAI streaming sessions (owned by the provider, not the session). Creating and invalidating a URLSession per session corrupts the OS connection pool and causes "Socket is not connected" errors after a few rapid reconnections.

**Desktop Device Authorization**: The macOS app uses Better Auth's OAuth 2.0 device authorization flow rather than embedding a full browser session. Users approve the device on the Next.js site, the app stores the returned bearer token in Keychain, and the same token authenticates both dashboard lookups and Worker requests.

**Server-Side Paywall**: The panel UI blocks the assistant when the account is unsigned or unsubscribed, but the actual enforcement lives in the Worker. Every `/chat`, `/tts`, and `/transcribe-token` call forwards the bearer token to the Next.js entitlement route, so unsubscribed users cannot bypass the paywall by hitting the worker directly.

**Usage Ledger + Period Summary**: Cost tracking is split into two tables. `usageEvent` stores immutable per-call usage rows with raw usage fields and computed cost, while `usagePeriodSummary` keeps the running total for the active subscription period. This makes backfills and recalculations possible later without losing the original usage basis.

**Transient Cursor Mode**: When "Show Clicky" is off, pressing the hotkey fades in the cursor overlay for the duration of the interaction (recording → response → TTS → optional pointing), then fades it out automatically after 1 second of inactivity.

## Key Files

| File | Lines | Purpose |
|------|-------|---------|
| `leanring_buddyApp.swift` | ~89 | Menu bar app entry point. Uses `@NSApplicationDelegateAdaptor` with `CompanionAppDelegate` which creates `MenuBarPanelManager` and starts `CompanionManager`. No main window — the app lives entirely in the status bar. |
| `CompanionManager.swift` | ~1147 | Central state machine. Owns dictation, desktop entitlement gating, shortcut monitoring, screen capture, OpenRouter requests, ElevenLabs TTS, and overlay management. Tracks voice state, conversation history, model selection, cursor visibility, and whether the signed-in account is allowed to use the desktop assistant. |
| `MenuBarPanelManager.swift` | ~259 | NSStatusItem + custom NSPanel lifecycle. Creates the menu bar icon, manages the floating companion panel, installs click-outside-to-dismiss monitoring, and now listens for notifications that reopen the panel when the user hits the paywall from the hotkey path. |
| `CompanionPanelView.swift` | ~908 | SwiftUI menu bar panel UI. Shows account state, device login prompts, subscription/paywall actions, permissions UI, model picker, onboarding start, and quit/replay controls using the existing design system. |
| `ClickyAccountManager.swift` | ~388 | Native auth and billing state manager. Starts the Better Auth device flow, polls for bearer tokens, stores them in Keychain, refreshes account/subscription status from the Next.js backend, and opens pricing/dashboard links in the browser. |
| `ClickyDesktopSessionStore.swift` | ~84 | Keychain helper for the desktop bearer token used by the Better Auth device flow and Worker authorization. |
| `ClickyUsageMeteringClient.swift` | ~70 | Native background reporter for AssemblyAI metering. Posts authenticated usage events back to the Next.js `/api/desktop/usage-events` route using the desktop bearer token. |
| `OverlayWindow.swift` | ~881 | Full-screen transparent overlay hosting the blue cursor, response text, waveform, and spinner. Handles cursor animation, element pointing with bezier arcs, multi-monitor coordinate mapping, and fade-out transitions. |
| `CompanionResponseOverlay.swift` | ~217 | SwiftUI view for the response text bubble and waveform displayed next to the cursor in the overlay. |
| `CompanionScreenCaptureUtility.swift` | ~132 | Multi-monitor screenshot capture using ScreenCaptureKit. Returns labeled image data for each connected display. |
| `BuddyDictationManager.swift` | ~866 | Push-to-talk voice pipeline. Handles microphone capture via `AVAudioEngine`, provider-aware permission checks, keyboard/button dictation sessions, transcript finalization, shortcut parsing, contextual keyterms, and live audio-level reporting for waveform feedback. |
| `BuddyTranscriptionProvider.swift` | ~100 | Protocol surface and provider factory for voice transcription backends. Resolves provider based on `VoiceTranscriptionProvider` in Info.plist — AssemblyAI, OpenAI, or Apple Speech. |
| `AssemblyAIStreamingTranscriptionProvider.swift` | ~485 | Streaming transcription provider. Fetches temp AssemblyAI tokens from the Worker using the desktop bearer token, opens an AssemblyAI v3 websocket, streams PCM16 audio, tracks turn-based transcripts, and delivers finalized text on key-up. Shares a single URLSession across all sessions. |
| `OpenAIAudioTranscriptionProvider.swift` | ~317 | Upload-based transcription provider. Buffers push-to-talk audio locally, uploads as WAV on release, returns finalized transcript. |
| `AppleSpeechTranscriptionProvider.swift` | ~147 | Local fallback transcription provider backed by Apple's Speech framework. |
| `BuddyAudioConversionSupport.swift` | ~108 | Audio conversion helpers. Converts live mic buffers to PCM16 mono audio and builds WAV payloads for upload-based providers. |
| `GlobalPushToTalkShortcutMonitor.swift` | ~132 | System-wide push-to-talk monitor. Owns the listen-only `CGEvent` tap and publishes press/release transitions. |
| `OpenRouterAPI.swift` | ~222 | Multimodal OpenRouter client for the Worker proxy. Streams chat completions over SSE, forwards the desktop bearer token, and supports image-plus-text prompts for the cursor companion. |
| `OpenAIAPI.swift` | ~142 | OpenAI GPT vision API client. |
| `ElevenLabsTTSClient.swift` | ~89 | ElevenLabs TTS client. Sends text to the Worker proxy with the desktop bearer token, plays back audio via `AVAudioPlayer`, and exposes `isPlaying` for transient cursor scheduling. |
| `DesignSystem.swift` | ~880 | Design system tokens — colors, corner radii, shared styles. All UI references `DS.Colors`, `DS.CornerRadius`, etc. |
| `ClickyAnalytics.swift` | ~121 | PostHog analytics integration for usage tracking. |
| `WindowPositionManager.swift` | ~262 | Window placement logic, Screen Recording permission flow, and accessibility permission helpers. |
| `AppBundleConfiguration.swift` | ~28 | Runtime configuration reader for keys stored in the app bundle Info.plist. |
| `src/lib/auth.ts` | ~65 | Better Auth server configuration. Wires Prisma, email/password auth, optional Google OAuth, bearer tokens, device authorization, and the Stripe subscription plugin to the existing Starter plan. |
| `src/lib/usage-metering.ts` | ~360 | Shared usage-ingestion and aggregation logic. Validates worker/desktop metering payloads, resolves the active billing period, computes provider costs, writes immutable usage rows, and upserts period summaries. |
| `src/app/page.tsx` | ~60 | Minimal marketing landing page. Centered hero, feature grid, pricing section, and the BlueCursorFollower effect that replicates the desktop cursor companion in the browser. |
| `src/components/blue-cursor-follower.tsx` | ~120 | Client component that renders a blue triangle cursor following the user's mouse with spring physics on a fixed canvas overlay, mirroring the desktop app's cursor companion. |
| `src/app/dashboard/page.tsx` | ~120 | Protected dashboard route. Apple-like single-column layout showing account status, subscription, device connection, access checklist, and billing actions. |
| `src/components/ui/button.tsx` | ~65 | shadcn button primitive generated from the preset. Used for dashboard actions and future web app controls. |
| `src/components/ui/card.tsx` | ~100 | shadcn card primitive generated from the preset. Forms the structural building block for the dashboard layout. |
| `src/components/ui/badge.tsx` | ~49 | shadcn badge primitive for entitlement, plan, and section status labels in the dashboard. |
| `src/components/ui/alert.tsx` | ~76 | shadcn alert primitive for inline dashboard errors such as checkout and billing portal failures. |
| `src/components/ui/separator.tsx` | ~28 | shadcn separator primitive used to divide dashboard content sections without custom CSS rules. |
| `src/components/ui/avatar.tsx` | ~112 | shadcn avatar primitive used for the signed-in dashboard identity treatment. |
| `src/app/api/desktop/account/route.ts` | ~27 | Desktop entitlement endpoint. Validates the Better Auth bearer token and returns the signed-in user plus whether the account currently has an active subscription. |
| `src/app/api/desktop/usage-events/route.ts` | ~32 | Authenticated ingestion endpoint for desktop-reported metering such as AssemblyAI streaming session duration. |
| `src/app/api/internal/usage-events/route.ts` | ~32 | Internal ingestion endpoint for Worker-reported metering. Protected by a shared metering secret instead of user auth. |
| `prisma/schema.prisma` | ~156 | Prisma schema for Better Auth, Stripe subscriptions, immutable usage events, and billing-period usage summaries. |
| `proxy.ts` | ~16 | Next.js 16 proxy that performs optimistic cookie checks before allowing `/dashboard` requests through. |
| `worker/src/index.ts` | ~500 | Cloudflare Worker proxy. Three routes: `/chat` (OpenRouter), `/tts` (ElevenLabs), `/transcribe-token` (AssemblyAI temp token). Every route verifies the desktop bearer token and subscription entitlement against the Next.js backend before proxying upstream, and chat/TTS usage is posted back to the web app for billing-period cost tracking. |

## Build & Run

```bash
# Install the web app dependencies
npm install

# Generate Prisma client + Better Auth schema
npm run db:generate
npm run auth:generate

# Validate the web app
npm run typecheck
npm run lint
npm run build

# Open in Xcode for the macOS app
open leanring-buddy.xcodeproj

# Select the leanring-buddy scheme, set signing team, Cmd+R to build and run

# Known non-blocking warnings: Swift 6 concurrency warnings,
# deprecated onChange warning in OverlayWindow.swift. Do NOT attempt to fix these.
```

**Do NOT run `xcodebuild` from the terminal** — it invalidates TCC (Transparency, Consent, and Control) permissions and the app will need to re-request screen recording, accessibility, etc.

## Cloudflare Worker

```bash
# Install the worker dependencies
cd worker
npm install

# Add secrets
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put ASSEMBLYAI_API_KEY
npx wrangler secret put ELEVENLABS_API_KEY
npx wrangler secret put USAGE_METERING_SECRET

# Deploy
npx wrangler deploy

# Local dev (create worker/.dev.vars with your keys)
npx wrangler dev
```

The repo root `.env` now contains the local Next.js, Prisma, Stripe, OpenRouter, ElevenLabs, AssemblyAI, usage metering secret, and local provider-cost assumptions used for cost aggregation. `worker/.dev.vars` should mirror the Worker secrets plus `CLICKY_APP_URL` for local development.
The local Worker dev server is pinned to port `8787` because the macOS app reads that fixed base URL from `Info.plist` during development.

## Code Style & Conventions

### Variable and Method Naming

IMPORTANT: Follow these naming rules strictly. Clarity is the top priority.

- Be as clear and specific with variable and method names as possible
- **Optimize for clarity over concision.** A developer with zero context on the codebase should immediately understand what a variable or method does just from reading its name
- Use longer names when it improves clarity. Do NOT use single-character variable names
- Example: use `originalQuestionLastAnsweredDate` instead of `originalAnswered`
- When passing props or arguments to functions, keep the same names as the original variable. Do not shorten or abbreviate parameter names. If you have `currentCardData`, pass it as `currentCardData`, not `card` or `cardData`

### Code Clarity

- **Clear is better than clever.** Do not write functionality in fewer lines if it makes the code harder to understand
- Write more lines of code if additional lines improve readability and comprehension
- Make things so clear that someone with zero context would completely understand the variable names, method names, what things do, and why they exist
- When a variable or method name alone cannot fully explain something, add a comment explaining what is happening and why

### Swift/SwiftUI Conventions

- Use SwiftUI for all UI unless a feature is only supported in AppKit (e.g., `NSPanel` for floating windows)
- All UI state updates must be on `@MainActor`
- Use async/await for all asynchronous operations
- Comments should explain "why" not just "what", especially for non-obvious AppKit bridging
- AppKit `NSPanel`/`NSWindow` bridged into SwiftUI via `NSHostingView`
- All buttons must show a pointer cursor on hover
- For any interactive element, explicitly think through its hover behavior (cursor, visual feedback, and whether hover should communicate clickability)

### Do NOT

- Do not add features, refactor code, or make "improvements" beyond what was asked
- Do not add docstrings, comments, or type annotations to code you did not change
- Do not try to fix the known non-blocking warnings (Swift 6 concurrency, deprecated onChange)
- Do not rename the project directory or scheme (the "leanring" typo is intentional/legacy)
- Do not run `xcodebuild` from the terminal — it invalidates TCC permissions

## Git Workflow

- Branch naming: `feature/description` or `fix/description`
- Commit messages: imperative mood, concise, explain the "why" not the "what"
- Do not force-push to main

## Self-Update Instructions

<!-- AI agents: follow these instructions to keep this file accurate. -->

When you make changes to this project that affect the information in this file, update this file to reflect those changes. Specifically:

1. **New files**: Add new source files to the "Key Files" table with their purpose and approximate line count
2. **Deleted files**: Remove entries for files that no longer exist
3. **Architecture changes**: Update the architecture section if you introduce new patterns, frameworks, or significant structural changes
4. **Build changes**: Update build commands if the build process changes
5. **New conventions**: If the user establishes a new coding convention during a session, add it to the appropriate conventions section
6. **Line count drift**: If a file's line count changes significantly (>50 lines), update the approximate count in the Key Files table

Do NOT update this file for minor edits, bug fixes, or changes that don't affect the documented architecture or conventions.
