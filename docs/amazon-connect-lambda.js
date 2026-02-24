/**
 * Amazon Connect → NARC Integration Lambda
 *
 * Deploy this Lambda in the same AWS account as your Amazon Connect instance.
 * Trigger: S3 PutObject event on your Connect recordings bucket.
 *
 * Required environment variables:
 *   NARC_INGEST_URL   https://your-narc-backend.com/api/calls/ingest
 *   NARC_SECRET       Your NARC_WEBHOOK_SECRET value
 *
 * IAM permissions required:
 *   s3:GetObject on the recordings bucket
 *   s3:GetObjectTagging on the recordings bucket (for contact metadata)
 *
 * Node.js 20.x runtime.
 */

const https = require('https');
const http = require('http');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = new S3Client({});

/**
 * Make an HTTP POST request and return the response body as a string.
 */
function httpPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  const record = event.Records[0];
  if (!record?.s3) {
    console.warn('Not an S3 event, skipping');
    return;
  }

  const bucket = record.s3.bucket.name;
  const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

  console.log(`Processing recording: s3://${bucket}/${key}`);

  // Generate a 15-minute pre-signed URL for the recording
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const recordingUrl = await getSignedUrl(s3, command, { expiresIn: 900 });

  // Extract metadata from the S3 key path.
  // Amazon Connect recordings are typically stored as:
  // connect/{instance-alias}/CallRecordings/{year}/{month}/{day}/{contactId}_{timestamp}.wav
  const keyParts = key.split('/');
  const filename = keyParts[keyParts.length - 1];
  const contactId = filename.split('_')[0];

  const payload = {
    audioUrl: recordingUrl,
    platform: 'amazon_connect',
    externalCallId: contactId,
    recordingUrl: recordingUrl,
    // Add additional metadata from Connect event here if available
    // agentEmail: event.detail?.Agent?.Username,
    // patientRef: event.detail?.Attributes?.PatientRef,
    // drugName: event.detail?.Attributes?.DrugName,
  };

  const narcUrl = process.env.NARC_INGEST_URL;
  const narcSecret = process.env.NARC_SECRET;

  if (!narcUrl) {
    throw new Error('NARC_INGEST_URL environment variable is required');
  }

  const response = await httpPost(
    narcUrl,
    {
      'Content-Type': 'application/json',
      'X-NARC-Secret': narcSecret || '',
    },
    JSON.stringify(payload)
  );

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`NARC ingest failed: HTTP ${response.status} — ${response.body}`);
  }

  const result = JSON.parse(response.body);
  console.log(`✅ Call ingested successfully. callId: ${result.callId}`);

  return { statusCode: 200, callId: result.callId };
};
