import { useState } from 'react';
import { X, ChevronLeft, ChevronRight, Target, ShoppingBag, Gift, Zap, Users, BookOpen } from 'lucide-react';
import { hapticImpact } from '../lib/telegram';

interface TutorialModalProps {
  onClose: () => void;
}

const STEPS = [
  {
    icon: <Target className="w-16 h-16 text-yellow-400" />,
    title: 'Ласкаво просимо!',
    content: 'Це гра "Україна Крізь Час" — подорож 12 епохами української історії. Тапайте, щоб заробляти XP!',
  },
  {
    icon: <ShoppingBag className="w-16 h-16 text-green-400" />,
    title: 'Генератори',
    content: 'Купуйте генератори в магазині — вони автоматично приносять XP кожну секунду. Чим вище рівень генератора, тим більше дохід.',
  },
  {
    icon: <Gift className="w-16 h-16 text-purple-400" />,
    title: 'Артефакти',
    content: 'Відкривайте скрині з артефактами. Збирайте частини та отримуйте бонуси до XP, валюти та пасивного доходу!',
  },
  {
    icon: <Zap className="w-16 h-16 text-yellow-400" />,
    title: 'Бустери',
    content: 'Купуйте бустери за Telegram Stars та отримуйте тимчасові бонуси: подвійний XP, валюту або гарантованого легендарного артефакту!',
  },
  {
    icon: <Users className="w-16 h-16 text-blue-400" />,
    title: 'Друзі',
    content: 'Запрошуйте друзів та отримуйте бонуси за кожного запрошеного гравця!',
  },
  {
    icon: <BookOpen className="w-16 h-16 text-amber-400" />,
    title: 'Епохи',
    content: 'Розвивайтесь від Трипільської культури до Незалежної України. Кожна епоха — нові генератори та артефакти!',
  },
];

export function TutorialModal({ onClose }: TutorialModalProps) {
  const [step, setStep] = useState(0);

  const handleNext = () => {
    hapticImpact('light');
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    hapticImpact('light');
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const handleSkip = () => {
    hapticImpact('medium');
    onClose();
  };

  const currentStep = STEPS[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-sm bg-gray-900 rounded-3xl overflow-hidden shadow-2xl border border-gray-700">
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 text-gray-400 hover:text-white z-10 transition-colors"
        >
          <X size={24} />
        </button>

        <div className="pt-8 pb-6 px-6 text-center">
          {/* Icon */}
          <div className="mb-6 flex justify-center animate-pulse">
            {currentStep.icon}
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-white mb-3">
            {currentStep.title}
          </h2>

          {/* Content */}
          <p className="text-gray-400 text-sm leading-relaxed mb-6">
            {currentStep.content}
          </p>

          {/* Progress dots */}
          <div className="flex justify-center gap-2 mb-6">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === step ? 'bg-yellow-400 w-6' : 'bg-gray-600'
                }`}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="flex gap-3">
            {step > 0 && (
              <button
                onClick={handlePrev}
                className="flex-1 py-3 rounded-xl bg-gray-700 text-white font-medium hover:bg-gray-600 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <ChevronLeft size={18} />
                Назад
              </button>
            )}
            <button
              onClick={handleNext}
              className="flex-1 py-3 rounded-xl font-medium transition-all active:scale-95 flex items-center justify-center gap-2 bg-gradient-to-r from-yellow-500 to-amber-500 text-black hover:from-yellow-400 hover:to-amber-400"
            >
              {step === STEPS.length - 1 ? (
                <>
                  <BookOpen size={18} />
                  Почати гру
                </>
              ) : (
                <>
                  Далі
                  <ChevronRight size={18} />
                </>
              )}
            </button>
          </div>

          {/* Skip link */}
          <button
            onClick={handleSkip}
            className="mt-4 text-xs text-gray-500 hover:text-gray-400 transition-colors"
          >
            Пропустити туторіал
          </button>
        </div>
      </div>
    </div>
  );
}
