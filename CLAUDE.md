# CLAUDE.md

项目规则统一维护在 `AGENTS.md`，此处直接引用，避免两份文件漂移：

@AGENTS.md

UI 设计规范（每次会话自动加载）：

@UI_DESIGN_GUIDELINES.md

---

## Claude Code 补充约定

- 修改规则时只改 `AGENTS.md`，不要在本文件复制内容。
- 动手前先读相关模块文件头的横幅注释和 README 对应章节：很多看似多余的写法是为修复真实事故留下的，不要「顺手简化」。
- 大范围改动（跨层搬移、拆分模块）前先列计划；每完成一步跑 `npm test`，不要攒到最后一起验证。
- 后台起服务调试时使用独立端口与临时数据目录（`PORT=… KANBAN_DATA_DIR=$(mktemp -d) DISABLE_BACKGROUND=1 node server.mjs`），不要污染仓库 `data/`。
- 汇报结果时给出实际运行的命令与输出摘要，不凭推断声称「已通过」。
