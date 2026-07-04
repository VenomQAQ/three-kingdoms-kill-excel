# 开发自测报告 · REQ-2026-003 · v1

- **时间**：2026-07-04T02:58+08:00
- **范围**：REQ-2026-003 代码交付后的开发侧 smoke
- **结论**：核心自动化自测通过；`nest build` 在当前工作区因 `server/dist` 残留声明文件权限异常未完成，已用独立 outDir 完成服务端 TypeScript 编译校验；浏览器视觉基线未执行，保留给 QA/E2E 阶段

## 覆盖点

| 覆盖项 | 对应需求 | 结果 | 说明 |
|---|---|---|---|
| 引擎规则回归 | R-ENG-01 / R-ENG-02 | pass | `@tk/engine` 全量 vitest 通过，含无懈/锦囊相关单测 |
| 正式房选将状态机 | R-GAME-01 / R-GAME-02 / R-GAME-03 | pass | 新增 `room.service.spec.ts` 覆盖 selecting、主公 5 候选、其他 3 候选、超时默认首候选；当前共 4 tests passed |
| 服务端编译 | 后端契约实现 | pass-with-env-note | `npx tsc -p server/tsconfig.json --noEmit` 与独立 outDir 编译通过；`nest build` 因当前 `server/dist/*.d.ts` 文件 ACL/权限异常无法清理 |
| 客户端编译与打包 | 前端契约实现 | pass | TypeScript build 与 Vite production build 通过 |

## 执行命令

```bash
npx vitest run server/src/modules/room/room.service.spec.ts
npm run test -w @tk/engine
npx tsc -p server/tsconfig.json --noEmit
npx tsc -p tsconfig.json --outDir .dist-check # from server/
npm run build -w server
npm run build -w client
```

## 执行结果摘要

- `server/src/modules/room/room.service.spec.ts`：4 tests passed
- `@tk/engine`：4 test files passed，19 tests passed
- `server`：TypeScript noEmit 与独立 outDir 编译 passed；`nest build` failed before compile cleanup with `EPERM: operation not permitted, lstat '...\\server\\dist\\app.module.d.ts'`
- `client`：`tsc -b && vite build` passed

## 已知未覆盖

- 未执行 Playwright/浏览器手工验收。
- 未生成 game-sheet 三档分辨率视觉基线截图；该项应由 QA 按 `qa-testability.v2.md` 的口径补测。
- 当前 Windows 工作区的 `server/dist` 内若干 `.d.ts` 文件无法读取 ACL 或删除，`Remove-Item -Force` 与 `takeown` 均失败；清理该目录权限后需复跑 `npm run build -w server`。
- `npm install --package-lock-only` 在当前 Node `v18.17.0` 下提示若干依赖 `EBADENGINE` warning；命令仍成功完成。项目依赖中 Nest 11 建议 Node >=20。
