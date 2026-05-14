import type { CohortType } from '../../lib/ews';
import './CohortSelector.css';

interface CohortSelectorProps {
  value: CohortType;
  onChange: (cohort: CohortType) => void;
}

const COHORTS: { id: CohortType; label: string; icon: string }[] = [
  { id: 'business', label: 'Business Jets', icon: '✈️' },
  { id: 'military', label: 'Military', icon: '🛩️' },
  { id: 'untracked', label: 'Untracked', icon: '❓' },
];

export default function CohortSelector({ value, onChange }: CohortSelectorProps) {
  return (
    <div className="ews-cohort-selector" role="tablist">
      {COHORTS.map((cohort) => (
        <button
          key={cohort.id}
          type="button"
          role="tab"
          aria-selected={value === cohort.id}
          className={`ews-cohort-tab ${value === cohort.id ? 'is-active' : ''}`}
          onClick={() => onChange(cohort.id)}
        >
          <span className="ews-cohort-tab__icon">{cohort.icon}</span>
          <span className="ews-cohort-tab__label">{cohort.label}</span>
        </button>
      ))}
    </div>
  );
}
