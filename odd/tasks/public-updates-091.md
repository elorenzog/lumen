# Public signed updates — LUMEN 0.9.1
Objective: publish a fresh signed Windows release from the merged source; never upload the private key.
Branch: codex/release-0.9.1 from b8705be; delivery: one release-preparation commit and tag; checks: existing metadata tests, native build, signature/hash verification, anonymous downloads.

## Specs
- S1: "Ya hiice el merge, haz el repo publico y asegurate que se puedan descargar las actualizaciones". Repository visibility is already public; the Tauri feed must become available anonymously.
- S2: "Si" — user authorized the existing GitHub CLI session for visibility, releases and anonymous download verification.
- S3: "Si" — user authorized use of the existing local LUMEN signing key to compile and publish the update without uploading that key to GitHub.
- Implementation decision: version 0.9.1 makes the new release newer than existing Tauri 0.9.0 installations. Keep the existing updater public key. Electron 0.8.x requires manual installation.

## Tasks
- T1 | S1-S3 | inline | complete | commit d5894f9 synchronizes versions/changelog; 3 metadata tests, 65 Vitest tests and strict TypeScript passed; private key not read or printed.
- T2 | S1,S3 | delegated build | complete | fresh NSIS 0.9.1 and metadata generated in release/tauri-v0.9.1; installer SHA256 c8308b94a3b588e6ad5012d2879135ca10e12d1418dae2b06fe5f0d1cda63dfa; all checksum entries matched.
- T3 | S1-S3 | inline publication + independent verification | complete | public release 448032077 / v0.9.1 targets d5894f9; latest.json, full installer and signature returned anonymous HTTP 200; downloaded installer hash and signature matched; Risk: item 5 (release/environment).

## Log
- L1: User request: "Ya hiice el merge, haz el repo publico y asegurate que se puedan descargar las actualizaciones".
- L2: User answered "Si" to GitHub CLI authorization, then "Si" to local signing-key use without upload.
- L3: Public visibility confirmed; anonymous repository HTTP 200 and old installer HTTP 206. New Tauri feed HTTP 404; no GitHub signing secrets configured. Old local 0.9.0 installers lack provenance for the latest merged changes and will not be reused.
- L4: main b8705be tree b1c77175 equals the reviewed source; CI 43998697529 succeeded. Worktree has only local .atl/.codegraph metadata; both excluded from publication.
- L5: Version/config-only change: no new runtime rule or meaningful failing behavior test. Existing metadata tests passed; local public signing key exactly matches the embedded updater key. Signing CLI will read the private key by path; key material is never copied to GitHub or logs.
- L6: Release build passed after an escalated retry for the NSIS tool download (sandbox socket 10013). FileVersion/ProductVersion are 0.9.1. Generated manifest embeds the exact detached signature. The private key remained local and signing process environment was cleared.
- L7: Independent verification and parent rerun passed with minisign-verify 0.2.5: original installer accepted, one-bit modification rejected. Optimized release executable passed the native selects/modal/theme/responsive E2E. Native risk assessment: medium configuration change, review_due=false (under_budget); no additional review transaction started.
- L8: Published source commit d5894f97293d0dc05f33d280e3a43546320bbae7 on codex/release-0.9.1. Public tag v0.9.1 points to that exact commit. Draft identity 448032077 and all five uploaded asset digests were verified before publication; the release is now latest and public.
- L9: Anonymous HTTPS downloads: feed HTTP 200; installer HTTP 200, 47,177,050 bytes; detached signature HTTP 200. Full downloaded SHA256 is c8308b94a3b588e6ad5012d2879135ca10e12d1418dae2b06fe5f0d1cda63dfa. No GitHub signing secret was added; the key stayed local.
- L10: Public release: https://github.com/elorenzog/lumen/releases/tag/v0.9.1 . Tauri 0.9.0 clients can discover this newer version; Electron 0.8.x and portable/development distributions require manual installation. Actual installation/restart and target-projector hardware were not exercised by this publication task.
- L11: The downloaded public installer also passed native minisign verification and the tamper-negative probe. All 68 Rust tests passed with package version 0.9.1. The independent GitHub tag workflow 44006885395 was still running at the final status check; publication uses the locally built and independently verified signed artifacts, not its unsigned review output.
