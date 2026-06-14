import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Epoch, Artifact } from '../types/game';
import { ARTIFACTS } from '../data/epochs';
import { hapticImpact, hapticNotification } from '../lib/telegram';
import { X, Sparkles, Zap } from 'lucide-react';

interface GachaModalProps {
  epoch: Epoch;
  currency: number;
  unlockedEpochs: string[];
  artifactParts: Record<string, number>;
  completedArtifacts: string[];
  onClose: () => void;
  onRoll: (cost: number) => boolean;
  onArtifactDrop: (artifact: Artifact, isFull: boolean) => void;
}

const GACHA_COST = 100;
const ROLL_STEPS = 18;
const ROLL_INTERVAL_MS = 60;

const ROLL_ICONS = ['🎁', '✨', '💎', '🏺', '👑', '⚔️', '☦️', '📜', '🪙', '🎭'];

function pickArtifact(
  byRarity: { common: Artifact[]; rare: Artifact[]; epic: Artifact[]; legendary: Artifact[] },
  all: Artifact[],
): { artifact: Artifact; isFull: boolean } | null {
  const rand = Math.random();
  let result: Artifact | null = null;

  // Weights: legendary 3%, epic 12%, rare 30%, common 55%
  if (rand < 0.03 && byRarity.legendary.length > 0) {
    result = byRarity.legendary[Math.floor(Math.random() * byRarity.legendary.length)];
  } else if (rand < 0.15 && byRarity.epic.length > 0) {
    result = byRarity.epic[Math.floor(Math.random() * byRarity.epic.length)];
  } else if (rand < 0.45 && byRarity.rare.length > 0) {
    result = byRarity.rare[Math.floor(Math.random() * byRarity.rare.length)];
  } else if (byRarity.common.length > 0) {
    result = byRarity.common[Math.floor(Math.random() * byRarity.common.length)];
  }

  // Fallback
  if (!result && all.length > 0) {
    result = all[Math.floor(Math.random() * all.length)];
  }

  if (!result) return null;

  return { artifact: result, isFull: Math.random() < 0.08 };
}

export function GachaModal({
  epoch,
  currency,
  unlockedEpochs,
  artifactParts,
  completedArtifacts,
  onClose,
  onRoll,
  onArtifactDrop,
}: GachaModalProps) {
  const [phase, setPhase] = useState<'ready' | 'rolling' | 'result'>('ready');
  const [currentIcon, setCurrentIcon] = useState('🎁');
  const [rollStep, setRollStep] = useState(0);
  const [droppedArtifact, setDroppedArtifact] = useState<Artifact | null>(null);
  const [droppedIsPart, setDroppedIsPart] = useState(true);

  // Keep stable refs — these NEVER cause interval restarts
  const pendingResultRef = useRef<{ artifact: Artifact; isFull: boolean } | null>(null);
  const onArtifactDropRef = useRef(onArtifactDrop);
  useEffect(() => { onArtifactDropRef.current = onArtifactDrop; });

  // Compute pool once per open — deps are stable (epoch.id never changes during modal)
  const availableArtifacts = useMemo(() => {
    const allowed = new Set(['trypillia', 'scythia', epoch.id, ...unlockedEpochs]);
    return ARTIFACTS.filter(a => allowed.has(a.epoch));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally empty: compute once on mount only

  const artifactsByRarity = useMemo(() => ({
    common:    availableArtifacts.filter(a => a.rarity === 'common'),
    rare:      availableArtifacts.filter(a => a.rarity === 'rare'),
    epic:      availableArtifacts.filter(a => a.rarity === 'epic'),
    legendary: availableArtifacts.filter(a => a.rarity === 'legendary'),
  }), [availableArtifacts]);

  const canAfford = currency >= GACHA_COST;

  const handleRoll = useCallback(() => {
    if (phase !== 'ready') return;
    if (!canAfford) return;
    if (!onRoll(GACHA_COST)) return;

    // Decide result NOW so animation doesn't depend on changing state
    const picked = pickArtifact(artifactsByRarity, availableArtifacts);
    pendingResultRef.current = picked;

    hapticImpact('medium');
    setRollStep(0);
    setDroppedArtifact(null);
    setCurrentIcon('🎁');
    setPhase('rolling');
  }, [phase, canAfford, onRoll, artifactsByRarity, availableArtifacts]);

  // Rolling animation — runs only when phase becomes 'rolling'
  // Has NO state/prop dependencies that change during the roll
  useEffect(() => {
    if (phase !== 'rolling') return;

    let step = 0;

    const interval = setInterval(() => {
      step++;
      setCurrentIcon(ROLL_ICONS[Math.floor(Math.random() * ROLL_ICONS.length)]);
      setRollStep(step);
      hapticImpact('light');

      if (step >= ROLL_STEPS) {
        clearInterval(interval);

        const result = pendingResultRef.current;
        if (result) {
          setDroppedArtifact(result.artifact);
          setDroppedIsPart(!result.isFull);
          setCurrentIcon(result.artifact.icon);
          onArtifactDropRef.current(result.artifact, result.isFull);
        }

        setPhase('result');
        hapticNotification('success');
      }
    }, ROLL_INTERVAL_MS);

    return () => clearInterval(interval);
  // phase is the ONLY dependency — everything else comes from refs
  }, [phase]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const getRarityStyle = (rarity: string) => {
    switch (rarity) {
      case 'legendary':
        return { color: 'text-yellow-400', glow: 'drop-shadow-[0_0_20px_rgba(234,179,8,0.5)]' };
      case 'epic':
        return { color: 'text-purple-400', glow: 'drop-shadow-[0_0_15px_rgba(168,85,247,0.4)]' };
      case 'rare':
        return { color: 'text-blue-400', glow: 'drop-shadow-[0_0_10px_rgba(59,130,246,0.3)]' };
      default:
        return { color: 'text-gray-300', glow: '' };
    }
  };

  const rarityLabels: Record<string, string> = {
    legendary: 'Легендарний',
    epic: 'Епічний',
    rare: 'Рідкісний',
    common: 'Звичайний',
  };

  const rarityBg: Record<string, string> = {
    legendary: 'from-yellow-900/60 to-amber-900/60 border-yellow-500/60',
    epic: 'from-purple-900/60 to-pink-900/60 border-purple-500/60',
    rare: 'from-blue-900/60 to-cyan-900/60 border-blue-500/60',
    common: 'from-gray-800/60 to-gray-700/60 border-gray-500/40',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm">
      <div className="relative w-full max-w-sm mx-4 bg-gray-900 rounded-3xl overflow-hidden shadow-2xl border border-gray-700">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white z-10 transition-colors"
        >
          <X size={24} />
        </button>

        {/* Header */}
        <div
          className={`text-center py-5 px-4 transition-all duration-500 ${
            phase === 'result' && droppedArtifact
              ? `bg-gradient-to-b ${rarityBg[droppedArtifact.rarity]}`
              : 'bg-gradient-to-b from-purple-900/50 to-gray-900'
          }`}
        >
          <h2 className="text-xl font-bold mb-1 text-white">
            {phase === 'result' ? 'Вітаю!' : 'Скриня артефактів'}
          </h2>
          <p className="text-gray-400 text-sm">
            {phase === 'ready' && `Вартість: ${GACHA_COST} ${epoch.currencyIcon}`}
            {phase === 'rolling' && 'Відкриваємо скриню...'}
            {phase === 'result' && (droppedIsPart ? 'Знайдено частину!' : 'Знайдено повний артефакт!')}
          </p>
        </div>

        {/* Main content */}
        <div className="flex flex-col items-center justify-center py-8 px-4 min-h-[220px]">
          {/* Icon */}
          <div
            className={`text-8xl transition-all duration-300 select-none ${
              phase === 'rolling' ? 'animate-bounce' : ''
            } ${phase === 'result' && droppedArtifact ? getRarityStyle(droppedArtifact.rarity).glow + ' scale-125' : ''}`}
          >
            {currentIcon}
          </div>

          {/* Rolling dots */}
          {phase === 'rolling' && (
            <div className="flex gap-2 mt-5">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className={`h-2 rounded-full transition-all duration-100 ${
                    rollStep % 3 === i ? 'bg-yellow-400 w-6' : 'bg-yellow-400/30 w-2'
                  }`}
                />
              ))}
            </div>
          )}

          {/* Progress bar during rolling */}
          {phase === 'rolling' && (
            <div className="w-full mt-4 bg-gray-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-75"
                style={{ width: `${Math.min(100, (rollStep / ROLL_STEPS) * 100)}%` }}
              />
            </div>
          )}

          {/* Result */}
          {phase === 'result' && droppedArtifact && (
            <div className="mt-5 text-center w-full">
              <div className={`${getRarityStyle(droppedArtifact.rarity).color} text-xl font-bold mb-1`}>
                {droppedArtifact.name.ua}
              </div>
              <div className={`text-sm mb-3 font-medium ${getRarityStyle(droppedArtifact.rarity).color} opacity-70`}>
                {rarityLabels[droppedArtifact.rarity]}
              </div>

              <div className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium ${
                completedArtifacts.includes(droppedArtifact.id)
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : droppedIsPart
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-yellow-500/20 text-yellow-400'
              }`}>
                {completedArtifacts.includes(droppedArtifact.id) ? (
                  <><Zap size={14} /> Артефакт вже зібрано!</>
                ) : droppedIsPart ? (
                  <>{(artifactParts[droppedArtifact.id] || 0)}/{droppedArtifact.parts} частин</>
                ) : (
                  <><Zap size={14} /> Повний артефакт!</>
                )}
              </div>

              <div className="mt-3 text-sm font-semibold text-green-400">
                {droppedArtifact.bonus.type === 'xp_multiplier'
                  ? `+${((droppedArtifact.bonus.value - 1) * 100).toFixed(0)}% до XP`
                  : droppedArtifact.bonus.type === 'currency_multiplier'
                  ? `+${((droppedArtifact.bonus.value - 1) * 100).toFixed(0)}% до валюти`
                  : `+${((droppedArtifact.bonus.value - 1) * 100).toFixed(0)}% до пасивного`}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 bg-gray-800/50 border-t border-gray-700">
          {phase === 'ready' && (
            <>
              <button
                onClick={handleRoll}
                disabled={!canAfford}
                className={`w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 ${
                  canAfford
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white active:scale-95 shadow-lg shadow-purple-900/40'
                    : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                }`}
              >
                <Sparkles size={20} />
                Відкрити скриню
              </button>
              {!canAfford && (
                <p className="text-center text-red-400 text-sm mt-2 font-medium">
                  Потрібно ще {GACHA_COST - Math.floor(currency)} {epoch.currencyIcon}
                </p>
              )}
              <div className="mt-3 text-center text-xs text-gray-500">
                Шанси: Звичайний 55% | Рідкісний 30% | Епічний 12% | Легендарний 3%
              </div>
            </>
          )}

          {phase === 'rolling' && (
            <div className="text-center text-gray-500 text-sm py-2">
              Зачекайте...
            </div>
          )}

          {phase === 'result' && (
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl bg-gray-700 text-white font-medium hover:bg-gray-600 transition-all active:scale-95"
              >
                Закрити
              </button>
              <button
                onClick={() => {
                  setPhase('ready');
                  setDroppedArtifact(null);
                  setCurrentIcon('🎁');
                }}
                disabled={currency < GACHA_COST}
                className={`flex-1 py-3 rounded-xl font-medium transition-all active:scale-95 ${
                  currency >= GACHA_COST
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-500 hover:to-pink-500'
                    : 'bg-gray-700 text-gray-400'
                }`}
              >
                Ще раз {currency >= GACHA_COST ? `(${GACHA_COST} ${epoch.currencyIcon})` : ''}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
