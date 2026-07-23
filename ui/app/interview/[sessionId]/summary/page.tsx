import SummaryPageClient from "./summary-client";

// See app/dashboard/recruiter/results/[jobId]/page.tsx for why this thin
// Server Component wrapper exists (Next.js 15 async params + react@18.2.0,
// no `use()` hook available in the Client Component that has the real logic).
export default async function Page({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <SummaryPageClient sessionId={sessionId} />;
}
