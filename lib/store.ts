import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { normalize, seed } from "./seed";
import type { BoardState } from "./types";

export class StoreConfigError extends Error {}

// ?? 를 쓰면 빈 문자열이 그대로 통과해 키 이름이 없어진다. 환경변수는 비워 두기 쉬우니 || 로 받는다.
const KEY = process.env.BOARD_KEY_NAME || "kpi-board";

/**
 * Upstash Redis 는 REST 로 부른다. 패키지를 하나도 안 붙이려고 fetch 를 그대로 쓴다.
 *
 * **이름을 하나로 고정하지 않는다.** Vercel 의 Storage 통합은 붙일 때 고른 접두어에 따라
 * `KV_REST_API_URL` · `UPSTASH_REDIS_REST_URL` · `STORAGE_REST_API_URL` 처럼 다른 이름을 넣는데,
 * 어느 이름이 들어왔는지는 화면에서 확인하기 어렵다(Secret 으로 저장되면 값도 못 본다).
 * 그래서 흔한 이름을 먼저 보고, 없으면 **upstash REST 주소처럼 생긴 값을 직접 찾는다.**
 */
const PAIRS = [
  ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
  ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
  ["STORAGE_REST_API_URL", "STORAGE_REST_API_TOKEN"],
  ["STORAGE_URL", "STORAGE_TOKEN"],
  ["REDIS_REST_API_URL", "REDIS_REST_API_TOKEN"],
] as const;

const isRestUrl = (v: string | undefined) => Boolean(v && /^https:\/\/[^/]*upstash\.io/.test(v));

function redisEnv() {
  const env = process.env;

  for (const [u, t] of PAIRS) {
    if (env[u] && env[t]) return { url: env[u]!.replace(/\/$/, ""), token: env[t]!, from: u };
  }

  /*
   * 마지막 그물. 이름이 무엇이든 값이 `https://….upstash.io` 면 그게 REST 주소다.
   * 토큰은 같은 접두어에서 찾는다(`X_URL` → `X_TOKEN` 또는 `X_REST_API_TOKEN`).
   */
  for (const [key, val] of Object.entries(env)) {
    if (!isRestUrl(val)) continue;
    const stem = key.replace(/(REST_API_)?URL$/, "");
    const token = env[`${stem}TOKEN`] || env[`${stem}REST_API_TOKEN`];
    if (token) return { url: val!.replace(/\/$/, ""), token, from: key };
  }

  return null;
}

/**
 * 저장소 관련으로 **들어와 있는 환경변수 이름들**. 값은 절대 내보내지 않는다 —
 * 이름만 보여도 "무슨 이름으로 들어왔는지" 를 화면에서 바로 알 수 있다.
 */
export function storeEnvNames(): string[] {
  return Object.keys(process.env)
    .filter((k) => /^(KV|UPSTASH|STORAGE|REDIS)_/.test(k))
    .sort();
}

/** 로컬에선 파일 하나로 버틴다. 배포본에서는 절대 쓰지 않는다 — 요청마다 사라지기 때문. */
const FILE = path.join(process.cwd(), ".data", "board.json");

export function storeKind(): "redis" | "file" {
  return redisEnv() ? "redis" : "file";
}

export function assertStoreReady() {
  if (redisEnv()) return;
  if (process.env.NODE_ENV === "production") {
    // 들어와 있는 이름을 같이 알려 준다 — 이게 없으면 무엇이 빠졌는지 화면에서 알 수 없다.
    const got = storeEnvNames();
    throw new StoreConfigError(
      "저장소가 연결되지 않았습니다. Vercel → Storage 에서 Redis 를 붙이면 주소와 토큰이 " +
        "환경변수로 들어옵니다. " +
        (got.length
          ? `지금 들어와 있는 이름: ${got.join(", ")} — 이 중 REST 주소(https://….upstash.io)와 토큰 한 쌍이 있어야 합니다.`
          : "지금은 저장소 관련 환경변수가 하나도 안 들어와 있습니다."),
    );
  }
}

async function redisGet(): Promise<unknown> {
  const env = redisEnv()!;
  const res = await fetch(`${env.url}/get/${encodeURIComponent(KEY)}`, {
    headers: { Authorization: `Bearer ${env.token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Redis GET 실패 (${res.status})`);
  const body = (await res.json()) as { result: string | null };
  if (body.result == null) return null;
  try {
    return JSON.parse(body.result);
  } catch {
    return null;
  }
}

async function redisSet(state: BoardState): Promise<void> {
  const env = redisEnv()!;
  const res = await fetch(`${env.url}/set/${encodeURIComponent(KEY)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.token}`, "Content-Type": "text/plain" },
    body: JSON.stringify(state),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Redis SET 실패 (${res.status})`);
}

async function fileGet(): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch {
    return null;
  }
}

async function fileSet(state: BoardState): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(state, null, 2), "utf8");
}

export async function readBoard(): Promise<BoardState> {
  assertStoreReady();
  const raw = redisEnv() ? await redisGet() : await fileGet();
  return raw ? normalize(raw) : seed();
}

export async function writeBoard(state: BoardState): Promise<void> {
  assertStoreReady();
  if (redisEnv()) await redisSet(state);
  else await fileSet(state);
}
