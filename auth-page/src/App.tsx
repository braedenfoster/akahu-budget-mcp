import {
  AuthFlowType,
  B2BIdentityProvider,
  B2BProducts,
  StytchB2B,
  useStytchMemberSession,
  type StytchB2BUIConfig,
} from '@stytch/react/b2b';
import { Card } from './Card.tsx';

/** The one path Stytch's Authorization URL points at. */
const AUTHORIZE_PATH = '/oauth/authorize';

// Email-OTP-only discovery login: any member of the Stytch Organization signs
// in with a one-time code, then lands with an active session. No redirect URL to
// register (unlike Magic Links), so there is no /authenticate callback to handle.
const loginConfig: StytchB2BUIConfig = {
  products: [B2BProducts.emailOtp],
  authFlowType: AuthFlowType.Discovery,
  sessionOptions: { sessionDurationMinutes: 60 },
};

/**
 * The consent route. Gated on a live member session:
 *  - not initialized yet → a brief loading state (avoids flashing the login form)
 *  - signed in           → the Stytch consent screen, which parses client_id /
 *                          redirect_uri / scope / state / code_challenge / resource
 *                          from the URL and completes the OAuth handshake
 *  - signed out          → Email OTP login
 */
function Authorize() {
  const { session, isInitialized } = useStytchMemberSession();

  if (!isInitialized) {
    return <Card>Loading…</Card>;
  }

  if (session) {
    return <B2BIdentityProvider />;
  }

  return (
    <Card>
      <h1>Budget</h1>
      <p>Sign in to authorize access.</p>
      <StytchB2B config={loginConfig} />
    </Card>
  );
}

export default function App() {
  if (window.location.pathname !== AUTHORIZE_PATH) {
    return (
      <Card>
        <h1>Budget</h1>
        <p>Nothing to see here.</p>
      </Card>
    );
  }

  return <Authorize />;
}
