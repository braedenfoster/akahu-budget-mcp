import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StytchB2BProvider } from '@stytch/react/b2b';
import App from './App.tsx';
import { Card } from './Card.tsx';
import { stytch, tokenIsConfigured } from './stytch.ts';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

if (!tokenIsConfigured || !stytch) {
  root.render(
    <StrictMode>
      <Card>
        <h1>Not configured</h1>
        <p>
          <code>VITE_STYTCH_PUBLIC_TOKEN</code> is missing. Set it in{' '}
          <code>auth-page/.env</code> and rebuild.
        </p>
      </Card>
    </StrictMode>,
  );
} else {
  root.render(
    <StrictMode>
      <StytchB2BProvider stytch={stytch}>
        <App />
      </StytchB2BProvider>
    </StrictMode>,
  );
}
