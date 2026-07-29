import { useEffect, useMemo, useState } from "react";

type Tone = "good" | "watch" | "risk" | "neutral";
type Status = "passed" | "created" | "review" | "blocked";
type CoverageState = "covered" | "partial" | "gap";
type Risk = "low" | "medium" | "high" | "critical";

interface MetricCard {
  label: string;
  value: string;
  trend: string;
  tone: Tone;
}

interface TargetLane {
  name: string;
  target: string;
  kind: string;
  status: Status;
  cadence: string;
  screenshots: number;
  note: string;
}

interface RunStage {
  name: string;
  command: string;
  duration: string;
  status: Status;
}

interface CoverageArea {
  name: string;
  contract: string;
  desktop: CoverageState;
  mobile: CoverageState;
  risk: Risk;
}

interface ArtifactItem {
  name: string;
  type: "screenshot" | "json" | "markdown" | "prompt";
  detail: string;
}

interface DashboardData {
  message: string;
  generatedAt: string;
  items: MetricCard[];
  lanes: TargetLane[];
  stages: RunStage[];
  coverage: CoverageArea[];
  artifacts: ArtifactItem[];
}

export interface Scenario {
  id: SeededIssue;
  label: string;
  operator: string;
  risk: Risk;
  target: string;
  description: string;
}

export interface CommandSpec {
  id: string;
  command: string;
  lane: "fast" | "governance" | "hive" | "provider";
  description: string;
}

type SeededIssue =
  | "api-500"
  | "empty-data"
  | "mobile-overflow"
  | "broken-image"
  | "route-guard-bypass"
  | "force-login-on-demo"
  | "hidden-error-banner"
  | "removed-accessible-name"
  | "theme-token-drift"
  | "stale-loading-state"
  | "hide-critical-button"
  | "remove-demo-badge";

const fallbackData: DashboardData = {
  message: "Demo metrics loaded",
  generatedAt: "2026-07-04T12:00:00.000Z",
  items: [
    { label: "Contracts", value: "11", trend: "critical paths covered", tone: "good" },
    { label: "Targets", value: "6", trend: "local, command group, Storybook, deploy, URL, protected", tone: "good" },
    { label: "Mutation operators", value: "12", trend: "mapped to deterministic assertions", tone: "watch" },
    { label: "External calls", value: "0", trend: "provider and Hive handoff stay dry-run", tone: "good" }
  ],
  lanes: [
    {
      name: "PR local preview",
      target: "localPreview",
      kind: "command",
      status: "passed",
      cadence: "Every pull request",
      screenshots: 8,
      note: "Default first-party evidence lane."
    },
    {
      name: "Full stack fixture",
      target: "fullStackPreview",
      kind: "commandGroup",
      status: "review",
      cadence: "Manual demo",
      screenshots: 1,
      note: "Starts web and mock API services together."
    },
    {
      name: "Component lab",
      target: "componentLibrary",
      kind: "storybook",
      status: "created",
      cadence: "Component visual review",
      screenshots: 1,
      note: "Exercises Storybook target discovery."
    },
    {
      name: "Hosted preview",
      target: "deployPreview",
      kind: "deployPreview",
      status: "review",
      cadence: "Trusted preview only",
      screenshots: 1,
      note: "Uses fallback URL or provider preview env."
    },
    {
      name: "Public URL reference",
      target: "hostedReference",
      kind: "url",
      status: "review",
      cadence: "Manual hosted smoke",
      screenshots: 1,
      note: "Documents hosted/demo target behavior."
    },
    {
      name: "Protected hosted lane",
      target: "unsafeHosted",
      kind: "protected",
      status: "blocked",
      cadence: "Requires secrets",
      screenshots: 0,
      note: "Kept out of untrusted PR runs."
    }
  ],
  stages: [
    { name: "Analyze", command: "npm run vh:analyze", duration: "0.6s", status: "passed" },
    { name: "Plan", command: "npm run vh:plan", duration: "0.4s", status: "passed" },
    { name: "Run", command: "npm run vh:run", duration: "8.2s", status: "passed" },
    { name: "Mutate", command: "npm run vh:mutate", duration: "38s", status: "review" },
    { name: "Evidence", command: "npm run vh:evidence", duration: "0.5s", status: "created" },
    { name: "Hive export", command: "npm run vh:hive-export", duration: "0.4s", status: "created" }
  ],
  coverage: [
    { name: "App shell", contract: "app-shell-stability", desktop: "covered", mobile: "covered", risk: "low" },
    { name: "Auth boundary", contract: "public-auth-boundary", desktop: "covered", mobile: "covered", risk: "critical" },
    { name: "Seeded scenarios", contract: "scenario-gallery-contract", desktop: "covered", mobile: "partial", risk: "high" },
    { name: "API error state", contract: "api-error-state-contract", desktop: "covered", mobile: "covered", risk: "high" },
    { name: "Image assets", contract: "visual-asset-contract", desktop: "covered", mobile: "partial", risk: "medium" },
    { name: "Hive handoff", contract: "hive-integration-lane", desktop: "covered", mobile: "partial", risk: "medium" },
    { name: "Command matrix", contract: "command-matrix-readiness", desktop: "covered", mobile: "covered", risk: "medium" },
    { name: "Storybook component", contract: "component-lab-storybook", desktop: "partial", mobile: "partial", risk: "medium" }
  ],
  artifacts: [
    { name: "report.json", type: "json", detail: "Deterministic run verdict source" },
    { name: "mutation-report.json", type: "json", detail: "Operator kill/survival evidence" },
    { name: "evidence-packet.json", type: "json", detail: "Sanitized handoff context" },
    { name: "hive/hive-export.json", type: "json", detail: "No-network Hive beads and graph" },
    { name: "triage-prompt.md", type: "prompt", detail: "Offline prompt-only advisory context" },
    { name: "screenshots/app-shell-desktop.png", type: "screenshot", detail: "Local Playwright evidence" }
  ]
};

export const scenarios: Scenario[] = [
  {
    id: "hide-critical-button",
    label: "Hidden critical action",
    operator: "hide-critical-button",
    risk: "critical",
    target: "[data-testid='critical-action-button']",
    description: "The main action disappears and selector assertions should fail."
  },
  {
    id: "force-login-on-demo",
    label: "Forced login surface",
    operator: "force-login-on-demo",
    risk: "critical",
    target: "[data-testid='login-page']",
    description: "Public demo mode exposes GitHub login controls that contracts forbid."
  },
  {
    id: "remove-demo-badge",
    label: "Missing demo badge",
    operator: "remove-demo-badge",
    risk: "high",
    target: "[data-testid='demo-badge']",
    description: "A required provenance badge is removed from the app shell."
  },
  {
    id: "api-500",
    label: "API outage",
    operator: "api-500",
    risk: "high",
    target: "[data-testid='error-banner']",
    description: "The API lane fails and the visible error contract becomes the oracle."
  },
  {
    id: "empty-data",
    label: "Empty data",
    operator: "empty-data",
    risk: "medium",
    target: "[data-testid='empty-data-state']",
    description: "Dashboard records disappear and data-dependent selectors should react."
  },
  {
    id: "mobile-overflow",
    label: "Mobile overflow",
    operator: "mobile-overflow",
    risk: "high",
    target: "[data-testid='mobile-overflow-probe']",
    description: "A wide probe creates responsive drift for mobile screenshots."
  },
  {
    id: "route-guard-bypass",
    label: "Route guard bypass",
    operator: "route-guard-bypass",
    risk: "critical",
    target: "[data-testid='protected-route']",
    description: "Protected cluster controls become visible on the public route."
  },
  {
    id: "hidden-error-banner",
    label: "Hidden error banner",
    operator: "hidden-error-banner",
    risk: "high",
    target: "[data-testid='error-banner']",
    description: "A required alert is hidden after an error route is loaded."
  },
  {
    id: "broken-image",
    label: "Broken image asset",
    operator: "broken-image",
    risk: "medium",
    target: "[data-testid='dashboard-preview-image']",
    description: "Preview media is replaced with a missing asset for visual evidence."
  },
  {
    id: "removed-accessible-name",
    label: "Removed accessible names",
    operator: "removed-accessible-name",
    risk: "high",
    target: "buttons, links, images",
    description: "Interactive labels are stripped so text and accessibility contracts fail."
  },
  {
    id: "theme-token-drift",
    label: "Theme token drift",
    operator: "theme-token-drift",
    risk: "medium",
    target: "CSS tokens and screenshots",
    description: "Theme colors and borders drift enough for screenshot evidence to catch."
  },
  {
    id: "stale-loading-state",
    label: "Stale loading state",
    operator: "stale-loading-state",
    risk: "high",
    target: "[data-testid='loading-state']",
    description: "A full-page loading overlay remains after data has loaded."
  }
];

export const commands: CommandSpec[] = [
  { id: "doctor", command: "npm run vh:doctor", lane: "fast", description: "Validate config and local prerequisites." },
  { id: "plan", command: "npm run vh:plan", lane: "fast", description: "Select PR-safe contracts from changed files." },
  { id: "run", command: "npm run vh:run", lane: "fast", description: "Run deterministic Playwright contracts." },
  { id: "mutate", command: "npm run vh:mutate", lane: "fast", description: "Inject seeded Visual Hive operators." },
  { id: "triage", command: "npm run vh:triage", lane: "fast", description: "Create offline issue and repair prompts." },
  { id: "report", command: "npm run vh:report", lane: "fast", description: "Print the deterministic verdict summary." },
  { id: "coverage", command: "npm run vh:coverage", lane: "governance", description: "Audit route, viewport, and mutation coverage." },
  { id: "providers", command: "npm run vh:provider-handoff", lane: "provider", description: "Stage no-network provider handoff evidence." },
  { id: "evidence", command: "npm run vh:evidence", lane: "governance", description: "Compose sanitized evidence for agents." },
  { id: "verdict", command: "npm run vh:verdict", lane: "governance", description: "Normalize the final Visual Hive verdict." },
  { id: "handoff", command: "npm run vh:handoff", lane: "hive", description: "Write dry-run GitHub/Hive handoff artifacts." },
  { id: "hive", command: "npm run vh:hive-export", lane: "hive", description: "Export Hive beads, facts, graph, wiki, and repair work orders." }
];

const navItems = [
  { path: "/", label: "Overview" },
  { path: "/scenarios", label: "Scenarios" },
  { path: "/contracts", label: "Contracts" },
  { path: "/evidence", label: "Evidence" },
  { path: "/integrations", label: "Integrations" },
  { path: "/commands", label: "Commands" },
  { path: "/guarded", label: "Guarded" },
  { path: "/component-lab", label: "Component Lab" }
];

const appBasePath = import.meta.env.BASE_URL.replace(/\/+$/, "");

function currentPath(): string {
  let path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (appBasePath && path === appBasePath) path = "/";
  else if (appBasePath && path.startsWith(`${appBasePath}/`)) path = path.slice(appBasePath.length);
  return navItems.some((item) => item.path === path) ? path : "/";
}

function appHref(route: string): string {
  if (!appBasePath) return route;
  return route === "/" ? `${appBasePath}/` : `${appBasePath}${route}`;
}

function seedFromLocation(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("issue") ?? window.localStorage.getItem("visual-hive-mutation") ?? "";
}

function hasSeededIssue(value: string, issue: SeededIssue): boolean {
  return value === issue;
}

function statusLabel(status: Status): string {
  if (status === "passed") return "Passed";
  if (status === "created") return "Created";
  if (status === "review") return "Review";
  return "Blocked";
}

export function ScenarioCard({ scenario, active }: { scenario: Scenario; active?: boolean }) {
  return (
    <a
      className={`scenario-card ${active ? "active" : ""}`}
      data-testid={`seeded-issue-${scenario.id}`}
      href={`${appHref("/scenarios")}?issue=${scenario.id}`}
    >
      <span className={`risk-chip ${scenario.risk}`}>{scenario.risk}</span>
      <strong>{scenario.label}</strong>
      <small>{scenario.operator}</small>
      <p>{scenario.description}</p>
      <code>{scenario.target}</code>
    </a>
  );
}

export function CommandRow({ command }: { command: CommandSpec }) {
  return (
    <div className="command-row" data-testid={`command-row-${command.id}`}>
      <span className={`lane-chip ${command.lane}`}>{command.lane}</span>
      <code>{command.command}</code>
      <p>{command.description}</p>
    </div>
  );
}

export function App() {
  const route = currentPath();
  const seededIssue = seedFromLocation();
  const showLogin = new URLSearchParams(window.location.search).get("login") === "true" || hasSeededIssue(seededIssue, "force-login-on-demo");
  const [data, setData] = useState<DashboardData | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [checkState, setCheckState] = useState<"idle" | "passed">("idle");
  const [brokenAsset, setBrokenAsset] = useState(false);
  const activeScenario = scenarios.find((scenario) => scenario.id === seededIssue);

  useEffect(() => {
    let cancelled = false;

    if (hasSeededIssue(seededIssue, "api-500")) {
      setError("Seeded API 500 state for contract triage.");
      setData(undefined);
      return () => {
        cancelled = true;
      };
    }

    if (hasSeededIssue(seededIssue, "empty-data")) {
      setError(undefined);
      setData({ ...fallbackData, message: "Seeded empty data state", items: [] });
      return () => {
        cancelled = true;
      };
    }

    fetch(`${import.meta.env.BASE_URL}api/dashboard-data`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`API status ${response.status}`);
        }
        return (await response.json()) as DashboardData;
      })
      .then((nextData) => {
        if (!cancelled) {
          setError(undefined);
          setData(nextData);
        }
      })
      .catch((nextError: unknown) => {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Unable to load dashboard data");
          setData(undefined);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [seededIssue]);

  const visibleData = useMemo(() => data ?? fallbackData, [data]);
  const previewSrc = hasSeededIssue(seededIssue, "broken-image")
    ? `${import.meta.env.BASE_URL}missing-visual-hive-preview.svg`
    : `${import.meta.env.BASE_URL}dashboard-preview.svg`;

  useEffect(() => {
    setBrokenAsset(false);
  }, [previewSrc]);

  if (showLogin) {
    return <LoginPage />;
  }

  return (
    <main
      className={`app-shell ${hasSeededIssue(seededIssue, "mobile-overflow") ? "has-mobile-overflow" : ""}`}
      data-testid="dashboard-page"
    >
      <aside className="sidebar" data-testid="testlab-shell">
        <a className="brand" href={appHref("/")} aria-label="Visual Hive Test Lab home">
          <span aria-hidden="true">VH</span>
          <strong>Visual Hive Test Lab</strong>
        </a>
        <nav aria-label="Demo sections">
          {navItems.map((item) => (
            <a className={route === item.path ? "active" : ""} href={appHref(item.path)} key={item.path}>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="demo-badge" data-testid="demo-badge">
            Safe demo mode
          </span>
          <small>No provider or Hive API calls by default.</small>
        </div>
      </aside>

      <section className="workspace">
        <Header
          activeScenario={activeScenario}
          checkState={checkState}
          error={error}
          onRunProtectedCheck={() => setCheckState("passed")}
          route={route}
          visibleData={visibleData}
        />

        {error ? (
          <section className="error-banner" data-testid="error-banner" role="alert">
            <strong>Error state visible</strong>
            <span>{error}</span>
            <span>Contracts require this banner on API failure so hidden-alert regressions are caught.</span>
          </section>
        ) : null}

        {hasSeededIssue(seededIssue, "route-guard-bypass") ? <ProtectedRoute /> : null}
        {hasSeededIssue(seededIssue, "stale-loading-state") ? <LoadingState /> : null}

        {route === "/" ? (
          <Overview
            brokenAsset={brokenAsset}
            data={visibleData}
            onPreviewError={() => setBrokenAsset(true)}
            previewSrc={previewSrc}
            seededIssue={seededIssue}
          />
        ) : null}
        {route === "/scenarios" ? <Scenarios seededIssue={seededIssue} /> : null}
        {route === "/contracts" ? <Contracts data={visibleData} /> : null}
        {route === "/evidence" ? <Evidence data={visibleData} /> : null}
        {route === "/integrations" ? <Integrations /> : null}
        {route === "/commands" ? <Commands /> : null}
        {route === "/guarded" ? <GuardedRepair /> : null}
        {route === "/component-lab" ? <ComponentLab /> : null}

        {hasSeededIssue(seededIssue, "mobile-overflow") ? (
          <section className="overflow-probe" data-testid="mobile-overflow-probe">
            This intentionally wide probe demonstrates mobile overflow detection in visual screenshots.
          </section>
        ) : null}
      </section>
    </main>
  );
}

function Header({
  activeScenario,
  checkState,
  error,
  onRunProtectedCheck,
  route,
  visibleData
}: {
  activeScenario?: Scenario;
  checkState: "idle" | "passed";
  error?: string;
  onRunProtectedCheck: () => void;
  route: string;
  visibleData: DashboardData;
}) {
  const section = navItems.find((item) => item.path === route)?.label ?? "Overview";

  return (
    <header className="topbar">
      <div className="title-block">
        <p className="caption">DavidDiaz0317/visual-hive-demo-site</p>
        <h1>{section === "Overview" ? "Visual Hive Test Lab" : section}</h1>
        <p className="intro">
          A deterministic fixture for Visual Hive setup, contract selection, mutation adequacy, local evidence,
          provider governance, and Hive handoff.
        </p>
      </div>
      <div className="run-health" data-testid="run-health-strip">
        <div>
          <span className={`health-dot ${error ? "blocked" : "passed"}`} />
          <strong>{error ? "API data unavailable" : visibleData.message}</strong>
          <small data-testid="dynamic-run-id">run vh-demo-20260704</small>
        </div>
        <div>
          <strong>{activeScenario ? activeScenario.operator : "healthy-default"}</strong>
          <small>{activeScenario ? "Seeded scenario active" : "Default route should pass"}</small>
        </div>
        <button
          className="critical-action"
          data-testid="critical-action-button"
          aria-label="Run protected check"
          onClick={onRunProtectedCheck}
          type="button"
        >
          Run protected check
        </button>
        <p className="check-result" data-testid="protected-check-result">
          {checkState === "passed" ? "Protected check passed without exposing login controls." : "Protected check idle"}
        </p>
      </div>
    </header>
  );
}

function Overview({
  brokenAsset,
  data,
  onPreviewError,
  previewSrc,
  seededIssue
}: {
  brokenAsset: boolean;
  data: DashboardData;
  onPreviewError: () => void;
  previewSrc: string;
  seededIssue: string;
}) {
  return (
    <>
      <section className="overview-grid" aria-label="Test lab overview">
        <article className="lab-panel hero-panel" data-testid="dashboard-card">
          <div>
            <p className="caption">Current deterministic surface</p>
            <h2>Healthy by default, issue-rich when asked.</h2>
            <p>
              The app keeps normal Visual Hive runs stable while exposing specific failure modes through routes, query
              strings, and mutation operators.
            </p>
          </div>
          <img
            className="dashboard-preview"
            data-testid="dashboard-preview-image"
            src={previewSrc}
            alt="Visual Hive dashboard preview showing contract, screenshot, and triage panels"
            onError={onPreviewError}
          />
          {brokenAsset ? (
            <p className="asset-warning" data-testid="broken-image-warning" role="alert">
              Preview image failed to load.
            </p>
          ) : null}
        </article>

        <section className="lab-panel scenario-panel" data-testid="scenario-gallery" aria-label="Seeded issue states">
          <PanelTitle label="Scenarios" title="Seeded issue gallery" />
          <div className="scenario-mini-list">
            {scenarios.slice(0, 6).map((scenario) => (
              <a className={seededIssue === scenario.id ? "mini-scenario active" : "mini-scenario"} href={`${appHref("/scenarios")}?issue=${scenario.id}`} key={scenario.id}>
                <span className={`risk-chip ${scenario.risk}`}>{scenario.risk}</span>
                <strong>{scenario.label}</strong>
              </a>
            ))}
          </div>
        </section>
      </section>

      <section className="metric-grid" aria-label="Demo dashboard cards">
        {data.items.length > 0 ? (
          data.items.map((item) => (
            <article className={`metric-card ${item.tone}`} data-testid="dashboard-card" key={item.label}>
              <span className="demo-badge" data-testid="demo-badge">
                Demo
              </span>
              <h2>{item.label}</h2>
              <p className="metric">{item.value}</p>
              <p className="trend">{item.trend}</p>
            </article>
          ))
        ) : (
          <article className="empty-state" data-testid="empty-data-state">
            <h2>No dashboard records</h2>
            <p>This seeded state should be caught by card selectors and visual baselines.</p>
          </article>
        )}
      </section>

      <section className="insight-grid">
        <TargetLaneList lanes={data.lanes} />
        <RunTimeline stages={data.stages} />
      </section>
      <CoverageMatrix coverage={data.coverage} />
      <ArtifactStrip artifacts={data.artifacts.slice(0, 4)} />
    </>
  );
}

function Scenarios({ seededIssue }: { seededIssue: string }) {
  return (
    <section className="page-stack">
      <article className="lab-panel">
        <PanelTitle label="Mutation coverage" title="All built-in operators have visible targets" />
        <p className="section-copy">
          These links are safe, opt-in routes for live demos. Visual Hive mutation runs can also activate the same
          surfaces through the `visual-hive-mutation` localStorage hook.
        </p>
      </article>
      <div className="scenario-grid">
        {scenarios.map((scenario) => (
          <ScenarioCard active={seededIssue === scenario.id} scenario={scenario} key={scenario.id} />
        ))}
      </div>
    </section>
  );
}

function Contracts({ data }: { data: DashboardData }) {
  return (
    <section className="page-stack">
      <CoverageMatrix coverage={data.coverage} />
      <section className="lab-panel" data-testid="contract-inventory">
        <PanelTitle label="Contracts" title="Deterministic contract inventory" />
        <div className="contract-list">
          {data.coverage.map((area) => (
            <div className="contract-row" key={area.contract}>
              <span className={`risk-chip ${area.risk}`}>{area.risk}</span>
              <strong>{area.contract}</strong>
              <p>{area.name}</p>
              <code>{area.desktop}/{area.mobile}</code>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function Evidence({ data }: { data: DashboardData }) {
  return (
    <section className="page-stack">
      <section className="lab-panel evidence-panel" data-testid="evidence-preview">
        <PanelTitle label="Evidence" title="Artifacts Visual Hive can inspect or hand off" />
        <ArtifactStrip artifacts={data.artifacts} />
      </section>
      <section className="lab-panel">
        <PanelTitle label="Layers" title="What this repo exercises" />
        <div className="layer-grid" data-testid="testing-layer-grid">
          {["Route screenshots", "Selector contracts", "Flow steps", "Mutation testing", "Provider dry-run", "Hive export", "Agent packets", "Cost policy"].map((layer) => (
            <span key={layer}>{layer}</span>
          ))}
        </div>
      </section>
    </section>
  );
}

function Integrations() {
  return (
    <section className="page-stack">
      <section className="integration-grid">
        <article className="lab-panel" data-testid="hive-integration-lane">
          <PanelTitle label="Hive" title="Dry-run handoff before trusted repair" />
          <p className="section-copy">
            Hive export is enabled in local dry-run mode with ACMM level 5 policy, human review, and Visual Hive as the
            final verdict authority.
          </p>
          <dl className="definition-list">
            <div>
              <dt>Mode</dt>
              <dd>dry_run</dd>
            </div>
            <div>
              <dt>Default actor</dt>
              <dd>quality</dd>
            </div>
            <div>
              <dt>Repair</dt>
              <dd>guarded, no execution</dd>
            </div>
          </dl>
        </article>

        <article className="lab-panel" data-testid="provider-readiness">
          <PanelTitle label="Providers" title="Optional adapters stay governed" />
          <p className="section-copy">
            Playwright remains the local oracle. Argos, Percy, Chromatic, Applitools, Storybook, and GitHub Checks are
            represented for setup planning without paid uploads by default.
          </p>
          <div className="provider-list">
            {["playwright: enabled", "argos: dry-run", "percy: disabled", "chromatic: disabled", "applitools: disabled", "storybook: mock"].map((provider) => (
              <span key={provider}>{provider}</span>
            ))}
          </div>
        </article>
      </section>

      <section className="lab-panel" data-testid="github-workflow-list">
        <PanelTitle label="GitHub" title="Workflow templates for safe live demos" />
        <div className="workflow-list">
          {["visual-hive-pr.yml", "visual-hive-scheduled.yml", "visual-hive-provider-dry-run.yml", "visual-hive-hive-export.yml"].map((workflow) => (
            <div className="workflow-row" key={workflow}>
              <strong>{workflow}</strong>
              <span>pull_request or manual/scheduled only; no pull_request_target execution.</span>
            </div>
          ))}
        </div>
      </section>

      <section className="lab-panel" data-testid="mock-api-health">
        <PanelTitle label="Command group" title="Mock API service target" />
        <p className="section-copy">
          The `fullStackPreview` target starts this web app and `scripts/mock-api.mjs` together so target lifecycle,
          health paths, and teardown behavior can be audited.
        </p>
      </section>
    </section>
  );
}

function Commands() {
  return (
    <section className="page-stack">
      <section className="lab-panel command-panel" data-testid="command-matrix">
        <PanelTitle label="Commands" title="Safe demo command matrix" />
        <div className="command-list">
          {commands.map((command) => (
            <CommandRow command={command} key={command.id} />
          ))}
        </div>
      </section>
    </section>
  );
}

function GuardedRepair() {
  return (
    <section className="page-stack">
      <section className="lab-panel guarded-panel" data-testid="guarded-repair-policy">
        <PanelTitle label="Guarded repair" title="Hive can propose, Visual Hive still decides" />
        <div className="policy-grid">
          <div>
            <strong>Verdict authority</strong>
            <p>Visual Hive deterministic verdict engine</p>
          </div>
          <div>
            <strong>Repair execution</strong>
            <p>Not executed by Visual Hive</p>
          </div>
          <div>
            <strong>Human review</strong>
            <p>Required before merge</p>
          </div>
          <div>
            <strong>Final validation</strong>
            <p>Rerun Visual Hive before accepting a fix</p>
          </div>
        </div>
      </section>
    </section>
  );
}

function ComponentLab() {
  return (
    <section className="page-stack">
      <section className="lab-panel component-lab" data-testid="component-lab-page">
        <PanelTitle label="Component lab" title="Storybook-targeted fixture components" />
        <div className="component-preview-grid">
          <ScenarioCard scenario={scenarios[0]} />
          <CommandRow command={commands[0]} />
          <div className="mini-coverage-card" data-testid="component-lab-card">
            <span className="risk-chip medium">medium</span>
            <strong>Component coverage target</strong>
            <p>Storybook screenshots can lock these components without loading the whole app shell.</p>
          </div>
        </div>
      </section>
    </section>
  );
}

function TargetLaneList({ lanes }: { lanes: TargetLane[] }) {
  return (
    <article className="lab-panel">
      <PanelTitle label="Targets" title="Lane health" />
      <div className="lane-list" data-testid="target-lane-list">
        {lanes.map((lane) => (
          <div className="lane-row" key={lane.target}>
            <span className={`health-dot ${lane.status}`} aria-hidden="true" />
            <div>
              <strong>{lane.name}</strong>
              <span>
                {lane.target} · {lane.kind} · {lane.cadence}
              </span>
              <small>{lane.note}</small>
            </div>
            <b>{lane.screenshots}</b>
          </div>
        ))}
      </div>
    </article>
  );
}

function RunTimeline({ stages }: { stages: RunStage[] }) {
  return (
    <article className="lab-panel">
      <PanelTitle label="Runtime" title="Last deterministic pass" />
      <ol className="run-timeline" data-testid="run-timeline">
        {stages.map((stage) => (
          <li className={stage.status} key={stage.name}>
            <span>{stage.name}</span>
            <code>{stage.command}</code>
            <strong>{stage.duration}</strong>
          </li>
        ))}
      </ol>
    </article>
  );
}

function CoverageMatrix({ coverage }: { coverage: CoverageArea[] }) {
  return (
    <section className="lab-panel coverage-panel" data-testid="coverage-matrix" aria-label="Coverage matrix">
      <PanelTitle label="Coverage" title="Viewport and risk matrix" />
      <div className="coverage-table" role="table" aria-label="Viewport coverage matrix">
        <div className="coverage-row heading" role="row">
          <span role="columnheader">Area</span>
          <span role="columnheader">Contract</span>
          <span role="columnheader">Desktop</span>
          <span role="columnheader">Mobile</span>
          <span role="columnheader">Risk</span>
        </div>
        {coverage.map((area) => (
          <div className="coverage-row" role="row" key={area.contract}>
            <strong role="cell">{area.name}</strong>
            <code role="cell">{area.contract}</code>
            <span className={`pill ${area.desktop}`} role="cell">
              {area.desktop}
            </span>
            <span className={`pill ${area.mobile}`} role="cell">
              {area.mobile}
            </span>
            <span className={`risk-chip ${area.risk}`} role="cell">
              {area.risk}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ArtifactStrip({ artifacts }: { artifacts: ArtifactItem[] }) {
  return (
    <section className="artifact-strip" aria-label="Generated artifacts">
      {artifacts.map((artifact) => (
        <article className="artifact-card" data-testid="artifact-card" key={artifact.name}>
          <span>{artifact.type}</span>
          <strong>{artifact.name}</strong>
          <p>{artifact.detail}</p>
        </article>
      ))}
    </section>
  );
}

function PanelTitle({ label, title }: { label: string; title: string }) {
  return (
    <div className="panel-title">
      <p className="caption">{label}</p>
      <h2>{title}</h2>
    </div>
  );
}

function LoginPage() {
  return (
    <main className="login-page" data-testid="login-page">
      <section className="login-panel">
        <p className="caption">Blocked public surface</p>
        <h1>Visual Hive Demo Login</h1>
        <p>This route is intentionally not allowed in public demo mode.</p>
        <button data-testid="github-login-button" type="button">
          Continue with GitHub
        </button>
      </section>
    </main>
  );
}

function ProtectedRoute() {
  return (
    <section className="protected-route" data-testid="protected-route" role="region" aria-label="Protected route bypass">
      <h2>Protected route bypass</h2>
      <p>Cluster administration controls are visible without the expected guard.</p>
    </section>
  );
}

function LoadingState() {
  return (
    <section className="loading-state" data-testid="loading-state" role="status" aria-busy="true">
      Loading dashboard data
    </section>
  );
}
