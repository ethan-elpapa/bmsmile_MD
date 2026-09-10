"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fmtInput, parseNum } from "@/lib/util";
import type { Unit } from "@/lib/types";

/**
 * 글자를 칠 때마다 위로 올려 보내면 다른 사람의 갱신이 끼어들 때 커서가 튄다.
 * 그래서 화면 안에서 draft 로 들고 있되, 손을 멈추면(0.8초) 올려 보낸다 —
 * blur 만 믿으면 치다가 탭을 닫은 사람의 글이 사라진다. 확장 진행판과 같은 규칙.
 */
function useDraft<T>(
  value: T,
  toText: (v: T) => string,
  fromText: (s: string) => T,
  onCommit: (v: T) => void,
) {
  const [draft, setDraft] = useState(() => toText(value));
  const focused = useRef(false);
  // 최신 값을 타이머 안에서 봐야 한다. 의존성에 넣으면 칠 때마다 타이머가 새로 선다.
  const latest = useRef({ value, onCommit, fromText });
  latest.current = { value, onCommit, fromText };

  // 내가 안 보고 있을 때 남이 바꿨으면 그 값으로 맞춘다.
  useEffect(() => {
    if (!focused.current) setDraft(toText(value));
  }, [value, toText]);

  useEffect(() => {
    const next = latest.current.fromText(draft);
    if (next === latest.current.value) return;
    const id = setTimeout(() => latest.current.onCommit(next), 800);
    return () => clearTimeout(id);
  }, [draft]);

  const onFocus = () => {
    focused.current = true;
  };
  const onBlur = () => {
    focused.current = false;
    const next = latest.current.fromText(draft);
    if (next !== latest.current.value) latest.current.onCommit(next);
    setDraft(toText(next));
  };

  return { draft, setDraft, onFocus, onBlur };
}

const tidy = (s: string) => s.replace(/[ \t]+/g, " ").trim();
const asIs = (s: string) => s;

export function TextField({
  value,
  onCommit,
  placeholder,
  readOnly,
  className,
  ariaLabel,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const { draft, setDraft, onFocus, onBlur } = useDraft(value, asIs, tidy, onCommit);
  return (
    <input
      className={className ?? "field"}
      value={draft}
      readOnly={readOnly}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onFocus={onFocus}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

/** 줄이 늘면 칸도 같이 늘어난다. 메모는 한 줄로 끝나지 않는 경우가 많다. */
export function NoteField({
  value,
  onCommit,
  placeholder,
  readOnly,
  ariaLabel,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  ariaLabel?: string;
}) {
  const { draft, setDraft, onFocus, onBlur } = useDraft(
    value,
    asIs,
    (s) => s.replace(/[ \t]+/g, " ").replace(/[ \t]*\n[ \t]*/g, "\n").trim(),
    onCommit,
  );
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  return (
    <textarea
      ref={ref}
      className="field note"
      rows={1}
      value={draft}
      readOnly={readOnly}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onFocus={onFocus}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/**
 * 숫자 칸. 보고 있을 때는 천 단위가 들어간 모양으로, 고칠 때는 친 그대로 둔다.
 * 0 은 빈 칸으로 보여 준다 — 목표를 아직 안 세운 것과 0 으로 세운 것은 화면에서 같다.
 */
export function NumberField({
  value,
  unit,
  onCommit,
  readOnly,
  ariaLabel,
  className,
  placeholder,
}: {
  value: number;
  unit: Unit;
  onCommit: (v: number) => void;
  readOnly?: boolean;
  ariaLabel?: string;
  className?: string;
  placeholder?: string;
}) {
  // 단위가 바뀌면 보여 주는 모양도 따라 바뀌어야 한다. 그래서 unit 이 의존성이다.
  const toText = useCallback((v: number) => fmtInput(v, unit), [unit]);
  const { draft, setDraft, onFocus, onBlur } = useDraft(value, toText, parseNum, onCommit);
  return (
    <input
      className={className ?? "num"}
      inputMode="decimal"
      value={draft}
      readOnly={readOnly}
      placeholder={placeholder ?? "0"}
      aria-label={ariaLabel}
      onFocus={onFocus}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}
