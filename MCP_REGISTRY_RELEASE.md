# Official MCP Registry release

This prepares a package-based, stdio listing. It does not create a hosted MCP endpoint,
change API behavior, enable local signing, or configure publishing credentials.

## Proposed release

- npm package: `@8dx/8dx-mcp-server`, proposed version `0.1.3`.
- Registry name: `io.github.8DX-io/8dx-mcp-server`.
- Code accepts Ethereum, BNB Smart Chain and Arbitrum identifiers; this is not proof of live
  backend availability. The Registry description intentionally makes no chain-support claim.
- Arbitrum availability is unverified. Keep the existing identifiers for compatibility, but
  do not advertise Arbitrum as live until the maintainer confirms read-only endpoint checks.
- `mcpName` in the **published npm package** must exactly match `server.json.name`.
- `server.json.version`, its npm package version, `package.json`, and the root lockfile
  versions are kept together by `tests/registry-metadata.test.ts`.

The currently published npm version was `0.1.2` without `mcpName` when checked. Check
again before release. If `0.1.3` is already taken, select a new version and update all
five version fields across the three JSON files. Do not republish or overwrite an existing npm version.

## Review and verification

Review this change against the latest main branch before applying it. Run the existing
release checks and the non-publishing Registry validator:

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run smoke:stdio
npm pack --dry-run
mcp-publisher validate
```

Install `mcp-publisher` only from the official MCP Registry release using your normal
trusted-software process. No publisher login or publish is needed for validation. The CLI sends the public metadata
to the Registry validation API; it is not an offline-only check.
Inspect the npm tarball: it must include `server.json`, `package.json` with `mcpName`,
and the built `dist/index.js` executable. Also perform the existing release checklist's
live read-only API checks before approving release.

## Maintainer publishing steps

An authorized npm maintainer first publishes the reviewed new package through the
existing release process. The existing repository CI only checks code; it does not
publish npm or Registry releases. This patch does not change CI or its permissions.

After npm publication, verify:

```bash
npm view @8dx/8dx-mcp-server@0.1.3 version mcpName
```

Then an authorized publisher validates and publishes `server.json` to the official
MCP Registry and verifies the returned record for the exact name and version.

### Authenticate as the actual repository owner

GitHub API identifies `8DX-io` as a **User**, not an organization. Therefore the
personal namespace `io.github.8DX-io/*` applies. The organization-only restrictions
in the upstream authentication documentation do not apply to this account.

An existing, authorized publisher session for `8DX-io` can be used if available.
Otherwise `mcp-publisher login github` initiates an OAuth/device authorization flow;
that new authorization requires explicit approval. Browser GitHub login alone is
not proof that the publisher CLI is already authorized. Do not create tokens,
authorize OAuth apps, add secrets, expand CI permissions, or configure an OIDC
publishing job merely by applying this metadata-only patch. Never paste tokens into chat.

## Sources

- [Official quickstart](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx)
- [Authentication, including organization restrictions](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/authentication.mdx)
- [Tracked organization device-flow issue](https://github.com/modelcontextprotocol/registry/issues/1468)
- [Published JSON schema](https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json)
- [Package ownership requirements](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/package-types.mdx)

Research snapshot: 2026-11-04; 8DX main `49a130a4a3065bb1c49150ca0bb60be178db06bb`,
Registry main `a75c727dfee39990ae9e8bd416335ac71502f2b5`.
