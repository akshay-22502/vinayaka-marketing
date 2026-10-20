import { SiteFrame } from "@/components/site/SiteFrame";

export const revalidate = 3600;

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <SiteFrame>{children}</SiteFrame>;
}
