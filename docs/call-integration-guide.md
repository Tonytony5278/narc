# NARC Call Recording Integration Guide

NARC provides a **platform-agnostic, post-call** adverse event detection pipeline. Any telephony platform that can deliver a completed call recording file can integrate — there is no platform-specific SDK required.

## Architecture

Every platform integration follows the same flow:

```
Call ends → Recording available → NARC ingests → Whisper transcribes → Claude analyzes → AE findings stored
```

---

## Environment Setup

Add to `packages/backend/.env`:

```env
# Required: shared secret for webhook authentication
NARC_WEBHOOK_SECRET=your-strong-random-secret-here
```

To generate a strong secret:
```bash
openssl rand -hex 32
```

---

## Integration Methods

### Method 1: Universal Webhook (Recommended for any platform)

`POST /api/webhooks/generic`

Headers:
```
X-NARC-Secret: <NARC_WEBHOOK_SECRET>
Content-Type: application/json
```

Body:
```json
{
  "call_id": "your-platform-call-id",
  "recording_url": "https://your-storage.com/recording.mp3",
  "agent_email": "agent@psp.com",
  "patient_ref": "PT-001",
  "drug_name": "Humira",
  "started_at": "2026-02-24T10:00:00Z",
  "ended_at": "2026-02-24T10:15:00Z",
  "platform": "custom"
}
```

Response:
```json
{ "callId": "uuid-of-created-call", "message": "Processing started" }
```

---

### Method 2: Direct File Upload

`POST /api/calls/ingest`

Use multipart/form-data with the recording file:

```bash
curl -X POST https://your-narc.com/api/calls/ingest \
  -H "X-NARC-Secret: your-secret" \
  -F "audio=@recording.mp3" \
  -F "platform=manual" \
  -F "drugName=Humira" \
  -F "patientRef=PT-001" \
  -F "agentEmail=agent@psp.com"
```

Accepted formats: MP3, WAV, M4A, WebM, OGG, MP4 (max 25MB)

---

### Method 3: Platform-Specific Webhooks

NARC provides dedicated adapters for common platforms:

#### Amazon Connect

`POST /api/webhooks/amazon-connect`

```json
{
  "ContactId": "abc-123",
  "RecordingUrl": "https://s3.amazonaws.com/bucket/recording.wav?...",
  "Agent": { "Username": "agent@psp.com" },
  "InitiationTimestamp": "2026-02-24T10:00:00Z",
  "DisconnectTimestamp": "2026-02-24T10:15:00Z",
  "Attributes": {
    "DrugName": "Humira",
    "PatientRef": "PT-001"
  }
}
```

For automatic triggering, deploy the provided Lambda (`docs/amazon-connect-lambda.js`) triggered on S3 PutObject for your recordings bucket.

#### Genesys Cloud

`POST /api/webhooks/genesys`

```json
{
  "id": "conv-uuid",
  "mediaUris": { "audio": "https://..." },
  "participants": [
    { "purpose": "agent", "userId": "agent@psp.com" }
  ]
}
```

Configure in Genesys Cloud: Admin → Integrations → Event Orchestration → Add webhook pointing to `/api/webhooks/genesys`.

#### RingCentral

`POST /api/webhooks/ringcentral`

```json
{
  "uuid": "call-uuid",
  "recordings": [{ "contentUri": "https://...", "duration": 900 }],
  "legs": [{ "from": { "name": "Agent Smith" }, "startTime": "...", "endTime": "..." }]
}
```

Configure in RingCentral Developer Portal: Add subscription → Call Recording webhook.

---

## Testing with the Dashboard UI

The NARC dashboard includes a built-in upload interface:

1. Navigate to the **📞 Calls** tab
2. Drag and drop a recording file (or click to browse)
3. Optionally fill in: Drug Name, Patient Reference, Agent Email, Platform
4. Click **Analyze Call Recording**
5. The call detail will open automatically when processing completes

This provides end-to-end testing of the full pipeline without needing a telephony platform.

---

## Review Workflow

After ingestion, calls appear in the Calls tab with:
- **Platform badge** — color-coded by platform
- **Severity badge** — based on worst AE finding
- **SLA timer** — regulatory deadline countdown
- **AE count** — number of findings

Click any call to open the detail modal with four tabs:
- **Findings** — AE findings with confirm/dismiss/false-positive actions
- **Transcript** — full Whisper transcript with AE highlights
- **SLA** — deadline and escalation status
- **Submit** — status update and regulatory submission workflow

---

## Security Notes

- All webhook endpoints require the `X-NARC-Secret` header
- In development (no `NARC_AUTH` env var), the secret is optional for convenience
- In production, set both `NARC_AUTH=true` and `NARC_WEBHOOK_SECRET` for enforcement
- Recording URLs are only stored as metadata; the audio is not stored by NARC
- Patient references should be anonymized identifiers, not PHI
