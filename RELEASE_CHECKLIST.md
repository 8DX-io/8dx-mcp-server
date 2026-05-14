# Release Checklist

Use this checklist after GitHub and npm access are available.

1. Confirm the public API base URL for the first release.
2. Create or confirm the npm organization/scope used by `package.json`.
3. Create or confirm the GitHub organization `8DX-io`.
4. Create the public repository `8DX-io/8dx-mcp-server`.
5. Add the GitHub remote:

```bash
git remote add origin git@github.com:8DX-io/8dx-mcp-server.git
```

6. Run local verification:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run smoke:stdio
npm pack --dry-run
```

7. Confirm live read-only endpoint behavior for all tools advertised in the README.
8. Push the initial branch:

```bash
git push -u origin main
```

9. Publish the npm package:

```bash
npm publish --access public
```

10. Create GitHub release `v0.1.0`.
11. Submit the server to Smithery, mcp.so, LobeHub, and Composio if applicable.
