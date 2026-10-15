import Link from "next/link";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPlatformInfo, iconUrl } from "@/lib/platform";
import HomeLogo from "@/components/HomeLogo";

export default async function HomePage() {
  const platform = await getPlatformInfo();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-12 text-center animate-fade-in">
      <HomeLogo src={iconUrl(platform.icon, encodeURIComponent(platform.primaryColor))} initial={platform.name.slice(0, 1).toUpperCase()} />
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{platform.name}</h1>
        {platform.title && <p className="text-muted-foreground md:text-lg">{platform.title}</p>}
      </div>
      <Button asChild size="lg">
        <Link href="/login"><LogIn className="h-4 w-4 mr-2" />Log in</Link>
      </Button>
    </main>
  );
}
