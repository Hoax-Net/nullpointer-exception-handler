import assert from "node:assert/strict";
import test from "node:test";

import worker, { verifyDiscordSignature } from "../src/index.js";

function toHex(bytes) {
  return Buffer.from(bytes).toString("hex");
}

async function signedFixture(payload) {
  const keys = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", keys.publicKey));
  const body = new TextEncoder().encode(JSON.stringify(payload));
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const timestampBytes = new TextEncoder().encode(timestamp);
  const signed = new Uint8Array(timestampBytes.length + body.length);
  signed.set(timestampBytes);
  signed.set(body, timestampBytes.length);
  const signature = new Uint8Array(await crypto.subtle.sign("Ed25519", keys.privateKey, signed));
  return { body, timestamp, signature: toHex(signature), publicKey: toHex(publicKey) };
}

test("valid Discord Ed25519 signatures verify", async () => {
  const fixture = await signedFixture({ type: 1 });
  assert.equal(await verifyDiscordSignature(fixture), true);
});

test("tampered and stale Discord requests are rejected", async () => {
  const fixture = await signedFixture({ type: 1 });
  const tampered = { ...fixture, body: new TextEncoder().encode('{"type":2}') };
  assert.equal(await verifyDiscordSignature(tampered), false);
  assert.equal(
    await verifyDiscordSignature({ ...fixture, now: Date.now() + 301_000 }),
    false,
  );
});

test("worker acknowledges a signed Discord PING", async () => {
  const fixture = await signedFixture({ type: 1 });
  const request = new Request("https://worker.test/interactions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signature-ed25519": fixture.signature,
      "x-signature-timestamp": fixture.timestamp,
    },
    body: fixture.body,
  });
  const response = await worker.fetch(request, { DISCORD_PUBLIC_KEY: fixture.publicKey });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { type: 1 });
});

test("worker rejects unsigned interaction requests", async () => {
  const response = await worker.fetch(
    new Request("https://worker.test/interactions", {
      method: "POST",
      body: JSON.stringify({ type: 1 }),
    }),
    { DISCORD_PUBLIC_KEY: "00".repeat(32) },
  );
  assert.equal(response.status, 401);
});

