"use client";

import { NoteField, TextField } from "./fields";
import {
  BRANDS,
  type Member,
  type Project,
  STATUS_LABEL,
  type Task,
  toggleBrand,
  weekIdOf,
  weekLabel,
} from "@/lib/types";
import { href, isLate, sortTasks } from "@/lib/util";

/** 담당자 필터의 특별한 두 값. 실제 Member.id 와 겹치지 않게 앞에 @ 를 붙였다. */
export const ALL = "";
export const NOBODY = "@none";

export default function TeamPanel({
  members,
  projects,
  tasks,
  today,
  readOnly,
  filterMember,
  filterProject,
  filterWeek,
  showDone,
  pin,
  onFilterMember,
  onFilterProject,
  onFilterWeek,
  onToggleDone,
  onTaskPatch,
  onTaskCycle,
  onTaskAdd,
  onTaskRemove,
}: {
  members: Member[];
  projects: Project[];
  tasks: Task[];
  today: string;
  readOnly: boolean;
  filterMember: string;
  filterProject: string;
  /** 좁혀 보는 주의 월요일 날짜. "" 면 전체. 기한이 그 주에 든 업무만 남는다. */
  filterWeek: string;
  showDone: boolean;
  /** 방금 만든 업무 id. 표 맨 위로 올려 준다. */
  pin: string;
  onFilterMember: (id: string) => void;
  onFilterProject: (id: string) => void;
  onFilterWeek: (id: string) => void;
  onToggleDone: () => void;
  onTaskPatch: (id: string, patch: Partial<Task>) => void;
  onTaskCycle: (id: string) => void;
  onTaskAdd: () => void;
  onTaskRemove: (id: string) => void;
}) {
  const shown = sortTasks(
    tasks.filter((t) => {
      if (filterMember === NOBODY && t.assignee) return false;
      if (filterMember && filterMember !== NOBODY && t.assignee !== filterMember) return false;
      if (filterProject && t.project !== filterProject) return false;
      // 기한이 없는 업무는 어느 주에도 안 속한다 — 주로 좁혀 보면 빠진다.
      if (filterWeek && weekIdOf(t.due) !== filterWeek) return false;
      if (!showDone && t.status === 2) return false;
      return true;
    }),
    pin,
  );

  const filterName =
    filterMember === NOBODY
      ? "미배정"
      : (members.find((m) => m.id === filterMember)?.name ?? "");
  const projectName = projects.find((p) => p.id === filterProject)?.name ?? "";
  const labels = [filterName, projectName, filterWeek ? `${weekLabel(filterWeek)} 주` : ""].filter(
    Boolean,
  );

  return (
    <section className="sec">
      <div className="sechead">
        <h2>업무</h2>
        {/* 누가 무엇을 붙잡고 있는지는 여기서 좁혀 본다. 미배정도 한 칸이다. */}
        <select
          className="sel headsel"
          data-on={filterMember === ALL ? "0" : "1"}
          value={filterMember}
          onChange={(e) => onFilterMember(e.currentTarget.value)}
          aria-label="담당자로 좁혀 보기"
        >
          <option value={ALL}>담당자 전체</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
          <option value={NOBODY}>미배정</option>
        </select>
        <span className="rule" />
        <label className="donetog">
          <input type="checkbox" checked={showDone} onChange={onToggleDone} />
          완료 포함
        </label>
        <button type="button" className="ghost sm" disabled={readOnly} onClick={onTaskAdd}>
          ＋ 업무
        </button>
      </div>

      {labels.length ? (
        <p className="filterbar">
          <span>
            {labels.map((label, i) => (
              <span key={label}>
                {i ? " · " : null}
                <b>{label}</b>
              </span>
            ))}
            {/* `로` 를 붙이면 "미배정 로" 가 된다. 받침을 안 타는 `만` 으로 쓴다. */}
            만 보는 중
          </span>
          <button
            type="button"
            className="ghost sm"
            onClick={() => {
              onFilterMember(ALL);
              onFilterProject("");
              onFilterWeek("");
            }}
          >
            전체 보기
          </button>
        </p>
      ) : null}

      <div className="card tablewrap">
        <div className="ttable">
          <div className="thead">
            <span>상태</span>
            <span>업무</span>
            <span>브랜드</span>
            <span>담당</span>
            <span>프로젝트</span>
            <span>기한</span>
            <span>메모</span>
            <span>URL</span>
            <span />
          </div>

          {shown.length === 0 ? (
            <p className="norow">
              {tasks.length === 0
                ? "업무가 아직 없습니다. ＋ 업무 로 한 줄 만들고 담당자를 골라 주세요."
                : "이 조건에 맞는 업무가 없습니다."}
            </p>
          ) : (
            shown.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                pinned={t.id === pin}
                members={members}
                projects={projects}
                today={today}
                readOnly={readOnly}
                onPatch={(patch) => onTaskPatch(t.id, patch)}
                onCycle={() => onTaskCycle(t.id)}
                onRemove={() => onTaskRemove(t.id)}
              />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

/* ---------- 업무 한 줄 ---------- */

function TaskRow({
  task,
  pinned,
  members,
  projects,
  today,
  readOnly,
  onPatch,
  onCycle,
  onRemove,
}: {
  task: Task;
  pinned: boolean;
  members: Member[];
  projects: Project[];
  today: string;
  readOnly: boolean;
  onPatch: (patch: Partial<Task>) => void;
  onCycle: () => void;
  onRemove: () => void;
}) {
  const late = isLate(task.due, task.status, today);

  return (
    <div className={"trow s" + task.status + (pinned ? " pinned" : "")}>
      <button
        type="button"
        className={`chip s${task.status}`}
        disabled={readOnly}
        onClick={onCycle}
        title="누르면 상태가 바뀝니다"
        aria-label={`${task.title || "업무"} — ${STATUS_LABEL[task.status]}`}
      >
        {STATUS_LABEL[task.status]}
      </button>

      <TextField
        className="field ttitle"
        value={task.title}
        readOnly={readOnly}
        onCommit={(v) => onPatch({ title: v })}
        placeholder="무슨 일인지"
        ariaLabel="업무 이름"
      />

      {/*
        브랜드는 여러 개일 수 있어서 select 대신 칩을 켜고 끈다. 표 안에서 select multiple 은
        높이가 튀고, 두 개 중 뭐가 켜져 있는지 열지 않고는 알 수 없다.
      */}
      <div className="bchips">
        {BRANDS.map((b) => {
          const on = task.brands.includes(b.id);
          return (
            <button
              key={b.id}
              type="button"
              className={"bchip" + (on ? " on" : "")}
              data-b={b.id}
              disabled={readOnly}
              aria-pressed={on}
              onClick={() => onPatch({ brands: toggleBrand(task.brands, b.id) })}
              title={`${b.name} ${on ? "빼기" : "넣기"}`}
            >
              {b.name}
            </button>
          );
        })}
      </div>

      <select
        className="sel"
        value={task.assignee}
        disabled={readOnly}
        onChange={(e) => onPatch({ assignee: e.currentTarget.value })}
        aria-label="담당자"
      >
        <option value="">미배정</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>

      <select
        className="sel"
        value={task.project}
        disabled={readOnly}
        onChange={(e) => onPatch({ project: e.currentTarget.value })}
        aria-label="프로젝트"
      >
        <option value="">상시</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <input
        type="date"
        className={"dt" + (task.due ? " has" : "") + (late ? " late" : "")}
        value={task.due}
        disabled={readOnly}
        onChange={(e) => onPatch({ due: e.currentTarget.value })}
        aria-label="기한"
      />

      <NoteField
        value={task.note}
        readOnly={readOnly}
        onCommit={(v) => onPatch({ note: v })}
        placeholder="진행 상황 · 막힌 지점"
        ariaLabel="메모"
      />

      {/* 주소는 길어서 칸에 다 안 들어간다. 여는 건 옆의 화살표가 맡고, 칸은 고치는 자리로 둔다. */}
      <div className="urlcell">
        <TextField
          className="field turl"
          value={task.url}
          readOnly={readOnly}
          onCommit={(v) => onPatch({ url: v })}
          placeholder="링크"
          ariaLabel="관련 링크"
        />
        {task.url ? (
          <a
            className="go"
            href={href(task.url)}
            target="_blank"
            rel="noreferrer noopener"
            title={task.url}
            aria-label={`${task.title || "업무"} 링크 열기`}
          >
            ↗
          </a>
        ) : null}
      </div>

      <button
        type="button"
        className="x"
        disabled={readOnly}
        onClick={() => {
          if (task.title && !window.confirm(`"${task.title}" 업무를 지웁니다.`)) return;
          onRemove();
        }}
        aria-label="업무 삭제"
      >
        ×
      </button>
    </div>
  );
}
