# KIE.ai Request Handler

Vercel serverless proxy for [KIE.ai](https://api.kie.ai) that forwards the create-task (video generation) request and **automatically retries** when KIE returns:

- **Status:** 500  
- **Message:** `internal error, please try again later.`

Up to **4 attempts** with a 1.5s delay between retries. Other errors are returned to the client without retry.

## Deploy to Vercel

1. Push this repo to GitHub (or connect your Git provider in Vercel).
2. In [Vercel](https://vercel.com): **New Project** → import this repo.
3. Deploy. No environment variables required.

## API

### `POST /api/createTask`

Creates a video-generation task by proxying to `https://api.kie.ai/api/v1/jobs/createTask`. Send your KIE.ai API key in the request using the **Bearer** strategy: `Authorization: Bearer <your-kie-api-key>`. The handler forwards that token to KIE.

**Request body (JSON):**

```json
{
  "model": "{{model}}",
  "input": {
    "prompt": "{{prompt}}",
    "image_url": "{{image_url}}",
    "resolution": "{{resolution}}",
    "duration": "{{duration}}"
  }
}
```

**Example:**

```bash
curl -X POST https://your-app.vercel.app/api/createTask \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KIE_API_KEY" \
  -d '{"model":"your-model","input":{"prompt":"A cat","image_url":"https://...","resolution":"720p","duration":5}}'
```

Response is the same as KIE’s (status and body). On the retryable 500 error, the handler retries up to 4 times and returns the last response if all fail.
