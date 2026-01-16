<div align="center">

<img src="resources/wand.png" width="128" height="128" alt="Skills Wizard Logo">

# Skills Wizard

**你的代码助手技能管理专家**

[![Version](https://img.shields.io/visual-studio-marketplace/v/your-publisher.skills-wizard?style=flat-square&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=your-publisher.skills-wizard)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/your-publisher.skills-wizard?style=flat-square&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=your-publisher.skills-wizard)
[![License](https://img.shields.io/github/license/your-username/skills-wizard?style=flat-square)](LICENSE)

[English](README.md) | [中文](README_CN.md) | [更新日志](CHANGELOG.md)

</div>

---

**Skills Wizard** 是一款强大的 VS Code 插件，旨在帮助你管理、组织和分发各类代码助手（如 Claude, Cursor, Copilot 等）的 "Skills"（提示词库/能力包）。

它可以将分散在不同位置的 Skills 集中管理，并允许你轻松地将它们注入到当前工作区中。

## ✨ 功能特性

- 🕵️ **自动识别**: 自动扫描并识别来自全局和工作区路径的 Skills，支持路径包括：
  - `~/.claude/skills/`
  - `~/.cursor/skills/`
  - `~/.copilot/skills/`
  - 等等...
- 📦 **一键导入/导出**: 轻松将 Skills 导入插件库，或将其导出到当前项目的指定目录。
- 🎨 **预设管理**: 将多个 Skill 组合成预设 (Preset)。只需一键，即可将整套技能应用到当前项目。
- 🏷️ **自定义元数据**: 为你的 Skills 添加标签和来源，管理更有条理。
- 🐙 **GitHub 集成**: 支持直接从 GitHub 仓库 URL 导入 Skills。
- 🔄 **跨平台支持**: 完美支持 Windows, macOS 和 Linux。
- 🆔 **智能去重**: 基于 MD5 哈希的唯一标识，防止重复导入，高效管理更新。

## 🚀 使用指南

1.  点击活动栏（Side Bar）上的 **Skills Wizard** 图标 (🪄)。
2.  **导入**: 插件会自动扫描现有 Skills。你也可以选择自定义路径或输入 GitHub 链接进行导入。
3.  **管理**: 浏览你的技能库，编辑标签，或将其整理为预设。
4.  **应用**: 选择单个 Skill 或一个预设，将其导出应用到当前工作区。

## ⚙️ 配置说明

你可以在 VS Code 设置中自定义插件行为：

| 设置项 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `skillsWizard.defaultExportPath` | `.claude/skills/` | Skills 添加到工作区时的默认存放路径。 |

## 📂 支持的路径

插件支持扫描和管理以下常用位置的 Skills：

**全局路径:**
- `~/.claude/skills/`
- `~/.cursor/skills/`
- `~/.config/opencode/skill/`
- ...以及更多

**工作区路径:**
- `.claude/skills/`
- `.cursor/skills/`
- `.agent/skills/`
- ...以及更多

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 来完善这个项目！

## 📄 许可证

本项目采用 GPLv3 许可证 - 详情请参阅 [LICENSE](LICENSE) 文件。
