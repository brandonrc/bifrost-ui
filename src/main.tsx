import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'

import { AuthProvider } from '@/auth/auth-context'
import { loadRuntimeConfig } from '@/lib/runtime-config'
import { ThemeProvider } from '@/lib/theme'
import { router } from '@/router'

import './index.css'

const queryClient = new QueryClient()

// Deployment config (OIDC client id / issuer) is fetched before first render
// so the login page never starts a PKCE flow against a build-time default.
// loadRuntimeConfig never rejects; a missing /config.json is the dev case.
void loadRuntimeConfig().then(() =>
  createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
),
)
