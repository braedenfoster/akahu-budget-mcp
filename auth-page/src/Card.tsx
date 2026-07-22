/** The single centered surface every screen renders into. */
export function Card({ children }: { children: React.ReactNode }) {
  return <div className="card">{children}</div>;
}
