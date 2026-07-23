import ResultsPageClient from "./results-client";

// Next.js 15 made dynamic-route `params` a Promise for Server Components.
// This page's actual logic is a Client Component (state, effects, browser
// APIs), and this project pins react@18.2.0 (no `use()` hook to unwrap a
// Promise inside a Client Component), so the fix is this thin async Server
// Component wrapper: await params here, then pass the resolved value down
// as a plain prop.
export default async function Page({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  return <ResultsPageClient jobId={jobId} />;
}
