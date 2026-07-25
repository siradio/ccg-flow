export default function Loading({ label = 'Chargement…' }) {
  return (
    <div className="loading-state">
      <span className="spinner" />
      {label}
    </div>
  );
}
