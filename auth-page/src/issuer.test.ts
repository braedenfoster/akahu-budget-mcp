import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issuerFromResourceMetadata, withIssuer } from './issuer.ts';

const ISSUER = 'https://fearless-utensil-8259.customers.stytch.dev';

test('withIssuer replaces a non-matching iss with the advertised issuer', () => {
  const out = withIssuer(
    'https://chatgpt.com/connector/oauth/cb?code=abc&state=xyz&iss=stytch.com%2Fproject-test-123',
    ISSUER,
  );
  const url = new URL(out);
  assert.equal(url.searchParams.get('iss'), ISSUER);
  assert.equal(url.searchParams.get('code'), 'abc');
  assert.equal(url.searchParams.get('state'), 'xyz');
  assert.equal(url.origin + url.pathname, 'https://chatgpt.com/connector/oauth/cb');
});

test('withIssuer adds iss when the redirect has none', () => {
  const url = new URL(withIssuer('https://chatgpt.com/cb?code=abc', ISSUER));
  assert.equal(url.searchParams.get('iss'), ISSUER);
});

test('withIssuer adds iss to error responses too', () => {
  const url = new URL(withIssuer('https://chatgpt.com/cb?error=access_denied&state=s', ISSUER));
  assert.equal(url.searchParams.get('iss'), ISSUER);
  assert.equal(url.searchParams.get('error'), 'access_denied');
});

test('withIssuer leaves an unparseable redirect untouched', () => {
  assert.equal(withIssuer('not a url', ISSUER), 'not a url');
});

test('issuerFromResourceMetadata returns the first authorization server', () => {
  assert.equal(
    issuerFromResourceMetadata({ resource: 'https://x', authorization_servers: [ISSUER, 'https://other'] }),
    ISSUER,
  );
});

test('issuerFromResourceMetadata returns null for malformed metadata', () => {
  assert.equal(issuerFromResourceMetadata(null), null);
  assert.equal(issuerFromResourceMetadata({}), null);
  assert.equal(issuerFromResourceMetadata({ authorization_servers: [] }), null);
  assert.equal(issuerFromResourceMetadata({ authorization_servers: [42] }), null);
});
