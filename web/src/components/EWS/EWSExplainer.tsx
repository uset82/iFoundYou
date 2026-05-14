import './EWSExplainer.css';

export default function EWSExplainer() {
  return (
    <div className="ews-explainer">
      <h3 className="ews-explainer__title">How This Works</h3>
      <p>
        This site watches a fixed cohort of business jets and asks a simple question: is the
        number currently airborne unusual for this time? It is not tracking all aircraft. The
        original version used an FAA-only business-jet list. The current tracker builds a
        broader global aircraft metadata table by merging ADS-B Exchange aircraft records,
        Mictronics/tar1090 records, and FAA registry data by ICAO hex.
      </p>
      <p>
        The flight data comes from ADS-B Exchange heatmap files. Those files are published in
        half-hour slots and encode recent aircraft positions. The backend downloads the newest
        available heatmap, parses it, matches the aircraft against the tracked cohort, and
        stores the latest position, altitude, speed, heading, and airborne state for each match.
      </p>
      <p>
        Historical context comes from the same heatmap format. The dashboard compares the
        current concurrent airborne count with an all-history weekly baseline for the same
        half-hour of the week. The model also learns local half-hour profiles around U.S.
        federal holidays.
      </p>
      <p>
        The deviation number is the current count minus the expected count. The sigma value
        puts that difference on the scale of historical model error, so tiny overnight changes
        do not dominate just because the usual count is low.
      </p>
      <p className="ews-explainer__attribution">
        Built by{' '}
        <a href="https://kylemcdonald.net" target="_blank" rel="noopener noreferrer">
          Kyle McDonald
        </a>
        . Data integrated from{' '}
        <a href="https://ews.kylemcdonald.net" target="_blank" rel="noopener noreferrer">
          ews.kylemcdonald.net
        </a>
        .
      </p>

      <h3 className="ews-explainer__title">FAQ</h3>

      <details className="ews-explainer__faq">
        <summary>Is this trying to detect missiles that are already inbound?</summary>
        <p>
          No. The useful signal would be earlier behavior: people or institutions acting on
          information hours or days before it becomes obvious publicly.
        </p>
      </details>

      <details className="ews-explainer__faq">
        <summary>What counts as a business jet here?</summary>
        <p>
          For this app, business jets are a fixed aircraft cohort selected from public aircraft
          metadata by ICAO hex. The filter looks for jet records whose manufacturer, model, or
          ICAO type matches common business-jet families such as Citation, Gulfstream, Falcon,
          Global, Challenger, Learjet, Phenom, Praetor, HondaJet, PC-24, Hawker, Beechjet,
          Eclipse, and Vision Jet.
        </p>
      </details>

      <details className="ews-explainer__faq">
        <summary>Would EMP immediately destroy airplanes?</summary>
        <p>
          Aircraft are generally more robust than consumer electronics because certified
          airplanes already need lightning protection. FAA lightning-protection rules require
          important electrical and electronic systems to withstand or recover from lightning
          exposure.
        </p>
      </details>

      <details className="ews-explainer__faq">
        <summary>Why look at aircraft instead of news or prediction markets?</summary>
        <p>
          This should be read alongside other public signals. This model is designed to tolerate
          normal one- or two-day increases in activity, including holiday travel, so a short
          surge has to be unusual relative to similar historical windows before it meaningfully
          moves the level.
        </p>
      </details>

      <details className="ews-explainer__faq">
        <summary>Does level 5 mean an apocalypse is likely?</summary>
        <p>
          Level 5 means the current count is an extreme positive outlier under this model. It
          can still be caused by holidays, major sporting or political events, data artifacts,
          or cohort mistakes.
        </p>
      </details>
    </div>
  );
}
