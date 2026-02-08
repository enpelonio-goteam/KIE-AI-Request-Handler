const KIE_BASE = 'https://api.kie.ai';
const KIE_CREATE_TASK_PATH = '/api/v1/jobs/createTask';
const KIE_RUNWAY_PATH = '/api/v1/runway/generate';

const MAX_RETRIES = 4;
const RETRY_DELAY_MS = 1500;

function isRetryableKieError(status, bodyText) {
  if (status !== 500) return false;
  const lower = (bodyText || '').toLowerCase();
  return lower.includes('internal error') && lower.includes('try again later');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callKie(url, body, apiKey) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = null;
  }

  return { status: res.status, bodyText: text, json, ok: res.ok };
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = req.headers?.authorization || req.headers?.Authorization || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  const apiKey = match ? match[1].trim() : null;
  if (!apiKey) {
    return res.status(401).json({
      error: 'Missing or invalid Authorization header. Use: Bearer <your-kie-api-key>',
    });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (_) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Body must be a JSON object' });
  }

  const { model, input } = body;
  if (!model || !input || typeof input !== 'object') {
    return res.status(400).json({
      error: 'Missing or invalid "model" or "input" in body',
    });
  }

  console.log('[createTask] request body:', JSON.stringify(body, null, 2));

  const isRunway = String(model).toLowerCase().includes('runway');

  const duration =
    input.duration != null ? parseInt(input.duration, 10) : undefined;

  const VALID_RUNWAY_DURATIONS = [5, 8, 10];
  if (isRunway) {
    const runwayDuration = duration;
    if (
      runwayDuration === undefined ||
      !Number.isInteger(runwayDuration) ||
      !VALID_RUNWAY_DURATIONS.includes(runwayDuration)
    ) {
      return res.status(400).json({
        error:
          'Runway model requires "input.duration" to be 5, 8, or 10 (integer).',
      });
    }
  }

  const createTaskPayload = {
    model,
    input: {
      prompt: input.prompt,
      image_url: input.image_url,
      resolution: input.resolution,
      duration,
    },
  };

  const runwayPayload = {
    prompt: input.prompt,
    imageUrl: input.image_url,
    model,
    quality: input.resolution || '720p',
    duration: duration,
  };

  const url = isRunway
    ? `${KIE_BASE}${KIE_RUNWAY_PATH}`
    : `${KIE_BASE}${KIE_CREATE_TASK_PATH}`;
  const payload = isRunway ? runwayPayload : createTaskPayload;

  let lastResult = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    lastResult = await callKie(url, payload, apiKey);

    if (lastResult.ok) {
      res.setHeader('Content-Type', 'application/json');
      return res.status(lastResult.status).send(lastResult.bodyText);
    }

    const shouldRetry = isRetryableKieError(lastResult.status, lastResult.bodyText);
    if (!shouldRetry || attempt === MAX_RETRIES) {
      res.setHeader('Content-Type', 'application/json');
      res.status(lastResult.status).send(lastResult.bodyText);
      return;
    }

    await sleep(RETRY_DELAY_MS);
  }

  res.setHeader('Content-Type', 'application/json');
  res.status(lastResult.status).send(lastResult.bodyText);
}

module.exports = handler;
