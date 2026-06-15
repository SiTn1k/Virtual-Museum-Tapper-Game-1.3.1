import { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, EpochId, OwnedGenerator, TapEvent, LeaderboardEntry } from '../types/game';
import {
  EPOCHS,
  ARTIFACTS,
  getEpochById,
  getCurrentEpochByLevel,
  getGeneratorCost,
  getGeneratorProduction,
} from '../data/epochs';
import {
  getTodayDateStr,
  getYesterdayDateStr,
  makeFreshDailyTasks,
  getStreakReward,
  getTaskById,
  type StreakReward,
} from '../data/tasks';
import {
  saveGameState,
  loadGameState,
  getTelegramUserId,
  getLeaderboard,
  getUserRank,
  fetchActiveBoosters,
} from '../lib/storage';
import type { ActiveBoosters } from '../types/game';

const XP_PER_LEVEL_MULTIPLIER = 1.5;
const XP_BASE = 100;
const SAVE_INTERVAL = 5000;
const MAX_LEVEL = 999;
const TAB_ID = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export interface ArtifactMultipliers {
  xp: number;
  currency: number;
  passive: number;
}

export interface BoosterMultipliers {
  xp: number;
  currency: number;
}

export function getBoosterMultipliers(boosters: ActiveBoosters): BoosterMultipliers {
  const now = Date.now();
  let xp = 1;
  let currency = 1;

  if (boosters.xp_boost_end && boosters.xp_boost_end > now) {
    xp = Math.max(xp, boosters.xp_boost_mult ?? 2);
  }
  if (boosters.currency_boost_end && boosters.currency_boost_end > now) {
    currency = Math.max(currency, boosters.currency_boost_mult ?? 2);
  }
  if (boosters.super_boost_end && boosters.super_boost_end > now) {
    const m = boosters.super_boost_mult ?? 3;
    xp = Math.max(xp, m);
    currency = Math.max(currency, m);
  }

  return { xp, currency };
}

function calculateXpToLevel(level: number): number {
  return Math.floor(XP_BASE * Math.pow(XP_PER_LEVEL_MULTIPLIER, level - 1));
}

export function getArtifactMultipliers(completedArtifacts: string[]): ArtifactMultipliers {
  let xp = 1;
  let currency = 1;
  let passive = 1;
  for (const id of completedArtifacts) {
    const art = ARTIFACTS.find(a => a.id === id);
    if (!art) continue;
    if (art.bonus.type === 'xp_multiplier') xp *= art.bonus.value;
    if (art.bonus.type === 'currency_multiplier') currency *= art.bonus.value;
    if (art.bonus.type === 'passive_boost') passive *= art.bonus.value;
  }
  return { xp, currency, passive };
}

const INITIAL_STATE: GameState = {
  epochId: 'trypillia',
  level: 1,
  xp: 0,
  xpToNextLevel: calculateXpToLevel(1),
  totalXp: 0,
  currency: 20,
  totalCurrencyEarned: 20,
  ownedGenerators: [],
  tapPower: 1,
  passiveXpPerSecond: 0,
  unlockedEpochs: ['trypillia'],
  artifactParts: {},
  completedArtifacts: [],
  lastSavedAt: Date.now(),
  referrerId: null,
  referralsCount: 0,
  referralEarnings: 0,
  activeBoosters: {},
  dailyStreak: 0,
  bestStreak: 0,
  lastLoginDate: null,
  dailyTasksState: null,
};

export function useGame() {
  const [isLoading, setIsLoading] = useState(true);
  const [state, setState] = useState<GameState>(INITIAL_STATE);
  const [tapEvents, setTapEvents] = useState<TapEvent[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [offlineGains, setOfflineGains] = useState<{ xp: number; currency: number } | null>(null);
  const [duplicateTab, setDuplicateTab] = useState(false);
  const [streakModal, setStreakModal] = useState<{ streak: number; reward: StreakReward } | null>(null);
  const tickRef = useRef<number | null>(null);
  const saveRef = useRef<number | null>(null);
  const isInitialized = useRef(false);

  // Multiple tab detection
  useEffect(() => {
    const STORAGE_KEY = 'game_active_tab';

    // Claim active tab on mount
    localStorage.setItem(STORAGE_KEY, TAB_ID);

    const checkTab = () => {
      const activeTab = localStorage.getItem(STORAGE_KEY);
      if (activeTab && activeTab !== TAB_ID) {
        setDuplicateTab(true);
      } else {
        // Other tab closed/released — reclaim and clear warning
        localStorage.setItem(STORAGE_KEY, TAB_ID);
        setDuplicateTab(false);
      }
    };

    const interval = setInterval(checkTab, 1000);

    // Listen for storage events from other tabs
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      if (e.newValue && e.newValue !== TAB_ID) {
        setDuplicateTab(true);
      } else {
        setDuplicateTab(false);
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorage);
      if (localStorage.getItem(STORAGE_KEY) === TAB_ID) {
        localStorage.removeItem(STORAGE_KEY);
      }
    };
  }, []);

  // Use the player's selected epoch (state.epochId) if available
  // Fall back to level-based epoch only for new players
  const epoch = getEpochById(state.epochId);

  const calculatePassiveXp = useCallback((owned: OwnedGenerator[], unlockedEpochs: EpochId[]): number => {
    // Sum production from all owned generators across all unlocked epochs
    return owned.reduce((total, og) => {
      // Search for generator in all unlocked epochs
      for (const epochId of unlockedEpochs) {
        const epochData = getEpochById(epochId);
        const generator = epochData.generators.find(g => g.id === og.generatorId);
        if (generator) {
          return total + getGeneratorProduction(generator, og.level);
        }
      }
      return total;
    }, 0);
  }, []);

  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    (async () => {
      const saved = await loadGameState();
      if (saved) {
        const passiveXp = calculatePassiveXp(saved.ownedGenerators, saved.unlockedEpochs);

        // Compute offline gains (storage.ts returns raw values, we apply them here once)
        const offlineMs = Math.max(0, Date.now() - saved.lastSavedAt);
        const offlineSec = Math.min(offlineMs / 1000, 8 * 3600);
        let offlineXp = passiveXp * offlineSec;
        let offlineCurrency = (saved.level * 50) * (offlineSec / 60);

        // ── Daily streak check ────────────────────────────────────────
        const today = getTodayDateStr();
        const yesterday = getYesterdayDateStr();
        let newStreak = saved.dailyStreak || 0;
        let newBestStreak = saved.bestStreak || 0;
        let newLastLoginDate = saved.lastLoginDate;
        let isNewDay = false;

        if (saved.lastLoginDate !== today) {
          isNewDay = true;
          if (!saved.lastLoginDate) {
            // Brand new player
            newStreak = 1;
          } else if (saved.lastLoginDate === yesterday) {
            newStreak = (saved.dailyStreak || 0) + 1;
          } else {
            // Missed at least one day → reset streak
            newStreak = 1;
          }
          newBestStreak = Math.max(newStreak, saved.bestStreak || 0);
          newLastLoginDate = today;

          // Add streak reward to offline gains so it's shown in the same batch
          const reward = getStreakReward(newStreak);
          offlineXp += reward.xp;
          offlineCurrency += reward.currency;
          setStreakModal({ streak: newStreak, reward });
        }

        // ── Daily tasks: refresh if new day ──────────────────────────
        let dailyTasksState = saved.dailyTasksState;
        if (!dailyTasksState || dailyTasksState.date !== today) {
          dailyTasksState = makeFreshDailyTasks(today);
        }

        if (offlineMs > 60_000 && (offlineXp > 100 || offlineCurrency > 10) && !isNewDay) {
          setOfflineGains({ xp: offlineXp, currency: offlineCurrency });
        }

        setState({
          ...saved,
          xp: saved.xp + offlineXp,
          totalXp: saved.totalXp + offlineXp,
          currency: saved.currency + offlineCurrency,
          totalCurrencyEarned: saved.totalCurrencyEarned + offlineCurrency,
          passiveXpPerSecond: passiveXp,
          lastSavedAt: Date.now(),
          dailyStreak: newStreak,
          bestStreak: newBestStreak,
          lastLoginDate: newLastLoginDate,
          dailyTasksState,
        });
      }
      setIsLoading(false);
    })();
  }, [calculatePassiveXp]);

  // Use a stable ref for save so we don't recreate the interval on every state update
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (isLoading) return;

    saveRef.current = window.setInterval(() => {
      saveGameState(stateRef.current);
    }, SAVE_INTERVAL);

    return () => {
      if (saveRef.current) clearInterval(saveRef.current);
      saveGameState(stateRef.current);
    };
  }, [isLoading]);

  useEffect(() => {
    if (isLoading) return;

    tickRef.current = window.setInterval(() => {
      setState(prev => {
        const basePassiveXp = calculatePassiveXp(prev.ownedGenerators, prev.unlockedEpochs);
        const { passive: passMult, currency: artCurrMult } = getArtifactMultipliers(prev.completedArtifacts || []);
        const { xp: boostXpMult, currency: boostCurrMult } = getBoosterMultipliers(prev.activeBoosters || {});
        const effectivePassiveXp = basePassiveXp * passMult * boostXpMult;

        const xpGainThisTick = effectivePassiveXp / 10;
        let xp = prev.xp + xpGainThisTick;
        const newTotalXp = prev.totalXp + xpGainThisTick;

        const currMult = artCurrMult * boostCurrMult;
        let newLevel = prev.level;
        let xpToNext = prev.xpToNextLevel;
        let newCurrency = prev.currency;
        let newTotalCurrency = prev.totalCurrencyEarned;
        // Reuse same array reference if no epoch unlocks happen — avoids cascading re-renders
        let newUnlocked: string[] | null = null;

        while (xp >= xpToNext && newLevel < MAX_LEVEL) {
          xp -= xpToNext;
          newLevel++;
          xpToNext = calculateXpToLevel(newLevel);
          const levelReward = Math.round(newLevel * 50 * currMult);
          newCurrency += levelReward;
          newTotalCurrency += levelReward;

          EPOCHS.forEach(e => {
            if (e.unlockLevel === newLevel && !prev.unlockedEpochs.includes(e.id)) {
              if (!newUnlocked) newUnlocked = [...prev.unlockedEpochs];
              if (!newUnlocked.includes(e.id)) newUnlocked.push(e.id);
            }
          });
        }

        const unlockedEpochs = newUnlocked ?? prev.unlockedEpochs;
        const newEpochUnlocked = newUnlocked !== null;
        const epochId = newEpochUnlocked
          ? getCurrentEpochByLevel(newLevel).id
          : prev.epochId;

        return {
          ...prev,
          xp,
          totalXp: newTotalXp,
          level: newLevel,
          xpToNextLevel: xpToNext,
          epochId,
          passiveXpPerSecond: effectivePassiveXp,
          currency: newCurrency,
          totalCurrencyEarned: newTotalCurrency,
          unlockedEpochs,
        };
      });
    }, 100);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [isLoading, calculatePassiveXp]);

  const tap = useCallback((x: number, y: number) => {
    const eventId = Math.random().toString(36).substr(2, 9);

    setState(prev => {
      const { xp: artXpMult } = getArtifactMultipliers(prev.completedArtifacts || []);
      const { xp: boostXpMult } = getBoosterMultipliers(prev.activeBoosters || {});
      const value = Math.max(1, Math.round(prev.tapPower * artXpMult * boostXpMult));

      setTapEvents(te => [
        ...te.slice(-9),
        { id: eventId, x, y, value, createdAt: Date.now() },
      ]);
      setTimeout(() => {
        setTapEvents(te => te.filter(e => e.id !== eventId));
      }, 1000);

      // Track daily task counters for tap and earn_xp types
      const tasks = prev.dailyTasksState;
      const updatedTasks = tasks
        ? {
            ...tasks,
            counters: {
              ...tasks.counters,
              tap: tasks.counters.tap + 1,
              earn_xp: tasks.counters.earn_xp + value,
            },
          }
        : tasks;

      return {
        ...prev,
        xp: prev.xp + value,
        totalXp: prev.totalXp + value,
        dailyTasksState: updatedTasks,
      };
    });
  }, []);

  const buyGenerator = useCallback((generatorId: string) => {
    const generator = epoch.generators.find(g => g.id === generatorId);
    if (!generator) return false;

    const currentOwned = state.ownedGenerators.find(og => og.generatorId === generatorId);
    const currentLevel = currentOwned?.level || 0;
    const cost = getGeneratorCost(generator, currentLevel);

    if (state.currency < cost) return false;

    setState(prev => {
      const existing = prev.ownedGenerators.find(og => og.generatorId === generatorId);
      const newOwned = existing
        ? prev.ownedGenerators.map(og =>
            og.generatorId === generatorId ? { ...og, level: og.level + 1 } : og
          )
        : [...prev.ownedGenerators, { generatorId, level: 1 }];

      const { passive: passMult } = getArtifactMultipliers(prev.completedArtifacts || []);
      const newPassiveXp = calculatePassiveXp(newOwned, prev.unlockedEpochs) * passMult;

      const tasks = prev.dailyTasksState;
      const updatedTasks = tasks
        ? { ...tasks, counters: { ...tasks.counters, buy_generator: tasks.counters.buy_generator + 1 } }
        : tasks;

      return {
        ...prev,
        currency: prev.currency - cost,
        ownedGenerators: newOwned,
        passiveXpPerSecond: newPassiveXp,
        dailyTasksState: updatedTasks,
      };
    });

    return true;
  }, [epoch.generators, state.currency, state.ownedGenerators, calculatePassiveXp]);

  const upgradeTapPower = useCallback(() => {
    const rawCost = 25 * Math.pow(1.8, state.tapPower - 1);
    // Guard against floating-point overflow at very high tap power levels
    const cost = Number.isFinite(rawCost) ? Math.floor(rawCost) : Number.MAX_SAFE_INTEGER;
    if (state.currency < cost) return false;

    setState(prev => {
      const tasks = prev.dailyTasksState;
      const updatedTasks = tasks
        ? { ...tasks, counters: { ...tasks.counters, upgrade_tap: tasks.counters.upgrade_tap + 1 } }
        : tasks;
      return {
        ...prev,
        currency: prev.currency - cost,
        tapPower: prev.tapPower + 1,
        dailyTasksState: updatedTasks,
      };
    });

    return true;
  }, [state.currency, state.tapPower]);

  const addArtifactPart = useCallback((artifactId: string, isFull: boolean) => {
    setState(prev => {
      const newParts = { ...prev.artifactParts };
      const newCompleted = [...(prev.completedArtifacts || [])];

      if (isFull) {
        if (!newCompleted.includes(artifactId)) newCompleted.push(artifactId);
      } else if (!newCompleted.includes(artifactId)) {
        // Only add parts if artifact not already completed
        newParts[artifactId] = (newParts[artifactId] || 0) + 1;

        // Auto-complete when all parts collected
        const artifact = ARTIFACTS.find(a => a.id === artifactId);
        if (artifact && newParts[artifactId] >= artifact.parts) {
          newCompleted.push(artifactId);
        }
      }

      return { ...prev, artifactParts: newParts, completedArtifacts: newCompleted };
    });
  }, []);

  const deductGachaCost = useCallback((cost: number): boolean => {
    if (state.currency < cost) return false;
    setState(prev => ({ ...prev, currency: Math.max(0, prev.currency - cost) }));
    return true;
  }, [state.currency]);

  const recordGachaOpen = useCallback(() => {
    setState(prev => {
      const tasks = prev.dailyTasksState;
      if (!tasks) return prev;
      return {
        ...prev,
        dailyTasksState: {
          ...tasks,
          counters: { ...tasks.counters, open_gacha: tasks.counters.open_gacha + 1 },
        },
      };
    });
  }, []);

  const claimDailyTask = useCallback((taskId: string) => {
    const task = getTaskById(taskId);
    if (!task) return;

    setState(prev => {
      const tasks = prev.dailyTasksState;
      if (!tasks || tasks.claimed.includes(taskId)) return prev;
      if (tasks.counters[task.type] < task.target) return prev;

      const reward = task.reward;
      return {
        ...prev,
        currency: prev.currency + (reward.currency || 0),
        totalCurrencyEarned: prev.totalCurrencyEarned + (reward.currency || 0),
        xp: prev.xp + (reward.xp || 0),
        totalXp: prev.totalXp + (reward.xp || 0),
        dailyTasksState: {
          ...tasks,
          claimed: [...tasks.claimed, taskId],
        },
      };
    });
  }, []);

  const dismissStreakModal = useCallback(() => setStreakModal(null), []);

  const switchEpoch = useCallback((epochId: EpochId) => {
    if (!state.unlockedEpochs.includes(epochId)) return;
    setState(prev => {
      const newState = { ...prev, epochId };
      saveGameState(newState);
      return newState;
    });
  }, [state.unlockedEpochs]);

  const loadLeaderboard = useCallback(async () => {
    setLeaderboardLoading(true);
    try {
      const data = await getLeaderboard(50);
      setLeaderboard(data);

      const telegramId = getTelegramUserId();
      if (telegramId) {
        const rank = await getUserRank(telegramId);
        setUserRank(rank);
      }
    } catch (e) {
      console.error('Failed to load leaderboard:', e);
    }
    setLeaderboardLoading(false);
  }, []);

  const dismissOfflineGains = useCallback(() => setOfflineGains(null), []);

  // Called after a successful Telegram Stars purchase to pull fresh boosters from DB
  const refreshBoosters = useCallback(async () => {
    const telegramIdLocal = getTelegramUserId();
    if (!telegramIdLocal) return;
    const fresh = await fetchActiveBoosters(telegramIdLocal);
    setState(prev => ({ ...prev, activeBoosters: fresh }));
  }, []);

  const rawTapCost = 25 * Math.pow(1.8, state.tapPower - 1);
  const tapPowerCost = Number.isFinite(rawTapCost) ? Math.floor(rawTapCost) : Number.MAX_SAFE_INTEGER;
  const telegramId = getTelegramUserId();
  const artifactMultipliers = getArtifactMultipliers(state.completedArtifacts || []);
  const boosterMultipliers = getBoosterMultipliers(state.activeBoosters || {});

  return {
    state,
    epoch,
    tapEvents,
    tap,
    buyGenerator,
    upgradeTapPower,
    switchEpoch,
    tapPowerCost,
    addArtifactPart,
    deductGachaCost,
    recordGachaOpen,
    claimDailyTask,
    isLoading,
    telegramId,
    leaderboard,
    userRank,
    leaderboardLoading,
    loadLeaderboard,
    artifactMultipliers,
    boosterMultipliers,
    refreshBoosters,
    offlineGains,
    dismissOfflineGains,
    duplicateTab,
    streakModal,
    dismissStreakModal,
  };
}
