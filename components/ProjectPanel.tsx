"use client";

import { TextField } from "./fields";
import { BRANDS, type Project, STATUS_LABEL, type Task, toggleBrand } from "@/lib/types";
import { isLate, tally } from "@/lib/util";

/** 브랜드 필터의 특별한 두 값. 실제 브랜드 id 와 겹치지 않게 앞에 @ 를 붙였다. */
export const ANY_BRAND = "";
export const NO_BRAND = "@none";

/**
 * 프로젝트성 목표. 월 지표가 '숫자로 끝나는 것' 이라면 여기는 '언젠가 끝나는 것' 이다.
 * 진행률은 연결된 업무에서 세고, 상태는 사람이 직접 돌린다 —
 * 업무가 아직 안 쪼개진 프로젝트도 진행 중일 수 있기 때문.
 */
export default function ProjectPanel({
  projects,
  tasks,
  today,
  readOnly,
  filter,
  brandFilter,
  onFilter,
  onBrandFilter,
  onPatch,
  onCycle,
  onAdd,
  onRemove,
}: {
  projects: Project[];
  tasks: Task[];
  today: string;
  readOnly: boolean;
  filter: string;
  brandFilter: string;
  onFilter: (projectId: string) => void;
  onBrandFilter: (brand: string) => void;
  onPatch: (id: string, patch: Partial<Project>) => void;
  onCycle: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const shown = projects.filter((p) => {
    if (brandFilter === ANY_BRAND) return true;
    if (brandFilter === NO_BRAND) return p.brands.length === 0;
    return p.brands.includes(brandFilter);
  });

  return (
    <section className="sec">
      <div className="sechead">
        <h2>프로젝트</h2>
        {/* 업무 섹션의 담당자 드롭다운과 같은 자리·같은 모양이다. */}
        <select
          className="sel headsel"
          data-on={brandFilter === ANY_BRAND ? "0" : "1"}
          value={brandFilter}
          onChange={(e) => onBrandFilter(e.currentTarget.value)}
          aria-label="브랜드로 좁혀 보기"
        >
          <option value={ANY_BRAND}>브랜드 전체</option>
          {BRANDS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
          <option value={NO_BRAND}>태그 없음</option>
        </select>
        <span className="rule" />
        <button type="button" className="ghost sm" disabled={readOnly} onClick={onAdd}>
          ＋ 프로젝트
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="empty">
          <p>아직 프로젝트가 없습니다. 이번 분기에 끝내야 할 덩어리를 하나 올려 보세요.</p>
          <div className="emptybtns">
            <button type="button" className="ghost" disabled={readOnly} onClick={onAdd}>
              ＋ 프로젝트
            </button>
          </div>
        </div>
      ) : shown.length === 0 ? (
        <p className="norow card">이 브랜드로 태그된 프로젝트가 없습니다.</p>
      ) : (
        <div className="card plist">
          {shown.map((p) => {
            const mine = tasks.filter((t) => t.project === p.id);
            const t = tally(mine, today);
            const pct = t.total ? t.done / t.total : 0;
            const late = isLate(p.due, p.status, today);

            return (
              <div className={"prow" + (filter === p.id ? " picked" : "")} key={p.id}>
                <button
                  type="button"
                  className={`chip s${p.status}`}
                  disabled={readOnly}
                  onClick={() => onCycle(p.id)}
                  title="누르면 상태가 바뀝니다"
                  aria-label={`${p.name} — ${STATUS_LABEL[p.status]}`}
                >
                  {STATUS_LABEL[p.status]}
                </button>

                <div className="pmain">
                  <TextField
                    className="field pname"
                    value={p.name}
                    readOnly={readOnly}
                    onCommit={(v) => onPatch(p.id, { name: v || "이름 없는 프로젝트" })}
                    placeholder="프로젝트 이름"
                    ariaLabel="프로젝트 이름"
                  />
                  <TextField
                    className="field pgoal"
                    value={p.goal}
                    readOnly={readOnly}
                    onCommit={(v) => onPatch(p.id, { goal: v })}
                    placeholder="무엇을 어디까지 하면 끝인지 한 줄로"
                    ariaLabel="프로젝트 목표"
                  />
                </div>

                {/* 업무 표의 브랜드 칩과 같은 규칙 — 여러 개 켜도 되고 안 켜도 된다. */}
                <div className="bchips">
                  {BRANDS.map((b) => {
                    const on = p.brands.includes(b.id);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        className={"bchip" + (on ? " on" : "")}
                        data-b={b.id}
                        disabled={readOnly}
                        aria-pressed={on}
                        onClick={() => onPatch(p.id, { brands: toggleBrand(p.brands, b.id) })}
                        title={`${b.name} ${on ? "빼기" : "넣기"}`}
                      >
                        {b.name}
                      </button>
                    );
                  })}
                </div>

                <input
                  type="date"
                  className={"dt" + (p.due ? " has" : "") + (late ? " late" : "")}
                  value={p.due}
                  disabled={readOnly}
                  onChange={(e) => onPatch(p.id, { due: e.currentTarget.value })}
                  aria-label={`${p.name} 기한`}
                />

                <button
                  type="button"
                  className="pprog"
                  onClick={() => onFilter(filter === p.id ? "" : p.id)}
                  title={t.total ? "이 프로젝트 업무만 아래 표에 보기" : "아래 표에서 이 프로젝트로 업무를 추가하세요"}
                >
                  <span className="bar sm">
                    <i className="fill" style={{ width: `${pct * 100}%` }} />
                  </span>
                  <span className="pcount">
                    {t.done}/{t.total}
                    {t.late ? <b className="lateflag"> 지연 {t.late}</b> : null}
                  </span>
                </button>

                <button
                  type="button"
                  className="x"
                  disabled={readOnly}
                  onClick={() => {
                    if (mine.length && !window.confirm(`"${p.name}" 을 지웁니다. 연결된 업무 ${mine.length}건은 '상시' 로 남습니다.`)) return;
                    if (!mine.length && !window.confirm(`"${p.name}" 을 지웁니다.`)) return;
                    onRemove(p.id);
                  }}
                  aria-label={`${p.name} 삭제`}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
