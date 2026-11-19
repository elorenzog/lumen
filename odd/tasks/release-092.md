# LUMEN 0.9.2 release
Publish a signed Windows x64 update from the reviewed projection changes. Branch: codex/release-0.9.2; main stays unchanged.
Verification: release metadata tests, desktop TypeScript and native tests, signed installer and updater manifest, public download readback.

## Specs
- S1: "Sube los cambios y la nueva version" — publish the reviewed projection changes and the next release.
- S2: "Si" — confirms GitHub repository elorenzog/lumen, a new branch without touching main, GitHub CLI session, v0.9.2, and local signing only; never transfer the private key.

## Tasks
- T1 | S1 | inline | complete | ba79ff8; staged tree exactly matches the acknowledged candidate (8d7140c0); 69 Vitest tests passed.
- T2 | S1–S2 | inline | complete | 8130b04; synchronized package and native versions and selected text-free art; 3 metadata tests and TypeScript passed.
- T3 | S1–S2 | delegated build + independent verification | complete | fresh NSIS x64, local Tauri signature, verified manifest and all 4 hashes, 69 optimized Rust tests.
- T4 | S1–S2 | inline | complete | GitHub release 450721040 and v0.9.2 point at 8130b04. All five public downloads matched; installer signature independently verified.

## Log
- L1: "Sube los cambios y la nueva version".
- L2: "Continua".
- L3: "Si".
- Confirmed latest is v0.9.1; GitHub main is b8705be. Work starts from prior release branch at 40e1f42.
- Work units ba79ff8 and 8130b04 are local. The installer tag will target 8130b04.
- First signing build stopped on Windows error 112 (C: out of space) before creating an installer. Fixed local D: was verified as having about 60 GiB available; retrying there without removing any existing build.
- Successful D: build created a fresh installer; Tauri local signer exited 0 using the existing key without transfer. Installer: 47,193,384 bytes; SHA-256 381e1d0f5529de9599b176266434c3dbe7baa0123331eedbcf869691e18fbe6b.
- Independent verification accepted the signature with the embedded updater public key and rejected a tampered byte. Versions, manifest URL and detached signature match; source code matches the reviewed tree plus six bounded release changes. This does not prove actual installation or physical monitor behavior.
- Native risk assessment of the version and artwork commit: medium, under_budget, review_due=false. Projection source was already reviewed and exactly matched the staged tree.
- Pushed release branch; verified exact draft 450721040 and all five SHA-256 digests before publishing. GitHub v0.9.2 is latest; its tag points to 8130b041fd9ae9adf69faac4ba4882e132d11422. GitHub main remained b8705be.
- Verified anonymous HTTP 200 and byte-for-byte readback of the latest updater manifest, installer, detached signature, notes, and checksums. The downloaded installer passed minisign against the embedded public key, and the tamper probe failed as expected. No private key transferred. Actual install, restart, and projector hardware were not exercised.
