"use client";

import { useState } from "react";
import { NoteField } from "./fields";
import { ALL, NOBODY } from "./TeamPanel";
import {
  ASK,
  type Member,
  type Task,
  type Week,
  type WeekItem,
  weekIdOf,
  weekLabel,
  weeksOfMonth,
} from "@/lib/types";
import { isLate, shortDate, sortTasks, tally } from "@/lib/util";

/**
 * 주간 기록. 그 달의 주차마다 한 줄이고, 펼치면 **팀원마다 자기 줄**이 있다.
 *
 * 적는 것은 항목 하나씩이다 — 한 사람이 한 주에 여러 개를 적고, **컨펌도 하나씩 따로** 된다.
 * 한 칸에 다 몰아 적으면 어디까지 봤는지 표시할 자리가 없다.
 *
 * 맨 아래 **컨펌 요청** 은 사람에게 안 붙는 줄이다 — 팀장이 결정해 줘야 하는 것들.
 *
 * 업무 건수와 사람 칩은 저장하지 않는다. 업무의 기한이 그 주에 들어오면 자동으로 세어진다 —
 * 사람이 두 군데에 같은 걸 적는 일이 없어야 한다.
 *
 * 팀원을 고르면 이 섹션 전체가 **그 사람 기준**으로 바뀐다. 건수도 그 사람 것이고,
 * 사람 칩이 있던 자리에 그 주에 그 사람이 맡은 업무 이름이 뜨고, 적는 줄도 그 사람 것만 남는다.
 */
export default function WeekPanel({
  monthId,
  weeks,
  members,
  tasks,
  today,
  readOnly,
  filter,
  filterMember,
  onFilter,
  onFilterMember,
  onAddItem,
  onPatchItem,
  onRemoveItem,
}: {
  monthId: string;
  weeks: Week[];
  members: Member[];
  tasks: Task[];
  today: string;
  readOnly: boolean;
  /** 지금 좁혀 보고 있는 주(월요일 날짜). "" 면 전체 */
  filter: string;
  /** 팀원 섹션·업무 표와 같이 쓰는 담당자 필터. ALL 이면 팀 전체 */
  filterMember: string;
  onFilter: (weekId: string) => void;
  onFilterMember: (memberId: string) => void;
  /** `by` 가 빈 문자열이면 컨펌 요청 줄에 붙는다 */
  onAddItem: (weekId: string, by: string) => void;
  onPatchItem: (weekId: string, itemId: string, patch: Partial<WeekItem>) => void;
  onRemoveItem: (weekId: string, itemId: string) => void;
}) {
  const ids = weeksOfMonth(monthId);
  const thisWeek = today ? weekIdOf(today) : "";
  const byId = new Map(weeks.map((w) => [w.id, w]));

  const scoped = filterMember !== ALL;
  const scopedName =
    filterMember === NOBODY
      ? "미배정"
      : (members.find((m) => m.id === filterMember)?.name ?? "");

  /**
   * 펼쳐 둔 주. 다섯 주를 다 펼치면 화면이 안 읽혀서 **이번 주만 열어 두고** 나머지는 접는다.
   * 사람으로 좁혀 봐도 마찬가지다 — 지난 주를 보려면 그 줄을 누른다.
   *
   * `null` 은 '아직 아무것도 안 눌렀다' 는 뜻이다. 빈 배열과 갈라 놓아야
   * **이번 주를 접은 것이 그대로 남는다**(빈 배열을 기본값으로 되돌리면 다시 펼쳐진다).
   */
  const [open, setOpen] = useState<string[] | null>(null);
  const isOpen = (id: string) => (open ?? (thisWeek ? [thisWeek] : [])).includes(id);
  // 값이 아니라 함수로 넘긴다 — 두 줄을 잇달아 누르면 앞의 클릭이 조용히 사라진다.
  const toggle = (id: string) =>
    setOpen((v) => {
      const base = v ?? (thisWeek ? [thisWeek] : []);
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });

  return (
    <section className="sec">
      <div className="sechead">
        <h2>주간</h2>
        {/* 팀원을 골라 둔 채로 여기를 읽으면 숫자도 줄도 다르다. 그 사실을 제목이 말한다. */}
        {scoped && scopedName ? <span className="wscope">{scopedName} 기준</span> : null}
        <span className="rule" />
        {filter || scoped ? (
          <button
            type="button"
            className="ghost sm"
            onClick={() => {
              onFilter("");
              onFilterMember(ALL);
            }}
          >
            전체 보기
          </button>
        ) : null}
      </div>

      <div className="card wlist">
        {ids.map((id) => {
          const w = byId.get(id) ?? { id, items: [] };
          // 그 주에 기한이 걸린 업무. 기한이 없는 업무는 어느 주에도 안 잡힌다.
          const all = tasks.filter((t) => t.due && weekIdOf(t.due) === id);
          const mine = scoped ? all.filter((t) => isOf(t, filterMember)) : all;
          const t = tally(mine, today);
          const now = id === thisWeek;
          const opened = isOpen(id);

          // 미배정에는 적을 사람이 없다. 그때는 컨펌 요청 줄만 남는다.
          const writers = scoped ? members.filter((m) => m.id === filterMember) : members;
          const shown = scoped
            ? w.items.filter((x) => x.by === filterMember || x.by === ASK)
            : w.items;
          // 접었을 때 뭘 말할지: **내가 봐야 할 것이 남았는지**가 먼저다.
          const asks = shown.filter((x) => x.by === ASK && x.text);
          const wait = asks.filter((x) => !x.done).length;
          const wrote = shown.filter((x) => x.by !== ASK && x.text).length;

          return (
            <div
              className={
                "wrow" + (filter === id ? " picked" : "") + (now ? " now" : "") + (opened ? " open" : "")
              }
              key={id}
            >
              <div className="whead">
                <button
                  type="button"
                  className="wlabel"
                  onClick={() => onFilter(filter === id ? "" : id)}
                  title="이 주에 기한이 걸린 업무만 아래 표에 보기"
                >
                  <span className="wdate">{weekLabel(id)}</span>
                  {now ? <span className="wnow">이번 주</span> : null}
                </button>

                <span className="wwho">
                  <span className="wcount">
                    {t.total ? (
                      <>
                        업무 {t.total}건 · 완료 {t.done}
                        {t.late ? <b className="lateflag"> 지연 {t.late}</b> : null}
                      </>
                    ) : (
                      <span className="muted">{scoped ? "맡은 업무 없음" : "기한 걸린 업무 없음"}</span>
                    )}
                  </span>

                  {/*
                    팀 전체로 볼 때는 **누가** 이 주에 붙어 있는지를 보여 주고,
                    한 사람으로 좁히면 같은 자리에 **무엇을** 하는지가 온다.
                    둘 다 업무 목록에서 나오는 값이라 따로 적을 게 없다.
                  */}
                  {scoped ? (
                    <span className="wtasks">
                      {sortTasks(mine)
                        .slice(0, 3)
                        .map((x) => (
                          <span className={"wtask s" + x.status} key={x.id}>
                            {x.title || "이름 없는 업무"}
                            <i className="wtdue">{shortDate(x.due)}</i>
                          </span>
                        ))}
                      {mine.length > 3 ? <span className="wmore">외 {mine.length - 3}건</span> : null}
                    </span>
                  ) : (
                    <span className="wchips">
                      {peopleOf(all, members, today).map((p) => (
                        <button
                          type="button"
                          className="wchip"
                          key={p.id}
                          onClick={() => onFilterMember(p.id)}
                          title={`${p.name} 업무만 보기`}
                        >
                          {p.name}
                          <i className={p.late ? "n late" : "n"}>{p.n}</i>
                        </button>
                      ))}
                    </span>
                  )}
                </span>

                {/* 접었을 때 남는 건 이 버튼뿐이다 — 몇 개 중 몇 개를 컨펌했는지. */}
                <button
                  type="button"
                  className="wsum"
                  onClick={() => toggle(id)}
                  aria-expanded={opened}
                  title={opened ? "접기" : "펼쳐서 적기"}
                >
                  <i className="caret">{opened ? "▾" : "▸"}</i>
                  {asks.length ? (
                    wait ? (
                      <span className="wprog wait">컨펌 대기 {wait}</span>
                    ) : (
                      <span className="wprog all">컨펌 완료</span>
                    )
                  ) : wrote ? (
                    <span className="wprog">적은 것 {wrote}</span>
                  ) : (
                    <span className="wprog none">적힌 것 없음</span>
                  )}
                </button>
              </div>

              {opened ? (
                <div className="wbody">
                  {writers.map((m) => (
                    <ItemGroup
                      key={m.id}
                      name={m.name}
                      items={w.items.filter((x) => x.by === m.id)}
                      weekId={id}
                      today={today}
                      readOnly={readOnly}
                      onAdd={() => onAddItem(id, m.id)}
                      onPatch={onPatchItem}
                      onRemove={onRemoveItem}
                    />
                  ))}
                  {/* 사람에게 안 붙는 줄. 팀장이 결정해 줘야 하는 것들이 여기 쌓인다. */}
                  <ItemGroup
                    ask
                    name="컨펌 요청"
                    items={w.items.filter((x) => x.by === ASK)}
                    weekId={id}
                    today={today}
                    readOnly={readOnly}
                    onAdd={() => onAddItem(id, ASK)}
                    onPatch={onPatchItem}
                    onRemove={onRemoveItem}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- 한 사람의 줄 ---------- */

function ItemGroup({
  name,
  items,
  weekId,
  today,
  readOnly,
  ask,
  onAdd,
  onPatch,
  onRemove,
}: {
  name: string;
  items: WeekItem[];
  weekId: string;
  today: string;
  readOnly: boolean;
  ask?: boolean;
  onAdd: () => void;
  onPatch: (weekId: string, itemId: string, patch: Partial<WeekItem>) => void;
  onRemove: (weekId: string, itemId: string) => void;
}) {
  return (
    <div className={"wgroup" + (ask ? " ask" : "") + (items.length ? " has" : "")}>
      <span className="wname">{name}</span>

      <div className="witems">
        {items.length === 0 ? (
          <p className="wempty">{ask ? "컨펌받을 것이 있으면 여기에" : "적은 것 없음"}</p>
        ) : (
          items.map((it) => (
            <div className={"witem" + (it.done ? " done" : "")} key={it.id}>
              <NoteField
                value={it.text}
                readOnly={readOnly}
                onCommit={(v) => onPatch(weekId, it.id, { text: v })}
                placeholder={ask ? "무엇을 컨펌받아야 하는지" : "이 주에 진행한 일"}
                ariaLabel={`${name} 진행 내용`}
              />

              {/*
                **컨펌 요청 줄에만** 완료 토글이 붙는다. 컨펌하는 사람은 팀장 한 명이라,
                팀원이 적은 진행 내용마다 토글을 두면 아무도 안 누르는 버튼이 스무 개 생긴다.
                누르면 미완료 ↔ 완료이고 완료로 바꾼 날이 옆에 박힌다 — 언제 봤는지가 같이 남게.
              */}
              {ask ? (
                <button
                  type="button"
                  className={"wdone" + (it.done ? " on" : "")}
                  disabled={readOnly}
                  aria-pressed={it.done}
                  onClick={() => onPatch(weekId, it.id, { done: !it.done, doneAt: it.done ? "" : today })}
                  title="누르면 완료 ↔ 미완료"
                >
                  {it.done ? "완료" : "미완료"}
                  {it.done && it.doneAt ? (
                    <i className="wdoneat">
                      {Number(it.doneAt.slice(5, 7))}/{Number(it.doneAt.slice(8, 10))}
                    </i>
                  ) : null}
                </button>
              ) : null}

              <button
                type="button"
                className="x"
                disabled={readOnly}
                onClick={() => {
                  if (it.text && !window.confirm(`"${it.text.slice(0, 30)}" 을 지웁니다.`)) return;
                  onRemove(weekId, it.id);
                }}
                aria-label="항목 삭제"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      <button type="button" className="wadd" disabled={readOnly} onClick={onAdd} title="줄 하나 더">
        ＋
      </button>
    </div>
  );
}

/** 담당자 필터 한 칸과 업무 하나가 맞는지. `미배정` 은 담당자가 비어 있는 업무다. */
function isOf(task: Task, who: string) {
  return who === NOBODY ? !task.assignee : task.assignee === who;
}

/**
 * 그 주에 업무를 지고 있는 사람들. 팀원 순서를 그대로 따르고 미배정은 맨 뒤에 붙인다 —
 * 주마다 사람 순서가 바뀌면 세로로 훑을 수가 없다.
 *
 * `today` 는 마운트 뒤에 들어온다. 빈 문자열인 동안에는 아무도 지연이 아니다
 * (`isLate` 와 같은 규칙 — 서버와 브라우저가 다른 날짜로 그리면 화면이 어긋난다).
 */
function peopleOf(tasks: Task[], members: Member[], today: string) {
  const out = members
    .map((m) => {
      const his = tasks.filter((t) => t.assignee === m.id);
      return {
        id: m.id,
        name: m.name,
        n: his.length,
        late: his.some((t) => isLate(t.due, t.status, today)),
      };
    })
    .filter((x) => x.n);
  const none = tasks.filter((t) => !t.assignee);
  return none.length
    ? [...out, { id: NOBODY, name: "미배정", n: none.length, late: false }]
    : out;
}
