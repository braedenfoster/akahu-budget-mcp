import { createStytchB2BUIClient } from '@stytch/react/b2b';

/**
 * The publishable Stytch B2B public token, injected at build time.
 * Missing/placeholder values fail loudly rather than rendering a broken form.
 */
const publicToken = import.meta.env.VITE_STYTCH_PUBLIC_TOKEN;

// The `xxxx` marker is the untouched placeholder shape from .env.example — treat
// it as "not configured" so a forgotten copy-and-fill fails loudly, not subtly.
const PLACEHOLDER_MARKER = 'xxxx';

export const tokenIsConfigured =
  typeof publicToken === 'string' &&
  publicToken.length > 0 &&
  !publicToken.includes(PLACEHOLDER_MARKER);

/**
 * A single shared UI client. Created only when a real token is present so a
 * missing token surfaces a readable message instead of an SDK exception.
 */
export const stytch = tokenIsConfigured
  ? createStytchB2BUIClient(publicToken)
  : null;
