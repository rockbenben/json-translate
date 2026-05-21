import ClientPage from "./client";
import { ToolPageShell, generatePageMetadata } from "@/app/lib/toolPageShell";

export const generateMetadata = generatePageMetadata("jsonTranslate");

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <ToolPageShell toolKey="jsonTranslate" locale={locale}>
      <ClientPage />
    </ToolPageShell>
  );
}