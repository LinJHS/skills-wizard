<div align="center">

<img src="resources/icon.png" width="20%" alt="Skills Wizard Logo">

# Skills Wizard

**The Ultimate Skill Manager for Your Coding Assistants**

Developed by [@rexera](https://github.com/rexera) & [@LinJHS](https://github.com/LinJHS)

[![Discord](https://img.shields.io/badge/Discord-Join%20Us-5865F2?style=flat-square&logo=discord&logoColor=white)](https://discord.gg/PKrJtqTxgT)
[![Version](https://img.shields.io/visual-studio-marketplace/v/LinJHS.skills-wizard?style=flat-square&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=LinJHS.skills-wizard)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/LinJHS.skills-wizard?style=flat-square&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=LinJHS.skills-wizard)
[![License](https://img.shields.io/github/license/LinJHS/skills-wizard?style=flat-square)](LICENSE)

[English](README.md) | [中文](README_CN.md) | [Changelog](CHANGELOG.md)

</div>

---

**Skills Wizard** is a powerful VS Code extension designed to manage, organize, and distribute "Skills" (prompt libraries/capabilities) for various coding assistants like Claude, Cursor, Copilot, and more.

It centralizes your scattered skills from different locations and allows you to easily inject them into your current workspace.

## ✨ Features

- 🕵️ **Auto-Detection**: Automatically identifies skills from global and workspace paths, fully supporting Claude, Cursor, Copilot, and more.
- 📦 **One-Click Import/Export**: Easily import skills into the extension or export them to your current project's workspace.
- 📚 **Batch Operations**: Support batch import, export, and delete skills for higher efficiency.
- 🤐 **Zip Support**: Import/Export skills as Zip bundles for easy migration and sharing.
- 🎨 **Preset Management**: Group multiple skills into presets. Apply an entire set of skills to a project in seconds.
- 🏷️ **Smart Organization**: Custom tags, renaming, description editing, and toggle group by tags.
- 🔍 **Quick Search**: Built-in search functionality to quickly find skills or presets.
- 🐙 **GitHub Integration**: Import skills directly from any GitHub repository URL.
- 🔄 **Cross-Platform**: Fully compatible with Windows, macOS, and Linux.
- 🆔 **Smart Deduplication**: Uses MD5 hashing to prevent duplicate imports and manage updates efficiently.

## 🚀 Usage

1.  Click the **Skills Wizard** icon (🪄) in the Primary Side Bar.
2.  **Import**: The extension will scan for existing skills. You can also import from custom path, GitHub URL, or Zip bundle.
3.  **Manage**: View your library, edit tags, search, or organize them into presets. Supports batch operations.
4.  **Apply**: Select skills, or a preset and export it to your current workspace.

## ⚙️ Configuration

You can customize the extension behavior in VS Code settings:

| Setting | Default | Description |
| :--- | :--- | :--- |
| `skillsWizard.defaultApplyPath` | `(empty)` | The default directory where skills will be applied in your workspace. You will be prompted to set this when applying skills for the first time. Can be customized based on your IDE (e.g., `.claude/skills/`, `.cursor/skills/`, `.copilot/skills/`). |
| `skillsWizard.storagePath` | `(empty)` | Custom path for Skills Wizard data storage. Leave empty to use default. |

## 📂 Supported Paths

The extension scans and manages skills from these common locations:

**Global:**
- `~/.claude/skills/`
- `~/.claude/plugins/marketplaces/*/plugins/*/skills/` (Claude Plugins from [claude-plugins.dev](https://claude-plugins.dev/))
- `~/.copilot/skills/`
- `~/.cursor/skills/`
- `~/.gemini/antigravity/skills/`
- `~/.config/opencode/skill/`
- `~/.codex/skills/`
- `/etc/codex/skills/`

**Workspace:**
- `.claude/skills/`
- `.github/skills/`
- `.cursor/skills/`
- `.agent/skills/`
- `.opencode/skill/`
- `.codex/skills/`

## Progress

2026-01-29: Added Claude Plugins Marketplace support, skill source tracking (marketplace/github/local), Import Skills search, and streamlined UI with alphabetical sorting.

2026-01-18: Implemented the first basic version of the file system.


## 💬 Community

- [Discord](https://discord.gg/PKrJtqTxgT)
- QQ Group: 1081092390

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the GPL-3.0 License - see [LICENSE](LICENSE).
