# Security policy

KidsDaily365 is an early self-hosted family application. Use a trusted LAN or HTTPS/VPN; never expose a development server directly to the internet.

## Report a vulnerability

Use GitHub **Security → Report a vulnerability** when enabled. Otherwise request a private reporting channel through the maintainer's GitHub profile. Do not publish credentials, child data, pairing tokens or an unpatched authorization bypass in an issue or PR. There is no promised response SLA or paid bounty.

## Trust boundaries

- Parents administer their own configured household. Child profile selection is not authentication.
- A paired wall display can show that household's plans and complete tasks. It cannot administer parents, profiles, device policies or app allowlists.
- Android launcher devices are assigned to one child and have read-only access to that child's buddy, star balance and allowed apps. Client-side hiding is not authorization.
- Server installation secrets, password hashes, opaque session tokens, pair codes and invitation tokens must not be logged or committed. Use HTTPS for credentials and pairing on shared/untrusted networks.
- The journal remains the source of earned points. Task completion is idempotent and family-scoped.
- A normal Android launcher is not an operating-system security boundary. Managed restrictions require documented Device Owner provisioning, a parental recovery path and tests on the actual model/Android version. Physical power-off, recovery, OS vulnerabilities and factory-reset scenarios are not prevented by an app's UI.

See the architecture and Android documents for implemented behavior and planned boundaries. Do not treat planned restrictions as already active protection.
