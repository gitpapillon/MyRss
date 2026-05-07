import { listArticles } from "@/lib/db";
import ReaderShell from "@/components/ReaderShell";

export const dynamic = "force-dynamic";

export default function Home() {
  const initial = listArticles({ limit: 200 });
  return (
    <main className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <ReaderShell initial={initial} />
    </main>
  );
}
