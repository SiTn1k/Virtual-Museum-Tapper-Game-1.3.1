import { useEffect, useState } from 'react';
import { X, Flame, Star } from 'lucide-react';
import type { StreakReward } from '../data/tasks';
import { formatNumber } from '../lib/utils';
import { hapticNotification } from '../lib/telegram';

interface DailyStreakModalProps {
  streak: number;
  reward: StreakReward;
  onClose: () => void;
}

const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

export function DailyStreakModal({ streak, reward, onClose }: DailyStreakModalProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Slight delay for mount animation
    const t = setTimeout(() => { setVisible(true); hapticNotification('success'); }, 50);
    return () => clearTimeout(t);
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 250);
  };

  const dayInWeek = ((streak - 1) % 7) + 1;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm transition-opacity duration-250 ${visible ? 'opacity-100' : 'opacity-0'}`}
      onClick={handleClose}
    >
      <div
        className={`relative w-full max-w-sm bg-gray-900 rounded-3xl overflow-hidden shadow-2xl border border-yellow-500/40 transition-all duration-250 ${visible ? 'scale-100 opacity-100' : 'scale-90 opacity-0'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Glow header */}
        <div className="bg-gradient-to-b from-amber-500/30 to-transparent pt-8 pb-6 px-6 text-center">
          <div className="text-6xl mb-2 drop-shadow-[0_0_20px_rgba(251,191,36,0.7)] animate-bounce">
            {reward.isWeekly ? '🔥' : streak >= 5 ? '⭐' : '🎁'}
          </div>
          <h2 className="text-2xl font-black text-white mt-3">
            {reward.isWeekly ? `Тижень ${Math.ceil(streak / 7)}!` : `${streak} ${streakDayWord(streak)} поспіль!`}
          </h2>
          <p className="text-sm text-amber-300 mt-1 font-medium">Щоденний бонус отримано</p>
        </div>

        {/* Week progress dots */}
        <div className="flex items-center justify-center gap-2 px-6 py-4 bg-black/20">
          {DAY_LABELS.map((label, i) => {
            const dayNum = i + 1;
            const isPast = dayNum < dayInWeek;
            const isCurrent = dayNum === dayInWeek;
            return (
              <div key={label} className="flex flex-col items-center gap-1">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    isCurrent
                      ? 'bg-amber-400 text-black scale-110 shadow-[0_0_12px_rgba(251,191,36,0.6)]'
                      : isPast
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-700 text-gray-500'
                  }`}
                >
                  {isCurrent ? <Flame className="w-4 h-4" /> : isPast ? '✓' : dayNum}
                </div>
                <span className={`text-[10px] ${isCurrent ? 'text-amber-400' : isPast ? 'text-green-500' : 'text-gray-600'}`}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Rewards */}
        <div className="px-6 py-5">
          <p className="text-xs text-gray-400 text-center mb-3 uppercase tracking-wider">Нагорода</p>
          <div className="flex gap-3">
            <div className="flex-1 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-3 text-center">
              <div className="text-2xl font-black text-yellow-400">+{formatNumber(reward.currency)}</div>
              <div className="text-xs text-gray-400 mt-0.5">Монет</div>
            </div>
            {reward.xp > 0 && (
              <div className="flex-1 bg-blue-500/10 border border-blue-500/30 rounded-2xl p-3 text-center">
                <div className="text-2xl font-black text-blue-400">+{formatNumber(reward.xp)}</div>
                <div className="text-xs text-gray-400 mt-0.5">XP</div>
              </div>
            )}
          </div>
          {streak > 1 && !reward.isWeekly && (
            <p className="text-xs text-center text-amber-400/70 mt-3">
              <Star className="w-3 h-3 inline mr-1" />
              Ще {7 - dayInWeek} {daysWord(7 - dayInWeek)} до тижневого бонусу
            </p>
          )}
        </div>

        {/* Claim button */}
        <div className="px-6 pb-6">
          <button
            onClick={handleClose}
            className="w-full py-4 bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-bold text-lg rounded-2xl hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-amber-500/30"
          >
            Отримати!
          </button>
        </div>

        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function streakDayWord(n: number): string {
  if (n === 1) return 'день';
  if (n >= 2 && n <= 4) return 'дні';
  return 'днів';
}

function daysWord(n: number): string {
  if (n === 1) return 'день';
  if (n >= 2 && n <= 4) return 'дні';
  return 'днів';
}
