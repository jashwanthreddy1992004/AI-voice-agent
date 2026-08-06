import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const API_KEY = process.env.ELEVENLABS_API_KEY;
const DEFAULT_AGENT_ID = process.env.AGENT_ID;

// Build the list of selectable agents from env vars.
// AGENT_ID / AGENT_NAME is agent #1. AGENT_ID_2 / AGENT_ID_3 are optional extras
// that power the "switch between agents" bonus feature.
const AGENTS = [
  DEFAULT_AGENT_ID ? { id: DEFAULT_AGENT_ID, name: process.env.AGENT_NAME || 'Default Agent' } : null,
  process.env.AGENT_ID_2 ? { id: process.env.AGENT_ID_2, name: process.env.AGENT_NAME_2 || 'Agent 2' } : null,
  process.env.AGENT_ID_3 ? { id: process.env.AGENT_ID_3, name: process.env.AGENT_NAME_3 || 'Agent 3' } : null,
].filter(Boolean);

// GET /api/agents -> list of agents the frontend can offer in the dropdown
app.get('/api/agents', (req, res) => {
  if (AGENTS.length === 0) {
    return res.status(500).json({
      error: 'No agents configured. Set AGENT_ID (and optionally AGENT_ID_2 / AGENT_ID_3) in your .env file.',
    });
  }
  res.json({ agents: AGENTS });
});

// GET /api/signed-url?agentId=... -> short-lived signed URL the browser uses to
// open the voice WebSocket connection directly with ElevenLabs.
// The ElevenLabs API key is only ever used here, on the server, never sent to the client.
app.get('/api/signed-url', async (req, res) => {
  const agentId = req.query.agentId || DEFAULT_AGENT_ID;

  if (!API_KEY) {
    return res.status(500).json({ error: 'Server is missing ELEVENLABS_API_KEY. Add it to your .env file and restart the server.' });
  }
  if (!agentId) {
    return res.status(400).json({ error: 'No agentId was provided and no default AGENT_ID is configured.' });
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
      {
        method: 'GET',
        headers: { 'xi-api-key': API_KEY },
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('ElevenLabs signed-url error:', response.status, errText);
      return res.status(502).json({
        error: 'ElevenLabs rejected the request. Double-check your API key and agent ID are correct and that the agent exists.',
      });
    }

    const data = await response.json();
    res.json({ signedUrl: data.signed_url });
  } catch (err) {
    console.error('Signed URL request failed:', err);
    res.status(500).json({ error: 'Unexpected server error while contacting ElevenLabs. Please try again.' });
  }
});

// Basic health check, useful for confirming the server is up before recording the demo
app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  Voice agent server running:  http://localhost:${PORT}\n`);
  if (!API_KEY) console.warn('  WARNING: ELEVENLABS_API_KEY is not set. Copy .env.example to .env and fill it in.');
  if (AGENTS.length === 0) console.warn('  WARNING: No AGENT_ID set. The agent dropdown will be empty.');
});
