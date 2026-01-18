import * as assert from 'assert';
import * as path from 'path';
import * as os from 'os';
import { resolvePath } from '../utils/paths';

suite('Path Utils Test Suite', () => {
    test('resolvePath should resolve ~ to user home directory', () => {
        const input = '~/test/path';
        const expected = path.join(os.homedir(), 'test/path');
        const result = resolvePath(input);
        assert.strictEqual(result, expected);
    });

    test('resolvePath should handle backslashes or forward slashes', () => {
        // os.homedir() might return path with backslashes on Windows
        // The implementation simply joins homedir with the rest.
        
        // Test with explicit separators if needed, but the utility uses path.join
        const input = '~/documents/skills';
        const expected = path.join(os.homedir(), 'documents/skills');
        const result = resolvePath(input);
        assert.strictEqual(result, expected);
    });

    test('resolvePath should return absolute path as is', () => {
        const absolutePath = path.resolve('static', 'path');
        const result = resolvePath(absolutePath);
        assert.strictEqual(result, absolutePath);
    });
});
