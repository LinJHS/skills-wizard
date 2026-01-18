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

    test('should initialize and create config.json', async () => {
        // Since we cannot easily mock the configuration to return a custom path 
        // without affecting the whole VS Code instance or using a complex mock,
        // we might run into issues if SkillManager calls getStoragePathFromSettings -> vscode.workspace.getConfiguration
        // But in the test environment, the configuration usually returns defaults or undefined.
        // If it returns default, it goes to getDefaultSkillsWizardStoragePath().
        
        // This makes `tempDir` (passed in context) potentially ignored for storage 
        // if getStoragePathFromSettings() uses defaults which point to %APPDATA%.
        // SkillManager constructor uses `this.legacyStoragePath = context.globalStorageUri.fsPath;`
        // But `this.storagePath = this.getStoragePathFromSettings();`
        
        // To accurately test this with `tempDir`, we might need to mock resolvePath or getDefaultSkillsWizardStoragePath 
        // or just accept that it creates files in the real default location (which is bad for tests).
        
        // However, I can subclass SkillManager to override getStoragePathFromSettings for testing purposes.
        
        class TestSkillManager extends SkillManager {
            protected getStoragePathFromSettings(): string {
                return tempDir;
            }
            // expose ready for waiting
            public get initializationPromise() {
                return (this as any).ready;
            }
        }

        const manager = new TestSkillManager(context);
        await manager.initializationPromise;
        
        const configPath = path.join(tempDir, 'config.json');
        const exists = await fs.pathExists(configPath);
        assert.strictEqual(exists, true, 'config.json should be created');
        
        const skillsDir = path.join(tempDir, 'skills');
        const skillsExists = await fs.pathExists(skillsDir);
        assert.strictEqual(skillsExists, true, 'skills directory should be created');
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
