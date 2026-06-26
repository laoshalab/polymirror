import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import overview from "../../../docs/dashboard/01-overview.md?raw";
import gettingStarted from "../../../docs/dashboard/02-getting-started.md?raw";
import accounts from "../../../docs/dashboard/03-accounts.md?raw";
import leaders from "../../../docs/dashboard/04-leaders.md?raw";
import monitoring from "../../../docs/dashboard/05-monitoring.md?raw";
import riskModes from "../../../docs/dashboard/06-risk-and-modes.md?raw";
import settings from "../../../docs/dashboard/07-settings.md?raw";
import faq from "../../../docs/dashboard/08-faq.md?raw";
import quickRef from "../../../docs/QUICK_REFERENCE.md?raw";
import userGuide from "../../../docs/USER_GUIDE.md?raw";
import { useT } from "../i18n/I18nProvider";

interface DocItem {
  id: string;
  titleKey: string;
  content: string;
  related?: { to: string; labelKey: string }[];
}

interface DocCategory {
  id: string;
  items: DocItem[];
}

const DOC_CATEGORIES: DocCategory[] = [
  {
    id: "start",
    items: [
      {
        id: "overview",
        titleKey: "docs.docOverview",
        content: overview,
        related: [{ to: "/", labelKey: "nav.overview" }],
      },
      {
        id: "getting-started",
        titleKey: "docs.docGettingStarted",
        content: gettingStarted,
        related: [
          { to: "/account", labelKey: "nav.account" },
          { to: "/settings", labelKey: "nav.settings" },
        ],
      },
    ],
  },
  {
    id: "account",
    items: [
      {
        id: "accounts",
        titleKey: "docs.docAccounts",
        content: accounts,
        related: [{ to: "/account", labelKey: "nav.account" }],
      },
    ],
  },
  {
    id: "copy",
    items: [
      {
        id: "leaders",
        titleKey: "docs.docLeaders",
        content: leaders,
        related: [
          { to: "/discover", labelKey: "nav.discover" },
          { to: "/leaders", labelKey: "nav.leaders" },
        ],
      },
    ],
  },
  {
    id: "monitor",
    items: [
      {
        id: "monitoring",
        titleKey: "docs.docMonitoring",
        content: monitoring,
        related: [
          { to: "/", labelKey: "nav.overview" },
          { to: "/activity", labelKey: "nav.activity" },
          { to: "/positions", labelKey: "nav.positions" },
          { to: "/orders", labelKey: "nav.orders" },
        ],
      },
    ],
  },
  {
    id: "risk",
    items: [
      {
        id: "risk-modes",
        titleKey: "docs.docRiskModes",
        content: riskModes,
        related: [
          { to: "/risk", labelKey: "nav.risk" },
          { to: "/settings", labelKey: "docs.settingsMode" },
        ],
      },
    ],
  },
  {
    id: "config",
    items: [
      {
        id: "settings",
        titleKey: "docs.docSettings",
        content: settings,
        related: [{ to: "/settings", labelKey: "nav.settings" }],
      },
    ],
  },
  {
    id: "help",
    items: [{ id: "faq", titleKey: "docs.docFaq", content: faq }],
  },
  {
    id: "ref",
    items: [
      { id: "quick-ref", titleKey: "docs.docQuickRef", content: quickRef },
      { id: "user-guide", titleKey: "docs.docUserGuide", content: userGuide },
    ],
  },
];

const CATEGORY_I18N: Record<string, string> = {
  start: "categoryStart",
  account: "categoryAccount",
  copy: "categoryCopy",
  monitor: "categoryMonitor",
  risk: "categoryRisk",
  config: "categoryConfig",
  help: "categoryHelp",
  ref: "categoryRef",
};

const ALL_ITEMS = DOC_CATEGORIES.flatMap((c) => c.items);
const DEFAULT_DOC_ID = ALL_ITEMS[0]!.id;

function findItem(id: string): DocItem | undefined {
  return ALL_ITEMS.find((d) => d.id === id);
}

function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface TocEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

function extractToc(content: string): TocEntry[] {
  const entries: TocEntry[] = [];
  for (const line of content.split("\n")) {
    const h2 = line.match(/^## (.+)$/);
    const h3 = line.match(/^### (.+)$/);
    if (h2) entries.push({ id: slugify(h2[1]!), text: h2[1]!, level: 2 });
    if (h3) entries.push({ id: slugify(h3[1]!), text: h3[1]!, level: 3 });
  }
  return entries;
}

function makeHeading(level: 2 | 3 | 4) {
  return function Heading({ children }: { children?: ReactNode }) {
    const text = String(children ?? "");
    const id = slugify(text);
    const Tag = `h${level}` as "h2" | "h3" | "h4";
    return (
      <Tag id={id} className="docs-heading">
        <a href={`#${id}`} className="docs-heading-anchor" aria-label={text}>
          #
        </a>
        {children}
      </Tag>
    );
  };
}

const markdownComponents = {
  h2: makeHeading(2),
  h3: makeHeading(3),
  h4: makeHeading(4),
  a: ({ href, children }: { href?: string; children?: ReactNode }) => {
    if (href?.startsWith("/") && !href.startsWith("//")) {
      return (
        <Link to={href} className="docs-inline-link">
          {children}
        </Link>
      );
    }
    const external = href?.startsWith("http");
    return (
      <a href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>
        {children}
      </a>
    );
  },
};

function matchesQuery(item: DocItem, query: string, title: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return title.toLowerCase().includes(q) || item.content.toLowerCase().includes(q);
}

export function DocsPage() {
  const t = useT();
  const navigate = useNavigate();
  const { docId } = useParams<{ docId?: string }>();
  const [search, setSearch] = useState("");
  const docTitle = (item: DocItem) => t(item.titleKey);

  const activeId = docId && findItem(docId) ? docId : DEFAULT_DOC_ID;
  const active = useMemo(() => findItem(activeId) ?? ALL_ITEMS[0]!, [activeId]);
  const activeCategory = DOC_CATEGORIES.find((c) => c.items.some((i) => i.id === activeId));
  const activeIndex = ALL_ITEMS.findIndex((d) => d.id === activeId);
  const prev = activeIndex > 0 ? ALL_ITEMS[activeIndex - 1] : null;
  const next = activeIndex < ALL_ITEMS.length - 1 ? ALL_ITEMS[activeIndex + 1] : null;
  const toc = useMemo(() => extractToc(active.content), [active.content]);

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return DOC_CATEGORIES;
    return DOC_CATEGORIES.map((category) => ({
      ...category,
      items: category.items.filter((item) => matchesQuery(item, search, docTitle(item))),
    })).filter((category) => category.items.length > 0);
  }, [search, t]);

  useEffect(() => {
    if (!docId) {
      navigate(`/docs/${DEFAULT_DOC_ID}`, { replace: true });
    } else if (!findItem(docId)) {
      navigate(`/docs/${DEFAULT_DOC_ID}`, { replace: true });
    }
  }, [docId, navigate]);

  useEffect(() => {
    document.querySelector(".docs-content")?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }, [activeId]);

  function openDoc(id: string) {
    navigate(`/docs/${id}`);
  }

  const categoryTitle = (id: string) => t(`docs.${CATEGORY_I18N[id] ?? "categoryStart"}`);

  return (
    <>
      <div className="topbar docs-topbar">
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>
            {t("docs.title")}
          </h1>
          {activeCategory && (
            <span className="muted" style={{ fontSize: "0.9rem" }}>
              {categoryTitle(activeCategory.id)} / {docTitle(active)}
            </span>
          )}
        </div>
        <div className="docs-search-wrap">
          <input
            type="search"
            className="docs-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("docs.searchPlaceholder")}
            aria-label={t("docs.searchPlaceholder")}
          />
        </div>
      </div>

      <p className="docs-lang-note muted">{t("docs.languageNote")}</p>

      <div className="docs-layout">
        <aside className="docs-nav panel">
          <label className="docs-nav-mobile-label" htmlFor="docs-mobile-select">
            {t("docs.jumpTo")}
          </label>
          <select
            id="docs-mobile-select"
            className="docs-nav-mobile-select"
            value={activeId}
            onChange={(e) => openDoc(e.target.value)}
          >
            {DOC_CATEGORIES.map((category) => (
              <optgroup key={category.id} label={categoryTitle(category.id)}>
                {category.items.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {docTitle(doc)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          {filteredCategories.length === 0 ? (
            <p className="docs-no-results muted">{t("docs.noResults")}</p>
          ) : (
            filteredCategories.map((category) => (
              <div key={category.id} className="docs-nav-group">
                <div className="docs-nav-category">{categoryTitle(category.id)}</div>
                {category.items.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    className={`docs-nav-item ${doc.id === activeId ? "docs-nav-item-active" : ""}`}
                    onClick={() => openDoc(doc.id)}
                  >
                    {docTitle(doc)}
                  </button>
                ))}
              </div>
            ))
          )}
        </aside>

        <div className="docs-main">
          {active.related && active.related.length > 0 && (
            <div className="docs-related panel">
              <span className="docs-related-label">{t("docs.relatedPages")}</span>
              {active.related.map((link) => (
                <Link key={link.to} to={link.to} className="docs-related-link">
                  {t(link.labelKey)}
                </Link>
              ))}
            </div>
          )}

          <article className="panel docs-content">
            {toc.length > 0 && (
              <nav className="docs-toc-inline" aria-label={t("docs.onThisPage")}>
                <div className="docs-toc-title">{t("docs.onThisPage")}</div>
                <ul>
                  {toc.map((entry) => (
                    <li key={entry.id} className={entry.level === 3 ? "docs-toc-h3" : undefined}>
                      <a href={`#${entry.id}`}>{entry.text}</a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}

            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {active.content}
            </ReactMarkdown>

            <footer className="docs-footer-nav">
              {prev ? (
                <button type="button" className="docs-footer-btn" onClick={() => openDoc(prev.id)}>
                  <span className="docs-footer-dir">{t("docs.prev")}</span>
                  <span>{docTitle(prev)}</span>
                </button>
              ) : (
                <span />
              )}
              {next ? (
                <button type="button" className="docs-footer-btn docs-footer-btn-next" onClick={() => openDoc(next.id)}>
                  <span className="docs-footer-dir">{t("docs.next")}</span>
                  <span>{docTitle(next)}</span>
                </button>
              ) : (
                <span />
              )}
            </footer>
          </article>
        </div>
      </div>
    </>
  );
}
