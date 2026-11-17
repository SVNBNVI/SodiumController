# Security Policy

## Supported Versions
| Version | Supported |
| :--- | :--- |
| `main` (C++20 Engine + Angular 19 SPA) | :white_check_mark: |

## Security Architecture
- **Zero Secrets Stored:** SodiumController requires no user authentication, API keys, or private credentials.
- **Read-Only Public Data:** Menu data is parsed exclusively from public University of Michigan M|Dining nutrition pages over HTTPS.
- **Client-Side Storage:** User meal trays are stored locally in browser `localStorage` and are never transmitted to external servers.

## Reporting a Vulnerability
If you discover a bug, XSS vector, or CI/CD issue, please open a GitHub Issue or contact the repository maintainer directly.
