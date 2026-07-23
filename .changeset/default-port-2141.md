---
"repo-dive": patch
---

Change the dashboard's default port from `4936` to `2141`.
`2141` spells "DIVE" in Scrabble tile values (D=2, I=1, V=4, E=1), a nod to the project name, whereas `4936` was arbitrary.
It stays in the registered range and below the OS ephemeral range (Linux 32768+, macOS 49152+), so it won't randomly clash with outbound-connection source ports, and IANA has no service assigned to it.
The default now lives in a single shared constant instead of being duplicated across the root and `dashboard` commands.
Pass `--port` to override it, exactly as before.
