import React from "react";

type MainLayoutProps = {
  sidebar: React.ReactNode;
  main: React.ReactNode;
  activity: React.ReactNode;
};

export function MainLayout({ sidebar, main, activity }: MainLayoutProps): React.ReactElement {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr 320px", minHeight: "100vh" }}>
      <aside style={{ borderRight: "1px solid #e5e7eb", padding: 16 }}>{sidebar}</aside>
      <main style={{ padding: 16 }}>{main}</main>
      <section style={{ borderLeft: "1px solid #e5e7eb", padding: 16 }}>{activity}</section>
    </div>
  );
}
