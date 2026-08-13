import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";

const pages = [
  "docs/index.html",
  "docs/privacy.html",
  "docs/terms.html",
  "docs/oauth/callback.html",
  "docs/404.html",
];

test("public pages have required metadata and valid internal assets", () => {
  for (const page of pages) {
    const html = readFileSync(page, "utf8");
    assert.match(html, /<title>[^<]+<\/title>/i, `${page} title`);
    assert.match(html, /Content-Security-Policy/i, `${page} CSP`);
    assert.match(html, /<meta name="viewport"/i, `${page} viewport`);

    const references = [...html.matchAll(/(?:href|src)="([^"]+)"/gi)].map((match) => match[1]);
    for (const reference of references) {
      if (/^(?:https?:|mailto:|#)/i.test(reference)) continue;
      const relative = reference.split(/[?#]/, 1)[0];
      const target = resolve(dirname(page), relative);
      assert.equal(existsSync(target), true, `${page} -> ${reference}`);
    }
  }
});

test("public site contains no token-shaped credential", () => {
  const tokenPattern = /[A-Za-z0-9_-]{20,30}\.[A-Za-z0-9_-]{5,10}\.[A-Za-z0-9_-]{30,}/;
  for (const page of pages) {
    assert.equal(tokenPattern.test(readFileSync(page, "utf8")), false, page);
  }
});

