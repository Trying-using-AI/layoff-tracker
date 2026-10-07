// Runs every UI test script in sequence (needs: npm run build, python3 tests/make_fixtures.py)
import { spawnSync } from 'node:child_process';
const files = ['smoke', 't-pages', 't-pages2', 't-edit1', 't-rmwm', 't-editor', 't-create', 't-pptx', 't-resume', 't-convert', 't-security', 't-hw', 't-images', 't-business', 't-share', 't-workflow', 't-audio', 't-allopen', 't-variants'];
let bad = 0; for (const f of files) { const r = spawnSync('node', [`tests/${f}.mjs`], { stdio: 'inherit' }); if (r.status) { bad++; console.log('✗✗', f, 'FAILED'); } }
process.exit(bad ? 1 : 0);
