import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as os from 'os';
import { SkillManager } from '../managers/SkillManager';

suite('SkillManager Test Suite', () => {
    let tempDir: string;
    let context: vscode.ExtensionContext;

    setup(async () => {
        tempDir = path.join(os.tmpdir(), 'skills-wizard-test-' + Date.now());
        await fs.ensureDir(tempDir);
        
        context = {
            globalStorageUri: vscode.Uri.file(tempDir),
            subscriptions: [],
            workspaceState: {
                get: () => undefined,
                update: () => Promise.resolve(),
            },
            globalState: {
                get: () => undefined,
                update: () => Promise.resolve(),
                setKeysForSync: () => {},
            },
            extensionUri: vscode.Uri.file(__dirname),
            asAbsolutePath: (relativePath: string) => path.join(__dirname, relativePath),
            storageUri: vscode.Uri.file(tempDir),
            logUri: vscode.Uri.file(path.join(tempDir, 'log')),
            extensionMode: vscode.ExtensionMode.Test,
            extension: {
                id: 'test.test',
                extensionUri: vscode.Uri.file(__dirname),
                isActive: true,
                packageJSON: {},
                exports: undefined,
                activate: () => Promise.resolve(),
            }
        } as unknown as vscode.ExtensionContext;
    });

    teardown(async () => {
        try {
            await fs.remove(tempDir);
        } catch (e) {
            console.error('Failed to clean up temp dir', e);
        }
    });

    test('calculateMD5 should return correct hash', async () => {
        class TestSkillManager extends SkillManager {
            protected getStoragePathFromSettings(): string {
                return tempDir;
            }
            public get initializationPromise() {
                return (this as any).ready;
            }
        }
        const manager = new TestSkillManager(context);
        await manager.initializationPromise;

        const testFile = path.join(tempDir, 'test.txt');
        await fs.writeFile(testFile, 'hello world');
        
        const hash = await manager.calculateMD5(testFile);
        assert.strictEqual(hash, '5eb63bbbe01eeed093cb22bb8f5acdc3');
    });
});
