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
 * Vercel 이 통합에 따라 다른 이름으로 넣어 주므로 둘 다 본다.
 */
function redisEnv() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

/** 로컬에선 파일 하나로 버틴다. 배포본에서는 절대 쓰지 않는다 — 요청마다 사라지기 때문. */
const FILE = path.join(process.cwd(), ".data", "board.json");

export function storeKind(): "redis" | "file" {
  return redisEnv() ? "redis" : "file";
}

export function assertStoreReady() {
  if (redisEnv()) return;
  if (process.env.NODE_ENV === "production") {
    throw new StoreConfigError(
      "저장소가 연결되지 않았습니다. Vercel → Storage 에서 Redis 를 붙이면 " +
        "KV_REST_API_URL 과 KV_REST_API_TOKEN 이 자동으로 들어옵니다.",
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
