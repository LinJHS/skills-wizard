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

    test('should import skill correctly', async () => {
        // 1. Create a dummy skill in a temp location
        const externalSkillDir = path.join(os.tmpdir(), 'external-skill-test-' + Date.now());
        await fs.ensureDir(externalSkillDir);
        await fs.writeFile(path.join(externalSkillDir, 'SKILL.md'), '--- \ndescription: A test skill\n--- \n# Test Skill Content');
        await fs.writeFile(path.join(externalSkillDir, 'helper.js'), 'console.log("helper")');

        try {
            // 2. Setup manager
            class TestSkillManager extends SkillManager {
                protected getStoragePathFromSettings(): string {
                    return tempDir;
                }
                public get initializationPromise() { return (this as any).ready; }
            }
            const manager = new TestSkillManager(context);
            await manager.initializationPromise;

            // 3. Prepare discovery object
            const md5 = await manager.calculateMD5(path.join(externalSkillDir, 'SKILL.md'));
            const discovered = {
                name: 'test-skill',
                path: externalSkillDir,
                md5: md5,
                description: 'A test skill',
                sourceLocation: externalSkillDir,
                isRemote: false
            };

            // 4. Import
            const importedId = await manager.importSkill(discovered);
            
            // 5. Verify
            assert.strictEqual(importedId, md5);
            
            const importedSkillPath = path.join(tempDir, 'skills', 'test-skill');
            assert.ok(await fs.pathExists(path.join(importedSkillPath, 'SKILL.md')), 'SKILL.md should exist in storage');
            assert.ok(await fs.pathExists(path.join(importedSkillPath, 'helper.js')), 'helper.js should exist in storage');
            
            // Verify config
            const configPath = path.join(tempDir, 'config.json');
            const config = await fs.readJSON(configPath);
            assert.ok(config.skills[importedId], 'Skill metadata should be present in config');

        } finally {
            await fs.remove(externalSkillDir);
        }
    });
});
