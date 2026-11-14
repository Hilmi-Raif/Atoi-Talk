import Logo from "@/components/logo";
import { ModeToggle } from "@/components/mode-toggle";
import { useTheme } from "@/components/providers/theme-provider";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import TextType from "@/components/ui/text-type";
import { Github } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

export default function Landing() {
  const { theme } = useTheme();
  const [isDesktopPreviewLoaded, setIsDesktopPreviewLoaded] = useState(false);
  const [isMobilePreviewLoaded, setIsMobilePreviewLoaded] = useState(false);

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground font-sans">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border/40 bg-background/85 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center">
            <Logo mode={theme} width={23} height={26} />
            <p className="text-2xl font-semibold tracking-tight sm:text-2xl">AtoiTalk</p>
          </div>
          <ModeToggle />
        </div>
      </header>

      <div className="h-full pt-16">
        <ScrollArea className="h-full w-full">
          <div className="flex min-h-[calc(100vh-4rem)] flex-col">
            <main className="flex flex-1 items-center">
              <section className="container mx-auto w-full px-8 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-0">
                <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 sm:gap-12 lg:grid lg:grid-cols-[470px_500px] lg:items-center lg:justify-center lg:gap-3 xl:grid-cols-[500px_520px] xl:gap-5">
                  <div className="order-2 flex flex-col gap-5 text-center lg:order-1 lg:w-[470px] lg:max-w-none lg:justify-self-start lg:text-left xl:w-[500px]">
                    <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                      A Better Way To
                      <span className="block">
                        <TextType
                          as="span"
                          text={["Connect.", "Communicate.", "Collaborate."]}
                          typingSpeed={80}
                          deletingSpeed={45}
                          pauseDuration={1300}
                          initialDelay={250}
                          cursorCharacter="_"
                          className="inline-block"
                        />
                      </span>
                    </h1>
                    <p className="mx-auto max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base lg:mx-0">
                      AtoiTalk helps you chat faster, share files, and keep conversations organized
                      in one clean workspace.
                    </p>
                    <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-center lg:justify-start">
                      <Link to="/register" className="w-full sm:w-auto">
                        <Button size="lg" className="h-12 w-full px-8 text-base sm:w-auto">
                          Create account
                        </Button>
                      </Link>
                      <Link to="/login" className="w-full sm:w-auto">
                        <Button
                          variant="outline"
                          size="lg"
                          className="h-12 w-full px-8 text-base sm:w-auto"
                        >
                          Sign in
                        </Button>
                      </Link>
                    </div>
                  </div>

                  <div className="order-1 mx-auto flex w-full max-w-md items-end justify-center lg:order-2 lg:w-[500px] lg:max-w-none lg:justify-start xl:w-[520px]">
                    <div className="relative w-full max-w-[320px] rounded-xl border-[7px] border-gray-800 bg-gray-800 sm:w-[420px] sm:max-w-none sm:rounded-t-2xl sm:border-8">
                      <div className="relative aspect-square overflow-hidden rounded-lg bg-background">
                        {!isDesktopPreviewLoaded && (
                          <div className="absolute inset-0 p-3 sm:p-4">
                            <div className="flex h-full flex-col gap-2 sm:gap-3">
                              <Skeleton className="h-4 w-2/3 rounded-sm" />
                              <Skeleton className="h-8 w-full rounded-sm" />
                              <div className="grid flex-1 grid-cols-5 gap-2">
                                <Skeleton className="col-span-2 h-full rounded-sm" />
                                <Skeleton className="col-span-3 h-full rounded-sm" />
                              </div>
                            </div>
                          </div>
                        )}
                        <img
                          src="/preview-1.webp"
                          className={`h-full w-full object-cover object-left-top transition-opacity duration-300 ${
                            isDesktopPreviewLoaded ? "opacity-100" : "opacity-0"
                          }`}
                          alt="AtoiTalk desktop view"
                          loading="lazy"
                          onLoad={() => setIsDesktopPreviewLoaded(true)}
                          onError={() => setIsDesktopPreviewLoaded(true)}
                        />
                      </div>
                      <div className="absolute left-1/2 top-full hidden h-5 w-[108%] max-w-[440px] -translate-x-1/2 rounded-b-xl rounded-t-sm bg-gray-900 dark:bg-gray-700 sm:block">
                        <div className="absolute left-1/2 top-0 h-1.5 w-16 -translate-x-1/2 rounded-b-md bg-gray-800" />
                      </div>
                    </div>

                    <div className="relative -ml-10 mb-[-22px] w-[120px] rounded-2xl border-[7px] border-gray-800 bg-gray-800 sm:-ml-12 sm:w-[145px]">
                      <div className="relative aspect-[515/1103] overflow-hidden rounded-xl bg-background">
                        {!isMobilePreviewLoaded && (
                          <div className="absolute inset-0 p-2">
                            <div className="flex h-full flex-col gap-2">
                              <Skeleton className="h-3 w-4/5 rounded-sm" />
                              <Skeleton className="h-8 w-full rounded-sm" />
                              <Skeleton className="h-full w-full rounded-sm" />
                            </div>
                          </div>
                        )}
                        <img
                          src="/preview-2.webp"
                          className={`h-full w-full object-cover object-top transition-opacity duration-300 ${
                            isMobilePreviewLoaded ? "opacity-100" : "opacity-0"
                          }`}
                          alt="AtoiTalk mobile view"
                          loading="lazy"
                          onLoad={() => setIsMobilePreviewLoaded(true)}
                          onError={() => setIsMobilePreviewLoaded(true)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </main>

            <footer className="border-t border-border/40 py-4 sm:py-5">
              <div className="container mx-auto flex items-center justify-center gap-3 px-4 text-sm text-muted-foreground sm:px-6 md:justify-end lg:px-8">
                <span>AtoiTalk © {new Date().getFullYear()}</span>
                <span className="h-4 w-px bg-border" />
                <a
                  href="https://github.com/hilmi-raif/atoitalk"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-foreground"
                >
                  <Github className="size-4" />
                </a>
              </div>
            </footer>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
