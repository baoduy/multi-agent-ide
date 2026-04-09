import React from "react";

type MainLayoutProps = {
  sidebar: React.ReactNode;
  main: React.ReactNode;
  activity: React.ReactNode;
};

export function MainLayout({ sidebar, main, activity }: MainLayoutProps): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        fontSize: 13,
        color: "#1e1e2e",
        background: "#ffffff",
      }}
    >
      <aside
        style={{
          width: 230,
          minWidth: 230,
          borderRight: "1px solid #e5e5ec",
          display: "flex",
          flexDirection: "column",
          background: "#f8f8fa",
        }}
      >
        {sidebar}
      </aside>
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {main}
      </main>
      <section
        style={{
          width: 250,
          minWidth: 250,
          borderLeft: "1px solid #e5e5ec",
          display: "flex",
          flexDirection: "column",
          background: "#f8f8fa",
        }}
      >
        {activity}
      </section>
    </div>
  );
}
