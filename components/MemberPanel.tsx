"use client";

import { ALL, NOBODY } from "./TeamPanel";
import type { Member, Project, Task } from "@/lib/types";
import { shortDate, sortTasks, tally } from "@/lib/util";

/**
 * 팀원 한 줄 보기. **누가 무엇을 붙잡고 있는지**를 업무 표를 훑기 전에 먼저 읽는 자리다.
 *
 * 여기서 만드는 값은 하나도 없다 — 이름도 역할도 `lib/seed.ts` 에서 오고, 숫자와 업무는
 * 전부 업무 목록에서 센다. 그래서 이 화면이 업무와 어긋날 일이 없다.
 *
 * 칸을 누르면 아래 업무 표가 그 사람 것만 남는다. 업무 섹션 제목 옆 드롭다운과 **같은 상태**라
 * 어느 쪽으로 골라도 나머지 한쪽이 따라 바뀐다.
 */
export default function MemberPanel({
  members,
  projects,
  tasks,
  today,
  filter,
  onFilter,
}: {
  members: Member[];
  projects: Project[];
  tasks: Task[];
  today: string;
  /** 업무 섹션과 같이 쓰는 담당자 필터. ALL 이면 전체 */
  filter: string;
  onFilter: (id: string) => void;
}) {
  const unassigned = tasks.filter((t) => !t.assignee);

  // 미배정은 사람이 아니지만 붙잡는 사람이 없다는 뜻이라 같은 줄에 둔다 —
  // 있을 때만 뜬다. 늘 떠 있으면 0 건인 칸이 자리만 차지한다.
  const cells: { id: string; name: string; role: string; mine: Task[] }[] = [
    ...members.map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      mine: tasks.filter((t) => t.assignee === m.id),
    })),
    ...(unassigned.length ? [{ id: NOBODY, name: "미배정", role: "", mine: unassigned }] : []),
  ];

  return (
    <section className="sec">
      <div className="sechead">
        <h2>팀원</h2>
        <span className="rule" />
        {filter !== ALL ? (
          <button type="button" className="ghost sm" onClick={() => onFilter(ALL)}>
            전체 보기
          </button>
        ) : null}
      </div>

      <div className="wholist">
        {cells.map((c) => {
          const t = tally(c.mine, today);
          const pct = t.total ? t.done / t.total : 0;
          // 지금 붙잡고 있는 것. 진행 중이 없으면 다음에 할 것(시작 전)을 대신 보여 준다 —
          // 빈 칸보다 "다음이 무엇인지" 가 읽을 거리가 있다.
          const now = sortTasks(c.mine.filter((x) => x.status === 1));
          const next = sortTasks(c.mine.filter((x) => x.status === 0));
          const show = now.length ? now : next;
          const picked = filter === c.id;

          return (
            <button
              type="button"
              className={"whotile" + (picked ? " picked" : "")}
              key={c.id}
              aria-pressed={picked}
              onClick={() => onFilter(picked ? ALL : c.id)}
              title={picked ? "다시 눌러 전체 업무 보기" : `${c.name} 업무만 아래 표에 보기`}
            >
              <span className="whotop">
                <b className="whoname">{c.name}</b>
                {c.role ? <i className="whorole">{c.role}</i> : null}
                {t.late ? <i className="lateflag">지연 {t.late}</i> : null}
              </span>

              {show.length ? (
                <span className="whonow">
                  <i className={"tag" + (now.length ? "" : " soonish")}>{now.length ? "진행" : "다음"}</i>
                  <span className="wholines">
                    {show.slice(0, 2).map((x) => (
                      <span className="whotask" key={x.id}>
                        {x.title || "이름 없는 업무"}
                        {x.due ? <i className="whodue">{shortDate(x.due)}</i> : null}
                      </span>
                    ))}
                    {show.length > 2 ? <span className="whomore">외 {show.length - 2}건</span> : null}
                  </span>
                </span>
              ) : (
                <span className="whonow empty">{t.total ? "남은 업무 없음" : "배정된 업무 없음"}</span>
              )}

              <span className="whofoot">
                <span className="bar sm">
                  <i className="fill" style={{ width: `${pct * 100}%` }} />
                </span>
                <span className="whocount">
                  {t.done}/{t.total}
                  {c.id !== NOBODY && projectsOf(c.id, projects).length
                    ? ` · 프로젝트 ${projectsOf(c.id, projects).length}`
                    : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** 그 사람이 맡고 있는 프로젝트. 끝난 것은 빼고 센다 — 지금 지고 있는 짐만 보여야 한다. */
function projectsOf(memberId: string, projects: Project[]) {
  return projects.filter((p) => p.owner === memberId && p.status !== 2);
}
