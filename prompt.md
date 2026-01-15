我需要开发一个 VS Code 插件，插件名 Skills Wizard。具体而言，需要实现以下需求：
1. 支持 Skills 的快捷导入导出；
2. 支持 Skills 的预设配置；

# 功能说明

## Skills 的快捷导入导出

需要插件自动识别，并提供供用户导入的界面，包括以下全局路径：

```
~/.claude/skills/<skill-name>/
~/.copilot/skills/<skill-name>/
~/.cursor/skills/<skill-name>/
~/.gemini/antigravity/skills/<skill-name>/
~/.config/opencode/skill/<skill-name>/
~/.codex/skills/<skill-name>/
/etc/codex/skills/
~/.gemini/antigravity/skills/<skill-name>/
```

以及以下的工作区路径：

```
.claude/skills/<skill-name>/
.github/skills/<skill-name>/
.cursor/skills/<skill-name>/
.agent/skills/<skill-name>/
.opencode/skill/<skill-name>/
.codex/skills/<skill-name>/
```

请注意：你需要做跨平台适配，包括 Windows、MacOS、Linux。

你需要支持快捷导出，能够将插件内保存的 Skills 导出到“当前工作区”的指定文件夹中；

## Skills 的预设配置

对于保存在插件中的 Skills，你需要支持用户自定义配置：标签，来源；

同时，你应该支持预设，单个预设中可以有多个Skills；

## 插件样式

你需要提供一个显示在 Primary Side Bar 区域的按钮，用户点击后即可进入插件管理页面；

在管理页面最上方，是导入 Skills 的能力；
- 你需要识别用户当前工作区 / 用户全局配置中的 Skills，并且计算 MD5 作为唯一标识（仅需计算 `SKILL.md` 的 MD5 即可），如果有未导入的 Skills，可以提醒用户导入或者覆盖已有的 Skill（根据是否同名判断）；

在这之下，是目前已经导入到插件中的 Skills；
- 请注意，一个可用的 Skill，是一个文件夹，文件夹内有一个名为 SKILL.md 的文件（必须）以及若干个子文件和文件夹；不过你在展示这个Skill的时候，不需要显示该 Skill 的具体内容，只需要包括它的名称、描述等；
- 导入到插件中的 Skills，你应该将其保存到某个用户全局路径中，推荐 `.config/skills-wizard/`，你需要按照文件夹保存每个 Skill（`skills/<skill-name>`），并添加一个 JSON 文件保存用户相关的配置 `config.json`，例如用户对每个 Skill 添加的标签等等信息；
- 不过你也需要提供用户编辑Skill的能力，用户可以编辑Skill相关的信息，可以编辑本插件提供的信息，例如标签等；
- 用户也可以添加某个 Skill 进入当前工作区；

在这之下，是预设界面，用户可以自由增、删、改预设，编辑预设相关的信息，添加/移除 Skill；
- 用户也可以将预设应用到当前工作区，有两种应用方式：一种是替换当前工作区的Skills，一种是覆盖当前工作区的Skills（默认，如果有同名的则替换已有的 Skill）；

你需要提供设置项，用户设置用户Skill到添加工作区默认应该添加到哪个位置（默认 `.claude/skills/<skill-name>/`）。

---

# 补充说明 1

1. 在导入界面，我希望支持用户选择自定义的 Skill 路径，你需要递归进去查找到里面的所有 Skill 文件夹，也有可能用户选择的路径就是单个 Skill 文件夹。
2. 你需要支持从 GitHub 导入 Skill：
   - 用户会输入一个 GitHub 仓库链接，你需要获取到这个仓库中的所有“工作区路径”中的 Skill 文件夹，并将其导入，你可以使用类似的 API：`https://api.github.com/repos/{username}/{repo_name}/contents/{folder_path}?ref={branch}`。