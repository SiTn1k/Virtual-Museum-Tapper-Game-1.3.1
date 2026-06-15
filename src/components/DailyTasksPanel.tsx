import { Flame, CheckCircle2, Circle, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { DailyTasksState } from '../types/game';
import { TASK_POOL, isTaskComplete, type TaskDef } from '../data/tasks';
import { formatNumber } from '../lib/utils';
import { hapticNotification } from '../lib/telegram';

interface DailyTasksPanelProps {
  dailyStreak: number;
  bestStreak: number;
  dailyTasksState: DailyTasksState | null;
  currencyIcon: string;
  onClaimTask: (taskId: string) => void;
}

const TASK_MAP: Record<string, TaskDef> = {};
for (const t of TASK_POOL) TASK_MAP[t.id] = t;

export function DailyTasksPanel({
  dailyStreak,
  bestStreak,
  dailyTasksState,
  currencyIcon,
  onClaimTask,
}: DailyTasksPanelProps) {
  const [expanded, setExpanded] = useState(true);

  const tasks = dailyTasksState
    ? dailyTasksState.taskIds.map(id => TASK_MAP[id]).filter(Boolean)
    : [];

  const completedCount = tasks.filter(
    t => dailyTasksState && isTaskComplete(t, dailyTasksState.counters) && dailyTasksState.claimed.includes(t.id)
  ).length;

  const hasUnclaimed = tasks.some(
    t => dailyTasksState && isTaskComplete(t, dailyTasksState.counters) && !dailyTasksState.claimed.includes(t.id)
  );

  return (
    <div className="mx-3 mt-3 mb-1 rounded-2xl overflow-hidden border border-amber-500/20 bg-gray-900">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-500/10 to-transparent"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2.5">
          <Flame className="w-4 h-4 text-amber-400" />
          <span className="font-semibold text-sm text-white">Щоденні завдання</span>
          {hasUnclaimed && (
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-amber-400 text-sm font-bold">{completedCount}/{tasks.length}</span>
            {dailyStreak > 0 && (
              <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-medium">
                🔥 {dailyStreak}
              </span>
            )}
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {/* Task list */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 pt-1">
          {tasks.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-2">Завдання завантажуються...</p>
          ) : (
            tasks.map(task => {
              if (!dailyTasksState) return null;
              const counter = dailyTasksState.counters[task.type] || 0;
              const complete = isTaskComplete(task, dailyTasksState.counters);
              const claimed = dailyTasksState.claimed.includes(task.id);
              const progress = Math.min(counter / task.target, 1);

              return (
                <div
                  key={task.id}
                  className={`rounded-xl p-3 transition-all ${
                    claimed
                      ? 'bg-green-900/20 border border-green-500/20 opacity-60'
                      : complete
                      ? 'bg-amber-500/10 border border-amber-500/40'
                      : 'bg-gray-800/60 border border-gray-700/40'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Icon */}
                    <div className="text-xl w-8 text-center shrink-0">{task.icon}</div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className={`text-sm font-medium leading-tight ${claimed ? 'line-through text-gray-500' : 'text-white'}`}>
                          {task.description}
                        </span>
                        <span className="text-xs text-gray-400 shrink-0">
                          {Math.min(counter, task.target)}/{task.target}
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div className="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${complete ? 'bg-amber-400' : 'bg-blue-500'}`}
                          style={{ width: `${progress * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Claim / Status */}
                    <div className="shrink-0 ml-1">
                      {claimed ? (
                        <CheckCircle2 className="w-6 h-6 text-green-500" />
                      ) : complete ? (
                        <button
                          onClick={() => {
                            hapticNotification('success');
                            onClaimTask(task.id);
                          }}
                          className="px-2.5 py-1 bg-amber-400 text-black font-bold text-xs rounded-lg hover:bg-amber-300 active:scale-95 transition-all"
                        >
                          +{task.reward.currency
                            ? `${formatNumber(task.reward.currency)} ${currencyIcon}`
                            : `${formatNumber(task.reward.xp || 0)} XP`}
                        </button>
                      ) : (
                        <Circle className="w-5 h-5 text-gray-600" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* Best streak footer */}
          {bestStreak > 0 && (
            <div className="text-center pt-1">
              <span className="text-xs text-gray-600">Рекорд: 🔥 {bestStreak} {daysWord(bestStreak)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function daysWord(n: number): string {
  if (n === 1) return 'день';
  if (n >= 2 && n <= 4) return 'дні';
  return 'днів';
}
