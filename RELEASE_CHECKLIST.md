# Release Checklist

Use this checklist after GitHub and npm access are available.

1. Confirm the public API base URL for the first release.
2. Create or confirm the GitHub organization `planet9group`.
3. Create the public repository `planet9group/8dx-mcp-server`.
4. Add the GitHub remote:

```bash
git remote add origin git@github.com:planet9group/8dx-mcp-server.git
```

5. Run local verification:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

6. Push the initial branch:

```bash
git push -u origin main
```

7. Publish the npm package:

```bash
npm publish --access public
```

8. Create GitHub release `v0.1.0`.
9. Submit the server to Smithery, mcp.so, LobeHub, and Composio if applicable.
