export default function Loading() {
  return (
    <main className="route-skeleton" role="status" aria-label="Loading portal">
      <aside>
        <div className="route-skeleton-logo" />
        {Array.from({ length: 7 }, (_, index) => <div className="route-skeleton-nav" key={index} />)}
      </aside>
      <section>
        <span>Loading workspace…</span>
        <div className="route-skeleton-title" />
        <div className="route-skeleton-cards">
          {Array.from({ length: 4 }, (_, index) => <div key={index} />)}
        </div>
        <div className="route-skeleton-panel" />
      </section>
    </main>
  );
}
