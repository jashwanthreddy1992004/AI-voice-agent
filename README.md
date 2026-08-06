# AI Voice Agent

A small full-stack web app that lets a user have a real-time, spoken conversation
with an AI agent, powered by the **ElevenLabs Conversational AI** API.

Talk to the agent with your microphone, watch it listen and respond in real time,
interrupt it mid-sentence, switch between multiple configured agents, and see
basic call analytics — all from the browser.

## Features

| Requirement | Status | How |
|---|---|---|
| Integrate an AI Voice Agent (ElevenLabs) | ✅ | `@elevenlabs/client` SDK, WebSocket voice session |
| Start / end a voice conversation | ✅ | Start Call / End Call buttons |
| Listening / speaking / idle states | ✅ | Animated orb driven by `onModeChange` / `onStatusChange` |
| Handle mic permissions gracefully | ✅ | Explicit `getUserMedia` request with a clear error banner on denial |
| Handle connection failures gracefully | ✅ | Try/catch around session start, `onError` callback, backend error handling |
| Low-latency conversation | ✅ | Direct WebSocket session between the browser and ElevenLabs (audio never round-trips through our server) |
| **Bonus:** Interruption / barge-in | ✅ | Native to the ElevenLabs turn-taking model — see [How barge-in works](#how-barge-in-works) |
| **Bonus:** Switch between multiple agents | ✅ | Dropdown populated from `.env`, backed by `/api/agents` |
| **Bonus:** Call analytics | ✅ | Total conversations, total talk time, last call duration (stored in `localStorage`) |

## Architecture

```
Browser (public/)                 Node/Express server (server.js)         ElevenLabs
──────────────────                ─────────────────────────────           ──────────
index.html / style.css
app.js
  │
  ├─ 1. GET /api/agents  ────────▶ returns configured agent list
  │
  ├─ 2. GET /api/signed-url ─────▶ calls ElevenLabs "get-signed-url"  ───▶ ElevenLabs API
  │                                 using ELEVENLABS_API_KEY (server-side only)
  │◀── signed WebSocket URL ──────
  │
  └─ 3. Conversation.startSession({ signedUrl }) ─────────────────────────▶ Direct WS session
       (mic audio out, agent audio in — no server hop, low latency)
```

**Why a backend at all, if it's "just a web app"?** The ElevenLabs API key must
never be shipped to the browser. The Express server's only real job is to
exchange that secret key for a short-lived *signed URL* on the agent's behalf.
Once the browser has the signed URL, it opens a direct WebSocket connection to
ElevenLabs — the server is not in the audio path, so latency stays low.

## Project structure

```
ai-voice-agent/
├── server.js            # Express server: static hosting + signed-url proxy
├── package.json
├── .env.example          # copy to .env and fill in your keys
├── .gitignore
└── public/
    ├── index.html         # UI markup
    ├── style.css           # dark theme + animated status orb
    └── app.js               # conversation lifecycle, mic handling, analytics
```

## Setup instructions

### 1. Create an ElevenLabs account and an agent

1. Sign up at [elevenlabs.io](https://elevenlabs.io/app/sign-up).
2. Go to **Conversational AI** in the dashboard and create a new agent
   (pick any name, voice, and a simple system prompt — e.g. "You are a
   friendly assistant. Keep answers short.").
3. Copy the **Agent ID** shown for your agent.
4. Go to **Settings → API Keys** and copy your **API key**.

   > If you want the "switch agents" bonus feature to do something visible,
   > repeat step 2–3 to create a second (and optionally third) agent with a
   > different voice or personality.

### 2. Install prerequisites

You need [Node.js](https://nodejs.org/) version 18 or later installed.
Check with:

```bash
node -v
```

### 3. Install dependencies

```bash
cd ai-voice-agent
npm install
```

### 4. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in:

```
ELEVENLABS_API_KEY=sk_...           # from Settings → API Keys
AGENT_ID=agent_...                  # your agent's ID
AGENT_NAME=Default Agent

# optional — only fill these in if you made extra agents
AGENT_ID_2=
AGENT_NAME_2=
```

### 5. Run the app

```bash
npm start
```

Open **http://localhost:3000** in your browser (Chrome recommended).

### 6. Talk to it

1. Click **Start Call**.
2. Approve the microphone permission prompt.
3. Wait for the orb to say "Listening…" and start talking.
4. Try talking over the agent while it's speaking — it should stop and
   listen to you (barge-in).
5. Click **End Call** when you're done. Check the **Call Analytics** panel.

## How barge-in works

ElevenLabs agents use server-side Voice Activity Detection (VAD) as part of
their turn-taking model: while the agent is speaking, it's still listening,
and if it detects the user has started talking, it stops its own audio and
yields the turn. The client SDK surfaces this automatically through the
`onModeChange` callback (`mode` flips from `"speaking"` back to
`"listening"`), which is what drives the orb animation in this app — no
custom interruption logic was needed on the client.

## Error handling

- **Mic permission denied** → caught before the session even starts;
  shows a specific banner instead of a generic failure.
- **No agent configured / bad agent ID** → the `/api/signed-url` endpoint
  returns a descriptive error instead of a raw 500.
- **Missing API key** → server logs a warning on boot and the endpoint
  fails fast with a clear message rather than a confusing ElevenLabs error.
- **Dropped WebSocket connection** → `onDisconnect` / `onStatusChange`
  reset the UI back to idle and stop the call timer so state never gets
  stuck mid-call.

## Troubleshooting

- **"No agents configured"** — you haven't set `AGENT_ID` in `.env`, or you
  forgot to restart `npm start` after editing it.
- **Mic icon never lights up in the browser tab** — some browsers only
  allow microphone access on `localhost` or `https`, never on a plain
  `file://` page. Always access this app via `http://localhost:3000`.
- **502 from `/api/signed-url`** — usually a wrong API key or agent ID, or
  the agent was deleted. Double check both in the ElevenLabs dashboard.

## Tech stack

- **Backend:** Node.js, Express
- **Frontend:** vanilla HTML/CSS/JS (no build step — `@elevenlabs/client`
  is loaded from a CDN as an ES module), `localStorage` for analytics
- **Voice AI:** ElevenLabs Conversational AI (`@elevenlabs/client`)

## Notes for the demo video

A good 2–3 minute walkthrough covers:

1. Quick look at the code structure and the `.env` setup (skip past the
   real API key).
2. Start a call, show the idle → connecting → listening → speaking states.
3. Interrupt the agent mid-response to show barge-in.
4. Deny the mic permission once (in a fresh browser profile or via site
   settings) to show the graceful error banner.
5. Switch to a second agent (if configured) and start a new call.
6. End the call and show the analytics panel updating.
