import React from 'react';

type SparkBurstProps = {
  active: boolean;
};

const HEARTS = ['💗', '💖', '✨', '💕', '💞', '💘'];

export const SparkBurst: React.FC<SparkBurstProps> = ({ active }) => {
  if (!active) {
    return null;
  }

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {HEARTS.map((heart, index) => (
        <span
          key={`${heart}-${index}`}
          className="absolute bottom-8 text-2xl animate-heart-float"
          style={{
            left: `${15 + index * 13}%`,
            animationDelay: `${index * 110}ms`,
          }}
        >
          {heart}
        </span>
      ))}
    </div>
  );
};
