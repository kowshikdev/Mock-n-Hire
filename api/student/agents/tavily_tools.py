"""Tavily tools for the prep agent.

Cluster-then-generate, never scrape-and-serve: these tools give the agent raw
research material, never a question it could repost verbatim. That is both a
Tavily/source ToS concern and a staleness one -- see
INTERVIEW_ARCHITECTURE.md section 4.

Two things below came from probing the real API before writing this, not from
the docs alone:

- `search(..., include_raw_content="markdown")` already returns full page
  text (8-29K chars in testing) for most results. Calling `extract` on those
  same URLs a second time burns credits for nothing, so `extract_pages` is
  described to the agent as a fallback for the *few* results that come back
  with empty content (paywalled or JS-rendered pages), not a default second
  step.
- A generic `topic="news"` query on a role title returned hiring-market noise
  ("AI can't fix cybersecurity's hiring problem") rather than anything
  role-specific, so there is deliberately no dedicated "market context" tool
  -- `search_web` is general-purpose and the agent's own judgement decides
  whether a news angle is worth a credit for a given company.
"""

from __future__ import annotations

import logging
from typing import Literal

from langchain.tools import tool
from tavily import TavilyClient

logger = logging.getLogger(__name__)

# Where real, reported interview experiences actually get posted. Narrower
# than a plain web search so results are worth the "advanced" search cost.
INTERVIEW_REPORT_DOMAINS = [
    "glassdoor.com",
    "leetcode.com",
    "reddit.com",
    "teamblind.com",
    "interviewquery.com",
]

MAX_CONTENT_CHARS = 6000  # per result, keeps the agent's context from being dominated by one long page


def _format_results(results: list[dict]) -> str:
    if not results:
        return "No results."
    parts = []
    for r in results:
        raw = (r.get("raw_content") or "").strip()
        body = raw[:MAX_CONTENT_CHARS] if raw else "(no inline content -- call extract_pages on this url if you need it)"
        parts.append(
            f"### {r.get('title', 'Untitled')}\n"
            f"URL: {r.get('url')}\n"
            f"Published: {r.get('published_date', 'unknown')}\n\n"
            f"{body}"
        )
    return "\n\n---\n\n".join(parts)


def build_tavily_tools(api_key: str) -> list:
    client = TavilyClient(api_key=api_key)

    @tool(parse_docstring=True)
    def search_interview_reports(company: str, role: str, max_results: int = 8) -> str:
        """Search for real, reported interview experiences for a company and role.

        Searches Glassdoor, LeetCode Discuss, Reddit, Blind, and Interview
        Query specifically -- the places candidates actually post what an
        interview was like. Returns full page content inline where available.

        Args:
            company: Company name to search for.
            role: Job title or role to search for.
            max_results: Maximum number of results (default 8, max ~10 is
                usually enough -- more than that is rarely worth the extra
                advanced-search credits).
        """
        try:
            r = client.search(
                query=f"{company} {role} interview experience questions asked",
                search_depth="advanced",
                topic="general",
                max_results=max_results,
                time_range="year",
                include_domains=INTERVIEW_REPORT_DOMAINS,
                include_raw_content="markdown",
            )
        except Exception as e:
            logger.warning(f"search_interview_reports failed: {e}")
            return f"Search failed: {e}"
        return _format_results(r.get("results", []))

    @tool(parse_docstring=True)
    def search_web(
        query: str,
        max_results: int = 6,
        topic: Literal["general", "news"] = "general",
        time_range: Literal["day", "week", "month", "year"] | None = None,
    ) -> str:
        """General-purpose web search, for anything search_interview_reports
        doesn't cover -- the company's own hiring page, what the role
        typically pays, recent news about the team you're researching, and
        so on.

        A `topic="news"` search on a role title alone tends to return generic
        hiring-market commentary rather than anything specific to that role
        -- only use it when you have a specific company or event to search
        for, not as a routine step.

        Args:
            query: Search query.
            max_results: Maximum number of results.
            topic: "general" or "news".
            time_range: Restrict to this recency, or omit for no limit.
        """
        try:
            r = client.search(
                query=query,
                topic=topic,
                max_results=max_results,
                time_range=time_range,
                include_raw_content="markdown",
            )
        except Exception as e:
            logger.warning(f"search_web failed: {e}")
            return f"Search failed: {e}"
        return _format_results(r.get("results", []))

    @tool(parse_docstring=True)
    def extract_pages(urls: list[str]) -> str:
        """Fetch full content for URLs that came back with no inline content
        from search_interview_reports or search_web.

        Do not call this on URLs that already returned content -- that
        content is already what this would fetch, and calling it anyway
        spends credits reading a page you already have.

        Args:
            urls: URLs to fetch, at most 5 at a time.
        """
        try:
            r = client.extract(urls=urls[:5], format="markdown")
        except Exception as e:
            logger.warning(f"extract_pages failed: {e}")
            return f"Extract failed: {e}"

        parts = []
        for res in r.get("results", []):
            content = (res.get("raw_content") or "")[:MAX_CONTENT_CHARS]
            parts.append(f"URL: {res.get('url')}\n\n{content}")
        for fail in r.get("failed_results", []):
            parts.append(f"URL: {fail.get('url', '?')} -- failed: {fail.get('error')}")
        return "\n\n---\n\n".join(parts) if parts else "No content extracted."

    @tool(parse_docstring=True)
    def map_company_domain(url: str, instructions: str = "") -> str:
        """Discover pages on a company's own domain -- their engineering
        blog, careers page, or similar -- to ground questions in what the
        company says about itself rather than a forum's guess.

        This only discovers URLs; follow up with extract_pages on the ones
        that look worth reading.

        Args:
            url: A starting URL on the company's domain, e.g. their engineering blog.
            instructions: Optional natural-language hint about what kind of pages to find.
        """
        try:
            r = client.map(url=url, instructions=instructions or None)
        except Exception as e:
            logger.warning(f"map_company_domain failed: {e}")
            return f"Map failed: {e}"
        urls = r.get("results", [])
        return "\n".join(urls[:40]) if urls else "No pages discovered."

    return [search_interview_reports, search_web, extract_pages, map_company_domain]
