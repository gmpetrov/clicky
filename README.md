# Hi, this is Clicky.
It's an AI teacher that lives as a buddy next to your cursor. It can see your screen, talk to you, and even point at stuff. Kinda like having a real teacher next to you.

Download it [here](https://www.clicky.so/) for free.

Here's the [original tweet](https://x.com/FarzaTV/status/2041314633978659092) that kinda blew up for a demo for more context.

![Clicky — an ai buddy that lives on your mac](clicky-demo.gif)

This is the open-source version of Clicky for those that want to hack on it, build their own features, or just see how it works under the hood.

The repo now includes:

- A Next.js web app for the landing page, auth, billing, dashboard, and desktop device authorization
- PostgreSQL + Prisma for auth and subscription data
- Better Auth for email/password auth, optional Google auth, bearer tokens, and device login
- Stripe billing using the existing Starter monthly plan
- A Cloudflare Worker that proxies OpenRouter, ElevenLabs, and AssemblyAI after validating the desktop bearer token and active subscription
- Usage metering that writes per-call AI cost events and billing-period summaries into PostgreSQL for future dashboard/reporting work

## Get started with Claude Code

The fastest way to get this running is with [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

Once you get Claude running, paste this:

```
Hi Claude.

Clone https://github.com/farzaa/clicky.git into my current directory.

Then read the CLAUDE.md. I want to get Clicky running locally on my Mac.

Help me set up everything — the Cloudflare Worker with my own API keys, the proxy URLs, and getting it building in Xcode. Walk me through it.
```

That's it. It'll clone the repo, read the docs, and walk you through the whole setup. Once you're running you can just keep talking to it — build features, fix bugs, whatever. Go crazy.

## Manual setup

If you want to do it yourself, here's the deal.

### Prerequisites

- macOS 14.2+ (for ScreenCaptureKit)
- Xcode 15+
- Node.js 22+ (tested with Next.js 16.2)
- PostgreSQL running locally at the `DATABASE_URL` in the root `.env`
- A [Cloudflare](https://cloudflare.com) account (free tier works)
- API keys for: [OpenRouter](https://openrouter.ai), [AssemblyAI](https://www.assemblyai.com), [ElevenLabs](https://elevenlabs.io)

### 1. Install the web app and generate auth/database artifacts

The repo root is now the Next.js app.

```bash
npm install
npm run db:generate
npm run auth:generate
```

The root `.env` should contain the local values for:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `NEXT_PUBLIC_APP_URL`
- `CLICKY_WORKER_BASE_URL`
- `CLICKY_DESKTOP_CLIENT_ID`
- `USAGE_METERING_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_STARTER_MONTHLY_PRICE_ID`
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`
- `OPENROUTER_OPUS_MODEL`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_VOICE_ID`
- `ELEVENLABS_FLASH_V2_5_PRICE_PER_1K_CHARACTERS_USD`
- `ASSEMBLYAI_API_KEY`
- `ASSEMBLYAI_U3_RT_PRO_PRICE_PER_HOUR_USD`
- `ASSEMBLYAI_KEYTERMS_PRICE_PER_HOUR_USD`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

If you want Google auth on the web, set real Google OAuth credentials and flip `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`.

### 2. Run the web app

```bash
npm run typecheck
npm run lint
npm run build
npm run dev
```

### 3. Set up the Cloudflare Worker

The Worker is the authenticated AI proxy. The macOS app sends the Better Auth bearer token with every request, the Worker checks subscription state against the Next.js `/api/desktop/account` route, and only then forwards the request to OpenRouter, ElevenLabs, or AssemblyAI.

```bash
cd worker
npm install
```

Now add your secrets. Wrangler will prompt you to paste each one:

```bash
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put ASSEMBLYAI_API_KEY
npx wrangler secret put ELEVENLABS_API_KEY
npx wrangler secret put USAGE_METERING_SECRET
```

For the non-secret Worker vars, open `wrangler.toml` and set them there:

```toml
[vars]
ELEVENLABS_VOICE_ID = "your-voice-id-here"
CLICKY_APP_URL = "http://localhost:3000"
```

Deploy it:

```bash
npx wrangler deploy
```

### 4. Run the Worker locally (for development)

If you want to test changes to the Worker without deploying:

```bash
cd worker
npx wrangler dev
```

This starts the local Worker on `http://localhost:8787`, which is the port the macOS app expects during local development. Create a `.dev.vars` file in `worker/` with the same secret values you used with Wrangler:

```
OPENROUTER_API_KEY=sk-or-...
ASSEMBLYAI_API_KEY=...
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
CLICKY_APP_URL=http://localhost:3000
```

For cost tracking, the Next.js app computes:

- OpenRouter cost from the provider-reported usage payload returned on the final streaming chunk
- ElevenLabs cost from the configured `ELEVENLABS_FLASH_V2_5_PRICE_PER_1K_CHARACTERS_USD`
- AssemblyAI streaming cost from the configured hourly rates and the billed session duration reported by the desktop app

The macOS app reads the local Worker and web URLs from `Info.plist`, so you usually do not need to patch Swift source anymore.

### 5. Open in Xcode and run the macOS app

```bash
open leanring-buddy.xcodeproj
```

In Xcode:
1. Select the `leanring-buddy` scheme (yes, the typo is intentional, long story)
2. Set your signing team under Signing & Capabilities
3. Hit **Cmd + R** to build and run

The app will appear in your menu bar (not the dock). Click the icon to open the panel, sign in through the browser, subscribe to Starter if needed, approve the device code, grant the permissions it asks for, and you're good.

### Permissions the app needs

- **Microphone** — for push-to-talk voice capture
- **Accessibility** — for the global keyboard shortcut (Control + Option)
- **Screen Recording** — for taking screenshots when you use the hotkey
- **Screen Content** — for ScreenCaptureKit access

## Architecture

If you want the full technical breakdown, read `CLAUDE.md`. But here's the short version:

**Web app + native app**. The Next.js app at the repo root owns auth, Stripe billing, dashboard management, and Better Auth device authorization. The macOS menu bar app uses the browser-based device flow to get a bearer token, stores that token in Keychain, and sends it to the Cloudflare Worker for every AI request. The Worker validates the token and active subscription against the Next.js backend before proxying to OpenRouter, ElevenLabs, or AssemblyAI. The model can still embed `[POINT:x,y:label:screenN]` tags so the cursor flies to the right place across multiple monitors.

## Project structure

```
src/                     # Next.js app, auth, billing, dashboard
  app/                      # Landing page, pricing, dashboard, device auth pages
  lib/auth.ts               # Better Auth + Stripe + Prisma configuration
prisma/                  # Prisma schema and migrations for auth, subscriptions, and usage metering
leanring-buddy/          # Swift source (yes, the typo stays)
  CompanionManager.swift    # Native state machine + entitlement gating
  ClickyAccountManager.swift # Better Auth device flow + subscription state
  ClickyUsageMeteringClient.swift # Reports AssemblyAI streaming usage back to the web app
  OpenRouterAPI.swift       # Authenticated chat client for the Worker
worker/                  # Cloudflare Worker proxy
  src/index.ts              # Authenticated AI proxy + worker-side usage metering for /chat and /tts
CLAUDE.md                # Full architecture doc (agents read this)
```

## Contributing

PRs welcome. If you're using Claude Code, it already knows the codebase — just tell it what you want to build and point it at `CLAUDE.md`.

Got feedback? DM me on X [@farzatv](https://x.com/farzatv).
