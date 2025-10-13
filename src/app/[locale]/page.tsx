import ClientPage from "./client";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "json" });

  return {
    title: `${t("title")} - Tools by AI`,
    description: t("description"),
  };
}

export default function Page() {
  return <ClientPage />;
}
