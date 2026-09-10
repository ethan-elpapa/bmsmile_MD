"use client";

import { NumberField, TextField } from "./fields";
import {
  BRANDS,
  CHANNELS,
  type Feed,
  MARKETS,
  type Metric,
  type Month,
  monthLabel,
  type Unit,
  UNIT_LABEL,
  UNITS,
} from "@/lib/types";
import { actualOf, fmt, fmtInput, isLive, monthPace, rate, shortDate } from "@/lib/util";

/**
 * 달성률을 어떤 색으로 읽을지. 이번 달이면 '지금쯤 와 있어야 할 자리(pace)' 와 견준다 —
 * 9월 3일에 10% 는 정상이고 9월 28일에 10% 는 아니다.
 * 지난달은 100% 를 채웠는지만 보고, 다음 달은 아직 아무 말도 하지 않는다.
 */
type Phase = "past" | "now" | "future";

type Tone = "none" | "ok" | "on" | "go" | "stop";

function tone(r: number | null, pace: number | null, phase: Phase, lower: boolean): Tone {
  if (r === null) return "none";

  /*
   * 광고비처럼 적을수록 좋은 지표는 반대로 읽는다. 100% 는 '달성' 이 아니라 '예산 다 씀' 이고,
   * 이 시점 기대치보다 빨리 쓰고 있으면 그때 주황이 뜬다.
   */
  if (lower) {
    if (r > 1) return "stop";
    if (phase === "future") return "on";
    if (phase === "past") return "ok";
    if (pace === null) return "on";
    return r > pace + 0.1 ? "go" : "on";
  }

  if (r >= 1) return "ok";
  // 아직 시작도 안 한 달을 빨갛게 칠하면 안 된다. 다음 달 0% 는 정상이다.
  if (phase === "future") return "on";
  // 끝난 달에는 견줄 자리가 없다. 100% 를 못 채웠으면 얼마나 가까웠는지만 본다.
  if (pace === null) return r >= 0.9 ? "go" : "stop";
  if (r >= pace) return "on";
  return r >= pace - 0.1 ? "go" : "stop";
}

export default function MonthPanel({
  monthId,
  month,
  monthIds,
  feed,
  feedLinked,
  brand,
  market,
  today,
  readOnly,
  editing,
  onToggleEdit,
  onPick,
  onStep,
  onPatch,
  onAdd,
  onRemove,
  onCreate,
  onPickBrand,
  onPickMarket,
  onSeedCell,
  hasPrev,
}: {
  monthId: string;
  month: Month | undefined;
  monthIds: string[];
  feed: Feed;
  /** 시트가 붙어 있는 "us.mumuki" 들 */
  feedLinked: string[];
  brand: string;
  market: string;
  today: string;
  readOnly: boolean;
  editing: boolean;
  onToggleEdit: () => void;
  onPick: (id: string) => void;
  onStep: (n: number) => void;
  onPatch: (metricId: string, patch: Partial<Metric>) => void;
  onAdd: (group: string) => void;
  onRemove: (metricId: string) => void;
  onCreate: (carry: boolean) => void;
  onPickBrand: (id: string) => void;
  onPickMarket: (id: string) => void;
  /** 이 브랜드 × 마켓 칸에 지표를 처음 깔 때 */
  onSeedCell: () => void;
  hasPrev: boolean;
}) {
  const pace = monthPace(monthId, today);
  const thisMonth = today.slice(0, 7);
  // 오늘을 아직 모르는 동안(마운트 전)에는 지난달로 보지 않는다 — 빨간 칸이 깜빡였다 사라진다.
  const phase: Phase = !today || monthId === thisMonth ? "now" : monthId > thisMonth ? "future" : "past";

  const marketName = (id: string) => MARKETS.find((m) => m.id === id)?.name ?? id;
  const brandName = (id: string) => BRANDS.find((b) => b.id === id)?.name ?? id;

  /**
   * 목표가 비율로 걸린 지표(광고비의 TACoS)는 기준 지표의 **실적**이 있어야 허용액이 나온다.
   * 같은 줄 안에서 `src` 끝토막으로 찾는다 — 이름은 사람이 고칠 수 있어서 기준으로 못 쓴다.
   */
  const basisActualOf = (m: Metric, row: Metric[]): number | null => {
    if (!m.basisKey) return null;
    const base = row.find((x) => x.src.endsWith(`.${m.basisKey}`));
    return base ? actualOf(base, feed) : null;
  };
  // 이 화면에 그릴 것: 고른 브랜드 × 고른 마켓 안의 지표들.
  const cell = month ? month.metrics.filter((m) => m.brand === brand && m.market === market) : [];

  return (
    <section className="sec">
      <div className="sechead">
        <h2>월 목표</h2>
        <div className="monthnav">
          <button type="button" className="mstep" onClick={() => onStep(-1)} aria-label="이전 달">
            ‹
          </button>
          <select
            className="msel"
            value={monthId}
            onChange={(e) => onPick(e.currentTarget.value)}
            aria-label="월 선택"
          >
            {/* 저장된 달 + 지금 보고 있는 달. 아직 안 만든 달을 골라도 목록에서 사라지지 않는다. */}
            {Array.from(new Set([...monthIds, monthId]))
              .sort()
              .reverse()
              .map((id) => (
                <option key={id} value={id}>
                  {monthLabel(id)}
                </option>
              ))}
          </select>
          <button type="button" className="mstep" onClick={() => onStep(1)} aria-label="다음 달">
            ›
          </button>
          {today && monthId !== thisMonth ? (
            <button type="button" className="ghost sm" onClick={() => onPick(thisMonth)}>
              이번 달
            </button>
          ) : null}
        </div>
        <span className="rule" />
        {month ? (
          <button
            type="button"
            className={"ghost sm" + (editing ? " on" : "")}
            disabled={readOnly}
            onClick={onToggleEdit}
            title={readOnly ? "편집 잠금을 먼저 해제하세요" : "지표 이름·단위를 고치거나 줄을 늘린다"}
          >
            {editing ? "편집 완료" : "지표 편집"}
          </button>
        ) : null}
      </div>

      {/*
        탭 2단 — 브랜드를 고르고 그 안에서 마켓을 고른다. 줄은 채널(아마존 · 자사몰)이다.
        브랜드·마켓·채널 셋 다 `lib/types.ts` 의 배열에 한 줄 넣으면 늘어난다.
      */}
      <nav className="mtabs" role="tablist" aria-label="브랜드">
        {BRANDS.map((b) => (
          <button
            key={b.id}
            type="button"
            role="tab"
            data-b={b.id}
            aria-selected={brand === b.id}
            onClick={() => onPickBrand(b.id)}
          >
            {b.name}
          </button>
        ))}
      </nav>

      <nav className="mtabs sub" role="tablist" aria-label="마켓">
        {MARKETS.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={market === m.id}
            title={m.name}
            onClick={() => onPickMarket(m.id)}
          >
            {m.code}
          </button>
        ))}
        <span className="soon">캐나다 · 호주는 여는 시점에 탭이 추가됩니다</span>
      </nav>

      {!month ? (
        <div className="empty">
          <p>
            <b>{monthLabel(monthId)}</b> 목표가 아직 없습니다.
          </p>
          <div className="emptybtns">
            {hasPrev ? (
              <button type="button" className="ghost" disabled={readOnly} onClick={() => onCreate(true)}>
                지난달 목표 구성 가져오기
              </button>
            ) : null}
            <button type="button" className="ghost" disabled={readOnly} onClick={() => onCreate(false)}>
              기본 지표로 시작하기
            </button>
          </div>
          <p className="hint">
            가져오기는 <b>지표 이름과 목표만</b> 옮깁니다. 실적은 빈 칸으로 시작합니다.
          </p>
        </div>
      ) : cell.length === 0 ? (
        <div className="empty">
          <p>
            <b>
              {brandName(brand)} · {marketName(market)}
            </b>{" "}
            지표가 이 달에 아직 없습니다.
          </p>
          <div className="emptybtns">
            <button type="button" className="ghost" disabled={readOnly} onClick={onSeedCell}>
              기본 지표 만들기
            </button>
            {CHANNELS.map((c) => (
              <button
                key={c.id}
                type="button"
                className="ghost"
                disabled={readOnly}
                onClick={() => onAdd(c.id)}
              >
                ＋ {c.name} 지표 하나
              </button>
            ))}
          </div>
          <p className="hint">
            기본 지표는 채널마다 <b>총매출 · 총 ROAS · 내부 광고비 · 외부 광고비</b> 네 칸입니다.
          </p>
        </div>
      ) : (
        /*
         * 채널마다 한 줄. 두 줄이 같은 지표를 같은 순서로 들고 있어서 아마존과 자사몰을
         * 위아래로 바로 견줄 수 있다.
         */
        <div className="mrows">
          {CHANNELS.map((c) => {
            const mine = cell.filter((m) => m.channel === c.id);
            if (mine.length === 0) return null;
            const key = `${market}.${brand}.${c.id}`;
            return (
              <div className="mrow" key={c.id} data-ch={c.id}>
                <div className="mrowlabel">
                  <span className="name">
                    <span className="dot" />
                    {c.name}
                  </span>
                  <SheetNote feedKey={key} feed={feed} linked={feedLinked.includes(key)} />
                </div>
                <div className="mgrid">
                  {mine.map((m) => (
                    <MetricCard
                      key={m.id}
                      metric={m}
                      feed={feed}
                      basisActual={basisActualOf(m, mine)}
                      pace={pace}
                      phase={phase}
                      readOnly={readOnly}
                      editing={editing}
                      onPatch={(patch) => onPatch(m.id, patch)}
                      onRemove={() => onRemove(m.id)}
                    />
                  ))}
                  {editing ? (
                    <button type="button" className="addcard" onClick={() => onAdd(c.id)}>
                      ＋ 지표
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * 브랜드 이름 밑 한 줄. 이 줄의 숫자가 어디서 왔는지 말한다 —
 * 시트가 하루 이틀 늦게 채워지기 때문에 "언제까지 반영된 값인지" 가 특히 중요하다.
 */
function SheetNote({ feedKey, feed, linked }: { feedKey: string; feed: Feed; linked: boolean }) {
  // 시트가 안 붙은 줄에는 할 말이 없다.
  if (!linked) return null;

  const why = feed.failed[feedKey];
  if (why) {
    return (
      <span className="fed bad" title={why}>
        시트 못 읽음
      </span>
    );
  }

  const through = feed.through[feedKey];
  if (!through) return <span className="fed none">시트에 이 달 값 없음</span>;

  return <span className="fed">시트 {shortDate(through)}까지</span>;
}

function MetricCard({
  metric,
  feed,
  basisActual,
  pace,
  phase,
  readOnly,
  editing,
  onPatch,
  onRemove,
}: {
  metric: Metric;
  feed: Feed;
  /** 목표가 비율로 걸린 지표라면 그 기준(예: 매출) 의 실적. 없으면 null. */
  basisActual: number | null;
  pace: number | null;
  phase: Phase;
  readOnly: boolean;
  editing: boolean;
  onPatch: (patch: Partial<Metric>) => void;
  onRemove: () => void;
}) {
  /*
   * 페이스는 **쌓이는 숫자에만** 의미가 있다. 매출·광고비는 한 달 동안 더해지지만
   * ROAS·마진율은 그렇지 않다 — 9월 4일의 ROAS 3.1 은 '13% 밖에 못 왔다' 가 아니라
   * 지금 시점의 값 그 자체다. 그래서 비율 지표에서는 눈금도 기대치도 걷어낸다.
   */
  const cumulative = metric.unit === "usd" || metric.unit === "cnt";
  const p = cumulative ? pace : null;

  /*
   * 시트에 연결된 지표는 시트 값이 이긴다. 그 달 값이 시트에 없으면 저장된 값으로 물러나고
   * 칸도 다시 열린다 — 연결됐다는 이유로 아무도 못 고치는 빈 칸이 남으면 안 된다.
   */
  const live = isLive(metric, feed);
  const actual = actualOf(metric, feed);

  /*
   * 기준이 걸린 지표는 **목표를 받지 않는다.** 광고비를 매출로 나눈 TACoS 를 보여 주기만 한다 —
   * 넣을 게 없으니 목표 칸도, 막대도, 푸터도 없앤다. 색도 매기지 않는다(판단할 기준이 없다).
   */
  const ratioOnly = Boolean(metric.basisKey);
  /** 기준 대비 몇 % 인지. 기준(매출)이 아직 0 이면 계산할 수 없다. */
  const actualRatio = ratioOnly && basisActual ? (actual / basisActual) * 100 : null;

  // 금액으로 거는 예산인지(광고비) 비율 지표인지(ACoS) — 푸터 말투가 갈린다.
  const budgetLike = metric.lower && metric.unit === "usd";

  const r = ratioOnly ? null : rate(actual, metric.target);
  const t = ratioOnly ? "none" : tone(r, p, phase, metric.lower);
  const gap = metric.target - actual;

  return (
    <div className="mcard" data-t={t}>
      <div className="mtop">
        {editing ? (
          <>
            <TextField
              className="field mname"
              value={metric.name}
              onCommit={(v) => onPatch({ name: v || "이름 없는 지표" })}
              placeholder="지표 이름"
              ariaLabel="지표 이름"
            />
            <select
              className="usel"
              value={metric.unit}
              onChange={(e) => onPatch({ unit: e.currentTarget.value as Unit })}
              aria-label="단위"
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABEL[u]}
                </option>
              ))}
            </select>
            {/* 광고비인지 매출인지에 따라 색이 반대로 간다. 그 결정을 여기서 뒤집는다. */}
            <button
              type="button"
              className={"dirbtn" + (metric.lower ? " down" : "")}
              onClick={() => onPatch({ lower: !metric.lower })}
              title={metric.lower ? "적을수록 좋은 지표 (예산)" : "많을수록 좋은 지표 (목표)"}
              aria-label={`${metric.name} — ${metric.lower ? "적을수록 좋음" : "많을수록 좋음"}`}
            >
              {metric.lower ? "↓" : "↑"}
            </button>
            <button type="button" className="x" onClick={onRemove} aria-label={`${metric.name} 지표 삭제`}>
              ×
            </button>
          </>
        ) : (
          <>
            <span className="mname ro">{metric.name}</span>
            {/* 비율만 보여 주는 칸은 오른쪽 위를 비운다 — 숫자를 값 옆에 붙여 읽는다. */}
            {ratioOnly ? null : (
              <span
                className="mrate"
                title={metric.lower ? "예산 소진율 — 적을수록 좋은 지표" : "목표 달성률"}
              >
                {metric.lower ? <i className="down">↓</i> : null}
                {r === null ? "—" : `${Math.round(r * 100)}%`}
              </span>
            )}
          </>
        )}
      </div>

      <div className="mnums">
        {/*
          값과 단위를 한 덩어리로 묶는다. 이 덩어리가 어느 카드에서나 같은 폭을 차지해서
          가운데 `/` 와 오른쪽 숫자가 카드마다 같은 자리에 선다 — 줄을 눈으로 훑을 때 이게 중요하다.
        */}
        <span className="valwrap">
          {live ? (
            // 시트가 주는 값이라 고칠 칸이 아니다. 입력처럼 보이면 눌러 보고 안 고쳐진다고 여긴다.
            <span className="num big fromsheet" title="시트에서 온 값입니다">
              {fmtInput(actual, metric.unit) || "0"}
            </span>
          ) : (
            <NumberField
              className="num big"
              value={metric.actual}
              unit={metric.unit}
              readOnly={readOnly}
              onCommit={(v) => onPatch({ actual: v })}
              ariaLabel={`${metric.name} 실적`}
              placeholder="실적"
            />
          )}
          {/* 비율 칸은 단위가 값에 붙는다 — `2,508 USD / TACoS 10.1%` */}
          {ratioOnly ? <span className="unit">{UNIT_LABEL[metric.unit]}</span> : null}
        </span>

        <span className="slash">/</span>

        {ratioOnly ? (
          <span className="ratioval" title={`${metric.basisName} — 시트 숫자로 계산됩니다`}>
            <i className="tag">{metric.basisName}</i>
            {actualRatio === null ? "—" : `${Math.round(actualRatio * 10) / 10}%`}
          </span>
        ) : (
          <span className="tgtwrap">
            <NumberField
              className="num tgt"
              value={metric.target}
              unit={metric.unit}
              readOnly={readOnly}
              onCommit={(v) => onPatch({ target: v })}
              ariaLabel={`${metric.name} 목표`}
              placeholder="목표"
            />
            <span className="unit">{UNIT_LABEL[metric.unit]}</span>
          </span>
        )}
      </div>
      {/* 목표가 없는 칸에는 채울 막대도 없다. 자리만 비워 둔다. */}
      {ratioOnly ? null : (
        <div className="bar">
          <i className="fill" style={{ width: `${Math.min(r ?? 0, 1) * 100}%` }} />
          {/* 이번 달에만 세우는 눈금. 오늘까지 왔어야 할 자리다. */}
          {p !== null && p < 1 ? <i className="pace" style={{ left: `${p * 100}%` }} /> : null}
        </div>
      )}

      {/* 목표 없는 칸은 푸터도 없다 — 남았다/초과다 할 기준이 없다. */}
      {ratioOnly ? null : (
        <div className="mfoot">
          {r === null ? (
            <span className="muted">
              {budgetLike
                ? "예산을 넣으면 소진율이 보입니다"
                : metric.lower
                  ? "목표를 넣으면 비교가 보입니다"
                  : "목표를 넣으면 달성률이 보입니다"}
            </span>
          ) : gap > 0 ? (
            <span>
              {budgetLike ? "예산 남음" : metric.lower ? "목표까지" : "남은"} {fmt(gap, metric.unit)}
              {!budgetLike && metric.lower ? " 여유" : ""}
            </span>
          ) : (
            <span className={metric.lower ? "under" : "over"}>
              {budgetLike ? "예산 초과" : "목표 초과"} {fmt(-gap, metric.unit)}
            </span>
          )}
          {p !== null && r !== null ? (
            <span className="muted">이 시점 기대 {Math.round(p * 100)}%</span>
          ) : null}
        </div>
      )}
    </div>
  );
}
