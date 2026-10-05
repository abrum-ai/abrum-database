# ABRUM App Contract v2

Edit only:
- `abrum.app.ts`
- `src/App.tsx`
- `src/styles.css`
- `backend/actions.js`

Do not edit `generated/`, `abrum.app.json`, build configuration, or vendored SDK files.
Use `abrum.collection` for Room data and `abrum.action` for Agent-callable behavior.
Use `@abrum/react/ui` controls and preserve the working generated import in `App.tsx`.
Use ABRUM typography roles/tokens in custom CSS; do not invent font sizes, weights, families, or tracking.
Twin JSON rejects floats: use integer minor units for money and strings for other fractions.
Never request or store a Recovery Phrase, signing key, Station bearer, or plaintext secret.
Source packages are shareable. Credential files (.env, private keys, service accounts and private tool directories) are excluded by the CLI and independently rejected by the Station if submitted anyway. Private-key material embedded in ordinary source is also rejected. Fix the local source and call app_run again; do not print the rejected contents or bypass the source-package check.

Authenticated external services belong in an integration app's backend. Declare credentials with `abrum.secret` and keep their values out of source, Room configuration and browser URLs. Declare Station network targets in `abrum.app.ts`, for example `network: { allow: ["device.example:443"] }`. For HTTPS endpoints that users add during operation, `allowConfiguredHttpsHosts: true` permits port 443 after the backend reads the Room record's `endpoint` field. Explicit `allow: ["*:443"]` or `allow: ["*"]` also exists; Warden must approve that full scope. Changes beyond the approved policy need another decision. Network permission does not supply credentials, trust self-signed certificates, or convert an HTML device page into playable media. Verify the actual response and supported media format; `ctx.fetch` returns a bounded response, not an endless video stream.

The native tools own the lifecycle: `app_scaffold` obtains one Warden authoring permission and registers the first Draft; `app_run` refreshes it and `app_provision` submits the accepted exact revision. Contributors receive `candidate_ready`: source and build are durable in the App Room, but not published or installed. A Manager must review and rebuild that source in their own Run and obtain explicit publication approval. Only `installed` is a publication success. A security-policy expansion, including publication authority, asks again. Never create Rooms, grants, or bindings yourself. After provisioning, exercise one declared Agent action.

Test the Station-hosted surfaceRef with Co-Presence view, named actions, waitFor and a frame. Bind controls with affordance and report durable mutation completion with processAffordance. Request the finite test actions once. Use app_run mode=acceptance with testActions to freeze a bundle, test that surface again, then app_provision with evidenceRefs. Build success alone is not UI acceptance.

App id: `abrum.database`.
