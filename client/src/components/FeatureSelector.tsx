import { useMemo } from 'react';

interface Feature {
  id: string;
  name: string;
}

interface FeatureSelectorProps {
  title: string;
  features: Feature[];
  selectedFeatureNames: string[];
  onToggle: (featureName: string) => void;
  color?: 'primary' | 'purple' | 'green' | 'blue' | 'orange';
}

const colorClasses = {
  primary: {
    selected: 'bg-primary-500/20 border-primary-500/50 text-primary-300',
    unselected: 'bg-slate-700/20 border-slate-600/50 text-slate-400 hover:text-slate-300 hover:border-slate-500/50',
  },
  purple: {
    selected: 'bg-purple-500/20 border-purple-500/50 text-purple-300',
    unselected: 'bg-slate-700/20 border-slate-600/50 text-slate-400 hover:text-slate-300 hover:border-slate-500/50',
  },
  green: {
    selected: 'bg-green-500/20 border-green-500/50 text-green-300',
    unselected: 'bg-slate-700/20 border-slate-600/50 text-slate-400 hover:text-slate-300 hover:border-slate-500/50',
  },
  blue: {
    selected: 'bg-blue-500/20 border-blue-500/50 text-blue-300',
    unselected: 'bg-slate-700/20 border-slate-600/50 text-slate-400 hover:text-slate-300 hover:border-slate-500/50',
  },
  orange: {
    selected: 'bg-orange-500/20 border-orange-500/50 text-orange-300',
    unselected: 'bg-slate-700/20 border-slate-600/50 text-slate-400 hover:text-slate-300 hover:border-slate-500/50',
  },
};

export default function FeatureSelector({
  title,
  features,
  selectedFeatureNames,
  onToggle,
  color = 'primary',
}: FeatureSelectorProps) {
  const classes = useMemo(() => colorClasses[color], [color]);

  if (features.length === 0) {
    return null;
  }

  return (
    <div className="bg-slate-700/20 rounded-2xl p-4 border border-slate-600/30">
      <p className="text-sm font-semibold text-white mb-3">{title}</p>
      <div className="flex flex-wrap gap-2">
        {features.map((feature) => {
          const isSelected = selectedFeatureNames.includes(feature.name);
          return (
            <button
              key={feature.id}
              type="button"
              onClick={() => onToggle(feature.name)}
              className={`px-3 py-2 rounded-xl text-sm font-medium border-2 transition-all active:scale-95 ${
                isSelected ? classes.selected : classes.unselected
              }`}
            >
              {feature.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
