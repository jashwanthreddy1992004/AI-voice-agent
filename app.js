// Loaded from a CDN so the app works with zero build step.
// If you'd rather bundle it (Vite/webpack), `npm install @elevenlabs/client`
// and change this import to: import { Conversation } from "@elevenlabs/client";
import { Conversation } from "https://esm.sh/@elevenlabs/client@1.17.0";

const els = {
  startBtn: document.getElementById("startBtn"),
  endBtn: document.getElementById("endBtn"),
  muteBtn: document.getElementById("muteBtn"),
  agentSelect: document.getElementById("agentSelect"),
  orb: document.getElementById("orb"),
  statusText: document.getElementById("statusText"),
  errorBanner: document.getElementById("errorBanner"),
  transcript: document.getElementById("transcript"),
  statTotalCalls: document.getElementById("statTotalCalls"),
  statTotalDuration: document.getElementById("statTotalDuration"),
  statLastDuration: document.getElementById("statLastDuration"),
};

const STORAGE_KEY = "voice_agent_analytics";

let conversation = null;
let callStartTime = null;
let isMuted = false;

// ---------- Analytics (bonus feature: duration + call count) ----------

function loadAnalytics() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { totalCalls: 0, totalDurationSec: 0, lastDurationSec: 0 };
  } catch {
    return { totalCalls: 0, totalDurationSec: 0, lastDurationSec: 0 };
  }
}

function saveAnalytics(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function formatDuration(sec) {
  const total = Math.max(0, Math.floor(sec));
  return `${Math.floor(total / 60)}m ${total % 60}s`;
}

function renderAnalytics() {
  const a = loadAnalytics();
  els.statTotalCalls.textContent = a.totalCalls;
  els.statTotalDuration.textContent = formatDuration(a.totalDurationSec);
  els.statLastDuration.textContent = formatDuration(a.lastDurationSec);
}

function recordCallEnd() {
  if (!callStartTime) return;
  const durationSec = (Date.now() - callStartTime) / 1000;
  const a = loadAnalytics();
  a.totalCalls += 1;
  a.totalDurationSec += durationSec;
  a.lastDurationSec = durationSec;
  saveAnalytics(a);
  renderAnalytics();
  callStartTime = null;
}

// ---------- UI state ----------

function setState(state) {
  // idle | connecting | listening | speaking
  els.orb.dataset.state = state;
  const labels = {
    idle: "Idle — press Start to talk",
    connecting: "Connecting…",
    listening: "Listening…",
    speaking: "Agent speaking…",
  };
  els.statusText.textContent = labels[state] || state;
}

function showError(message) {
  els.errorBanner.textContent = message;
  els.errorBanner.classList.remove("hidden");
}

function clearError() {
  els.errorBanner.classList.add("hidden");
  els.errorBanner.textContent = "";
}

function appendTranscript(role, text) {
  if (!text) return;
  const line = document.createElement("div");
  line.className = `line ${role}`;
  const roleLabel = document.createElement("span");
  roleLabel.className = "role";
  roleLabel.textContent = role === "user" ? "You" : "Agent";
  const textEl = document.createElement("span");
  textEl.className = "text";
  textEl.textContent = text;
  line.append(roleLabel, textEl);
  els.transcript.appendChild(line);
  els.transcript.scrollTop = els.transcript.scrollHeight;
}

// ---------- Backend calls ----------

async function loadAgents() {
  try {
    const res = await fetch("/api/agents");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load agents");

    els.agentSelect.innerHTML = "";
    data.agents.forEach((agent) => {
      const opt = document.createElement("option");
      opt.value = agent.id;
      opt.textContent = agent.name;
      els.agentSelect.appendChild(opt);
    });
  } catch (err) {
    console.error(err);
    showError(err.message || "Could not load the agent list. Is the server running?");
  }
}

async function getSignedUrl(agentId) {
  const res = await fetch(`/api/signed-url?agentId=${encodeURIComponent(agentId)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to fetch a signed URL from the server.");
  return data.signedUrl;
}

// ---------- Call lifecycle ----------

async function startCall() {
  clearError();
  els.transcript.innerHTML = "";
  els.startBtn.disabled = true;
  setState("connecting");

  // Ask for microphone permission up front so we can show a clear, specific
  // error instead of a confusing failure deeper in the SDK.
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    console.error(err);
    setState("idle");
    els.startBtn.disabled = false;
    showError(
      "Microphone access was denied or unavailable. Please allow microphone permissions for this site and try again."
    );
    return;
  }

  const agentId = els.agentSelect.value;
  if (!agentId) {
    setState("idle");
    els.startBtn.disabled = false;
    showError("No agent selected. Configure AGENT_ID in your .env file.");
    return;
  }

  try {
    const signedUrl = await getSignedUrl(agentId);

    conversation = await Conversation.startSession({
      signedUrl,

      onConnect: () => {
        setState("listening");
        els.endBtn.disabled = false;
        els.muteBtn.disabled = false;
        els.agentSelect.disabled = true;
        callStartTime = Date.now();
      },

      onDisconnect: () => {
        recordCallEnd();
        resetToIdle();
      },

      // Handles both listening -> speaking transitions and, importantly,
      // speaking -> listening transitions caused by the user interrupting
      // the agent (barge-in). The SDK's built-in turn-taking model detects
      // the interruption, stops playback, and fires this callback — no
      // extra code needed on our end to support barge-in.
      onModeChange: ({ mode }) => {
        if (mode === "speaking") setState("speaking");
        else if (mode === "listening") setState("listening");
      },

      onStatusChange: ({ status }) => {
        if (status === "connecting") setState("connecting");
        if (status === "disconnected") {
          recordCallEnd();
          resetToIdle();
        }
      },

      onMessage: ({ source, message }) => {
        appendTranscript(source === "user" ? "user" : "agent", message);
      },

      onError: (message) => {
        console.error("Conversation error:", message);
        showError(typeof message === "string" ? message : "The conversation hit an unexpected error.");
      },
    });
  } catch (err) {
    console.error(err);
    setState("idle");
    els.startBtn.disabled = false;
    showError(err.message || "Could not start the conversation. Please check your connection and try again.");
  }
}

async function endCall() {
  if (!conversation) return;
  try {
    await conversation.endSession();
  } catch (err) {
    console.error("Error ending session:", err);
  }
  recordCallEnd();
  resetToIdle();
}

function resetToIdle() {
  conversation = null;
  setState("idle");
  els.startBtn.disabled = false;
  els.endBtn.disabled = true;
  els.muteBtn.disabled = true;
  els.agentSelect.disabled = false;
  isMuted = false;
  els.muteBtn.textContent = "Mute";
}

function toggleMute() {
  if (!conversation) return;
  isMuted = !isMuted;
  conversation.setMicMuted(isMuted);
  els.muteBtn.textContent = isMuted ? "Unmute" : "Mute";
}

// ---------- Wire up ----------

els.startBtn.addEventListener("click", startCall);
els.endBtn.addEventListener("click", endCall);
els.muteBtn.addEventListener("click", toggleMute);

// Warn the user before they navigate away mid-call so a call is never lost silently.
window.addEventListener("beforeunload", (e) => {
  if (conversation) {
    e.preventDefault();
    e.returnValue = "";
  }
});

renderAnalytics();
loadAgents();
setState("idle");
