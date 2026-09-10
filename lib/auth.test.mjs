/*
 * `mayApply` 규칙 시험. `node --test lib/auth.test.mjs` 로 돌린다.
 *
 * 서버가 막는 규칙이라 화면을 눌러 보는 것만으로는 못 믿는다 — 헤더만 바꿔서 보내는 사람이
 * 있다고 보고, 거절해야 하는 경우를 하나씩 세워 둔다.
 *
 * `lib/auth.ts` 는 "server-only" 라 여기서 바로 import 할 수 없다. 규칙 함수만 옮겨 오지 않고
 * **진짜 파일을 읽어서 그 자리에서 컴파일한다** — 사본을 두면 둘이 갈라진다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const src = fs.readFileSync(path.join(import.meta.dirname, "auth.ts"), "utf8")
  // "server-only" 는 Next 안에서만 풀리는 모듈이라 시험에서는 뺀다.
  .replace('import "server-only";', "")
  .replace(/import type .*?;\n/g, "");

const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

const { mayApply, whoIs, keyRequired } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`
);

/* ---------- 판 만들기 ---------- */

const item = (o) => ({ id: "i1", by: "p-lyy", ask: false, text: "글", done: false, doneAt: "", ...o });

const board = (items = []) => ({
  v: 1,
  rev: 3,
  updated: null,
  months: { "2026-09": { metrics: [{ id: "m1", name: "총매출", target: 100, actual: 0 }] } },
  members: [{ id: "p-oyc", name: "오유찬" }, { id: "p-lyy", name: "임영유" }],
  projects: [],
  tasks: [],
  weeks: items.length ? [{ id: "2026-09-07", items }] : [],
});

const clone = (x) => structuredClone(x);
const lyy = { kind: "member", id: "p-lyy" };
const lead = { kind: "lead" };

/* ---------- 키 → 누구 ---------- */

test("사람별 키가 그 사람으로 풀린다", () => {
  process.env.BOARD_WRITE_KEY = "LEAD";
  process.env.BOARD_KEYS = "p-lyy:AAA, p-lhj:BBB";
  assert.deepEqual(whoIs("LEAD"), { kind: "lead" });
  assert.deepEqual(whoIs("AAA"), { kind: "member", id: "p-lyy" });
  assert.deepEqual(whoIs("BBB"), { kind: "member", id: "p-lhj" });
  assert.equal(whoIs("몰라"), null);
  assert.equal(whoIs(null), null);
  assert.equal(keyRequired(), true);
});

test("키를 아무것도 안 걸면 누구나 고친다", () => {
  delete process.env.BOARD_WRITE_KEY;
  delete process.env.BOARD_KEYS;
  assert.deepEqual(whoIs(null), { kind: "open" });
  assert.equal(keyRequired(), false);
  assert.equal(mayApply(board(), board(), whoIs(null)).ok, true);
});

/* ---------- 팀원이 할 수 있는 것 ---------- */

test("자기 항목은 고칠 수 있다", () => {
  const before = board([item({ text: "예전" })]);
  const after = clone(before);
  after.weeks[0].items[0].text = "고침";
  assert.equal(mayApply(before, after, lyy).ok, true);
});

test("자기 항목은 만들 수 있다", () => {
  const before = board();
  const after = board([item({ id: "new", text: "새로" })]);
  assert.equal(mayApply(before, after, lyy).ok, true);
});

test("자기 항목은 지울 수 있다", () => {
  const before = board([item()]);
  const after = board();
  assert.equal(mayApply(before, after, lyy).ok, true);
});

test("자기 이름으로 컨펌 요청도 만들 수 있다", () => {
  const before = board();
  const after = board([item({ id: "a1", ask: true, text: "가격 확정 필요" })]);
  assert.equal(mayApply(before, after, lyy).ok, true);
});

/* ---------- 팀원이 못 하는 것 ---------- */

const denied = (before, after, who = lyy) => {
  const v = mayApply(before, after, who);
  assert.equal(v.ok, false, "통과되면 안 된다");
  return v.why;
};

test("남의 항목은 고칠 수 없다", () => {
  const before = board([item({ by: "p-oyc", text: "팀장 글" })]);
  const after = clone(before);
  after.weeks[0].items[0].text = "몰래 고침";
  assert.match(denied(before, after), /남이 적은/);
});

test("남의 항목은 지울 수 없다", () => {
  const before = board([item({ by: "p-oyc" })]);
  assert.match(denied(before, board()), /지울 수 없/);
});

test("남의 이름으로 항목을 만들 수 없다", () => {
  const after = board([item({ id: "x", by: "p-oyc", text: "남의 이름" })]);
  assert.match(denied(board(), after), /남의 이름/);
});

test("자기 항목이어도 완료 표시는 못 한다", () => {
  const before = board([item({ ask: true, text: "요청" })]);
  const after = clone(before);
  after.weeks[0].items[0].done = true;
  after.weeks[0].items[0].doneAt = "2026-09-10";
  assert.match(denied(before, after), /팀장만/);
});

test("만들면서 완료로 넣어도 막힌다", () => {
  const after = board([item({ id: "x", ask: true, done: true, doneAt: "2026-09-10" })]);
  assert.match(denied(board(), after), /팀장만/);
});

test("남의 완료 표시를 풀 수 없다", () => {
  const before = board([item({ by: "p-oyc", ask: true, done: true, doneAt: "2026-09-09" })]);
  const after = clone(before);
  after.weeks[0].items[0].done = false;
  assert.match(denied(before, after), /남이 적은/);
});

test("주간 밖은 아무것도 못 바꾼다", () => {
  for (const change of [
    (s) => (s.months["2026-09"].metrics[0].target = 999),
    (s) => s.tasks.push({ id: "t1", title: "몰래 추가" }),
    (s) => s.projects.push({ id: "j1", name: "몰래" }),
    (s) => (s.members[0].name = "다른 이름"),
    (s) => s.members.push({ id: "p-new", name: "몰래 넣은 사람" }),
  ]) {
    const before = board([item()]);
    const after = clone(before);
    change(after);
    assert.match(denied(before, after), /주간 기록만/);
  }
});

test("항목의 작성자를 바꿔치기할 수 없다", () => {
  const before = board([item()]);
  const after = clone(before);
  after.weeks[0].items[0].by = "p-oyc";
  assert.match(denied(before, after), /남이 적은|자기가 적은/);
});

test("진행 내용과 컨펌 요청 사이로 옮길 수 없다", () => {
  const before = board([item()]);
  const after = clone(before);
  after.weeks[0].items[0].ask = true;
  assert.match(denied(before, after), /옮길 수는/);
});

test("작성자 없는 옛 항목은 팀원이 못 건드린다", () => {
  const before = board([item({ by: "", ask: true, text: "옛 비고" })]);
  const after = clone(before);
  after.weeks[0].items[0].text = "고침";
  assert.match(denied(before, after), /남이 적은/);
  // 팀장은 된다
  assert.equal(mayApply(before, after, lead).ok, true);
});

test("팀장은 다 된다", () => {
  const before = board([item({ by: "p-lyy" })]);
  const after = clone(before);
  after.weeks[0].items[0].done = true;
  after.months["2026-09"].metrics[0].target = 500;
  after.tasks.push({ id: "t1", title: "추가" });
  assert.equal(mayApply(before, after, lead).ok, true);
});

test("키가 없으면 아무것도 못 한다", () => {
  assert.match(denied(board(), board(), null), /편집 키/);
});

test("rev 와 updated 가 달라도 권한 위반이 아니다", () => {
  const before = board([item()]);
  const after = clone(before);
  after.rev = 99;
  after.updated = "2026-09-10T00:00:00.000Z";
  assert.equal(mayApply(before, after, lyy).ok, true);
});
