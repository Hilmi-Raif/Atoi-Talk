# E2E backend

Requires Docker Engine and Docker Compose.

```sh
docker compose -f e2e/backend/compose.yaml pull
docker compose -f e2e/backend/compose.yaml up -d --wait --wait-timeout 180
docker compose -f e2e/backend/compose.yaml ps
curl --fail http://127.0.0.1:18080/readyz
```

The stack uses backend release 0.1.5 with pinned image digests.

| Service       | Host address                  |
| ------------- | ----------------------------- |
| API readiness | http://127.0.0.1:18080/readyz |
| WebSocket     | ws://127.0.0.1:18081/ws       |
| S3 mock       | http://127.0.0.1:19090        |
| Mailpit       | http://127.0.0.1:18025        |

Ports bind only to loopback. PostgreSQL and Redis have no published ports.
The `atoitalk-e2e` project uses a separate network and test credentials.
PostgreSQL uses tmpfs and loses its data when stopped. CAPTCHA, tracing, profiling,
and rate limiting are disabled.

Stop only this test project with:

```sh
docker compose -f e2e/backend/compose.yaml down
```

```sh
pnpm test:e2e:integration
```

This suite disables CAPTCHA in both applications and does not contact Cloudflare.
To check enabled behavior with the official test keys:

```sh
CAPTCHA_ENABLED=true docker compose -f e2e/backend/compose.yaml up -d --wait
E2E_CAPTCHA_ENABLED=true pnpm test:e2e:integration
E2E_CAPTCHA_MISMATCH=true pnpm test:e2e:integration
```

Run `CAPTCHA_ENABLED=false docker compose -f e2e/backend/compose.yaml up -d --wait`
before running the default suite again.

Tests register accounts with unique identities and read OTPs from Mailpit.
The admin test promotes only its newly registered account in the isolated
`atoitalk_e2e` database through Docker Compose. On Windows, this command runs in
the Ubuntu WSL distribution; elsewhere it uses the local Docker CLI.

`playwright.integration.config.ts` serves the frontend on port 4174 and connects
to this backend. `pnpm test:e2e` runs a separate suite with mocked API routes.
Scheduler cleanup, Google OAuth, and Firebase delivery are not included.
