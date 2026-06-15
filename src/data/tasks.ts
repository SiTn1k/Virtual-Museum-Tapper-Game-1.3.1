import type { DailyTasksState, DailyCounters } from '../types/game';

export type TaskType = 'tap' | 'earn_xp' | 'buy_generator' | 'open_gacha' | 'upgrade_tap';

export interface TaskDef {
  id: string;
  type: TaskType;
  description: string;
  target: number;
  reward: { currency?: number; xp?: number };
  icon: string;
}

export const TASK_POOL: TaskDef[] = [
  { id: 'tap_50',        type: 'tap',           description: 'Натисни 50 разів',               target: 50,   reward: { currency: 30  }, icon: '👆' },
  { id: 'tap_200',       type: 'tap',           description: 'Натисни 200 разів',              target: 200,  reward: { currency: 100 }, icon: '👆' },
  { id: 'tap_500',       type: 'tap',           description: 'Натисни 500 разів',              target: 500,  reward: { currency: 220 }, icon: '👆' },
  { id: 'tap_1000',      type: 'tap',           description: 'Натисни 1,000 разів',            target: 1000, reward: { currency: 400 }, icon: '👆' },
  { id: 'xp_500',        type: 'earn_xp',       description: 'Зароби 500 XP тапами',          target: 500,  reward: { currency: 60  }, icon: '⭐' },
  { id: 'xp_2000',       type: 'earn_xp',       description: 'Зароби 2,000 XP тапами',        target: 2000, reward: { currency: 180 }, icon: '⭐' },
  { id: 'xp_8000',       type: 'earn_xp',       description: 'Зароби 8,000 XP тапами',        target: 8000, reward: { currency: 350 }, icon: '⭐' },
  { id: 'gen_1',         type: 'buy_generator', description: 'Купи 1 генератор',               target: 1,    reward: { currency: 80  }, icon: '🏛️' },
  { id: 'gen_3',         type: 'buy_generator', description: 'Купи 3 генератори',              target: 3,    reward: { currency: 200 }, icon: '🏛️' },
  { id: 'gen_5',         type: 'buy_generator', description: 'Купи 5 генераторів',             target: 5,    reward: { currency: 350 }, icon: '🏛️' },
  { id: 'gacha_1',       type: 'open_gacha',    description: 'Відкрий скриню артефактів',     target: 1,    reward: { currency: 100 }, icon: '🎁' },
  { id: 'gacha_3',       type: 'open_gacha',    description: 'Відкрий 3 скрині',              target: 3,    reward: { currency: 280 }, icon: '🎁' },
  { id: 'tap_upgrade_1', type: 'upgrade_tap',   description: 'Покращ силу тапу',              target: 1,    reward: { currency: 120 }, icon: '⚡' },
  { id: 'tap_upgrade_3', type: 'upgrade_tap',   description: 'Покращ силу тапу 3 рази',      target: 3,    reward: { currency: 300 }, icon: '⚡' },
];

const TASK_MAP: Record<string, TaskDef> = {};
for (const t of TASK_POOL) TASK_MAP[t.id] = t;
export function getTaskById(id: string): TaskDef | undefined { return TASK_MAP[id]; }

export function getTodayDateStr(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function getYesterdayDateStr(): string {
  const d = new Date(Date.now() - 86_400_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// Deterministic daily task selection based on date string (same for all players)
export function getDailyTaskIds(dateStr: string): string[] {
  let seed = dateStr.split('').reduce((acc, c) => Math.imul(acc, 31) + c.charCodeAt(0) | 0, 0);
  seed = Math.abs(seed);
  const total = TASK_POOL.length;
  const indices = new Set<number>();
  let s = seed;
  while (indices.size < 3) {
    indices.add(s % total);
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
  }
  return [...indices].map(i => TASK_POOL[i].id);
}

export function makeFreshDailyTasks(dateStr: string): DailyTasksState {
  return {
    date: dateStr,
    taskIds: getDailyTaskIds(dateStr),
    counters: { tap: 0, earn_xp: 0, buy_generator: 0, open_gacha: 0, upgrade_tap: 0 },
    claimed: [],
  };
}

export function isTaskComplete(task: TaskDef, counters: DailyCounters): boolean {
  return counters[task.type] >= task.target;
}

export interface StreakReward {
  currency: number;
  xp: number;
  label: string;
  isWeekly: boolean;
}

export function getStreakReward(streak: number): StreakReward {
  const dayInWeek = ((streak - 1) % 7) + 1;
  const weekNumber = Math.ceil(streak / 7);
  const isWeekly = dayInWeek === 7;
  const base = isWeekly ? 600 : dayInWeek * 60;
  const bonus = (weekNumber - 1) * 75;
  return {
    currency: Math.min(base + bonus, 1500),
    xp: isWeekly ? 800 * weekNumber : streak >= 3 ? 200 : 0,
    label: isWeekly ? `Тиждень ${weekNumber}!` : `День ${streak}`,
    isWeekly,
  };
}
