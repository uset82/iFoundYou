import { useMemo, useState } from 'react';
import type { AircraftModelCount } from '../../lib/ews';
import './AircraftByModel.css';

interface AircraftByModelProps {
  models: AircraftModelCount[];
}

const INITIAL_LIMIT = 24;

export default function AircraftByModel({ models }: AircraftByModelProps) {
  const [showAll, setShowAll] = useState(false);

  const totalTypes = models.length;

  const visible = useMemo(() => {
    if (showAll) return models;
    return models.slice(0, INITIAL_LIMIT);
  }, [models, showAll]);

  if (totalTypes === 0) {
    return null;
  }

  return (
    <div className="ews-by-model">
      <div className="ews-by-model__header">
        <h3 className="ews-by-model__title">Aircraft By Model</h3>
        <span className="ews-by-model__count">{totalTypes} types</span>
      </div>

      <div className="ews-by-model__list">
        {visible.map((model) => (
          <div key={model.label} className="ews-by-model__row">
            <span className="ews-by-model__label" title={model.label}>
              {model.label}
            </span>
            <span className="ews-by-model__bar-wrap">
              <span
                className="ews-by-model__bar"
                style={{
                  width: `${Math.min(100, (model.count / (models[0]?.count || 1)) * 100)}%`,
                }}
              />
            </span>
            <span className="ews-by-model__num">{model.count}</span>
          </div>
        ))}
      </div>

      {totalTypes > INITIAL_LIMIT && (
        <button
          type="button"
          className="ews-by-model__toggle"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? 'Show less' : `Show all ${totalTypes} types`}
        </button>
      )}
    </div>
  );
}
