<div align="center">

<img src="resources/wand.svg" width="128" height="128" alt="Skills Wizard Logo">

# Skills Wizard

**The Ultimate Skill Manager for Your Coding Assistants**

[![Version](https://img.shields.io/visual-studio-marketplace/v/your-publisher.skills-wizard?style=flat-square&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=your-publisher.skills-wizard)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/your-publisher.skills-wizard?style=flat-square&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=your-publisher.skills-wizard)
[![License](https://img.shields.io/github/license/your-username/skills-wizard?style=flat-square)](LICENSE)

[English](README.md) | [中文](README_CN.md) | [Changelog](CHANGELOG.md)

</div>

---

**Skills Wizard** is a powerful VS Code extension designed to manage, organize, and distribute "Skills" (prompt libraries/capabilities) for various coding assistants like Claude, Cursor, Copilot, and more.

It centralizes your scattered skills from different locations and allows you to easily inject them into your current workspace.

## ✨ Features

- 🕵️ **Auto-Detection**: Automatically identifies skills from global and workspace paths including:
  - `~/.claude/skills/`
  - `~/.cursor/skills/`
  - `~/.copilot/skills/`
  - And many more...
- 📦 **One-Click Import/Export**: Easily import skills into the extension or export them to your current project's workspace.
- 🎨 **Preset Management**: Group multiple skills into presets. Apply an entire set of skills to a project in seconds.
- 🏷️ **Custom Metadata**: Tag your skills and manage their sources for better organization.
- 🐙 **GitHub Integration**: Import skills directly from any GitHub repository URL.
- 🔄 **Cross-Platform**: Fully compatible with Windows, macOS, and Linux.
- 🆔 **Smart Deduplication**: Uses MD5 hashing to prevent duplicate imports and manage updates efficiently.

## 🚀 Usage

1.  Click the **Skills Wizard** icon (🪄) in the Primary Side Bar.
2.  **Import**: The extension will scan for existing skills. You can also import from a custom path or a GitHub URL.
3.  **Manage**: View your library, edit skill tags, or organize them into presets.
4.  **Apply**: Select a skill or a preset and export it to your current workspace.

## ⚙️ Configuration

You can customize the extension behavior in VS Code settings:

| Setting | Default | Description |
| :--- | :--- | :--- |
| `skillsWizard.defaultExportPath` | `.claude/skills/` | The default directory where skills will be exported in your workspace. |

## 📂 Supported Paths

The extension scans and manages skills from these common locations:

**Global:**
- `~/.claude/skills/`
- `~/.cursor/skills/`
- `~/.config/opencode/skill/`
- ...and others.

**Workspace:**
- `.claude/skills/`
- `.cursor/skills/`
- `.agent/skills/`
- ...and others.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the GPLv3 License - see [LICENSE](LICENSE).
