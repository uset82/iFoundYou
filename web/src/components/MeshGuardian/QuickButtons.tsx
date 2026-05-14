import { CATEGORY_META } from '../../lib/chat/emergency';
import type { EmergencyCategory } from '../../lib/chat/emergency';
import './QuickButtons.css';

interface QuickButtonsProps {
  selected: EmergencyCategory | null;
  onSelect: (category: EmergencyCategory) => void;
  disabled?: boolean;
}

const QUICK_ORDER: EmergencyCategory[] = [
  'safe',
  'help',
  'water',
  'food',
  'medical',
  'danger',
];

export default function QuickButtons({
  selected,
  onSelect,
  disabled = false,
}: QuickButtonsProps) {
  return (
    <div className="quick-buttons" role="radiogroup" aria-label="Emergency category">
      {QUICK_ORDER.map((id) => {
        const meta = CATEGORY_META[id];
        const isActive = selected === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={isActive}
            className={`quick-button ${isActive ? 'is-active' : ''}`}
            style={
              {
                ['--qb-color' as any]: meta.color,
              } as React.CSSProperties
            }
            onClick={() => onSelect(id)}
            disabled={disabled}
            title={meta.description}
          >
            <span className="quick-button__icon" aria-hidden="true">
              {meta.icon}
            </span>
            <span className="quick-button__label">{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}
