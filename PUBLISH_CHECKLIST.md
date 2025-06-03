# NPM Publish Checklist

## Pre-Publish Verification

1. **Clean build**:

   ```bash
   npm run clean
   npm run build
   ```

2. **Verify dist directory exists**:

   ```bash
   ls -la dist/
   # Should see index.js and all other compiled files
   ```

3. **Check executable permissions**:

   ```bash
   ls -la dist/index.js
   # Should show -rwxr-xr-x (executable)
   ```

   If not executable:

   ```bash
   chmod +x dist/index.js
   ```

4. **Test locally**:

   ```bash
   LIMITLESS_API_KEY="test-key" timeout 5 node dist/index.js
   # Should run without errors (will timeout after 5s)
   ```

5. **Dry run**:

   ```bash
   npm pack --dry-run
   # CRITICAL: Verify dist/ files are included (should show ~22 files, not just 3)
   # If only 3 files shown, run: npm run build
   ```

6. **Test pack locally**:
   ```bash
   npm pack
   tar -tzf limitless-ai-mcp-server-*.tgz | grep dist/
   # Should see dist/index.js and other dist files
   rm limitless-ai-mcp-server-*.tgz
   ```

## Publish Steps

1. **Login to npm** (if not already):

   ```bash
   npm login
   ```

2. **Publish**:

   ```bash
   npm publish
   ```

3. **Verify publication**:

   ```bash
   npm view limitless-ai-mcp-server
   ```

4. **Test global install**:
   ```bash
   npm install -g limitless-ai-mcp-server
   npx limitless-ai-mcp-server --version
   ```

## Post-Publish

1. **Create git tag**:

   ```bash
   git tag v0.0.3
   git push origin v0.0.3
   ```

2. **Update README** if needed to reflect new version

## Issue Prevention

The v0.0.1 and v0.0.2 releases failed because the `dist` directory wasn't included. This was fixed by:

1. Ensuring the build runs before publish (added `prepack` script)
2. Adding `.npmignore` to control what gets published
3. Making sure `dist/index.js` is executable
4. Always verify with `npm pack --dry-run` shows ~22 files, not just 3
