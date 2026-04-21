import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { MotivatingAtmosphere } from "@/components/MotivatingAtmosphere";

export default async function Home() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] selection:bg-[var(--accent-primary)]/20 flex flex-col font-sans relative overflow-hidden">
      {/* Motivating Atmosphere (Audio + Quotes) */}
      <MotivatingAtmosphere />

      {/* Atmospheric Background Layers */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[var(--border-default)] to-transparent opacity-50" />
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-bl from-[var(--surface-secondary)] to-transparent opacity-60" />
        <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-[var(--accent-primary)]/5 blur-[120px]" />
        <div className="absolute bottom-[10%] right-[5%] w-[40%] h-[50%] rounded-full bg-[var(--accent-secondary)]/5 blur-[100px]" />
        
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMCwwLDAsMC4wNSkiLz48L3N2Zz4=')] opacity-50 mask-image:linear-gradient(to_bottom,white,transparent)" />
      </div>

      {/* Navigation */}
      <nav className="w-full px-8 py-6 flex items-center justify-between z-50 border-b border-[var(--border-default)]/50 backdrop-blur-sm">
        <div className="flex items-center gap-3 group cursor-pointer">
          <div className="w-10 h-10 bg-[var(--foreground)] rounded-none flex items-center justify-center transition-transform group-hover:rotate-12 duration-500">
            <span className="font-serif font-bold text-lg text-[var(--background)]">S</span>
          </div>
          <span className="text-xl font-bold tracking-tight text-[var(--text-primary)] group-hover:text-[var(--accent-primary)] transition-colors">
            Sentinence
          </span>
        </div>
        <div className="flex items-center gap-8 text-sm font-medium text-[var(--text-secondary)]">
          <a href="#features" className="hover:text-[var(--foreground)] transition-colors">
            The Method
          </a>
          <a href="#" className="hover:text-[var(--foreground)] transition-colors">
            Manifesto
          </a>
          <a
            href="http://localhost:8000/login"
            className="px-5 py-2 border border-[var(--border-default)] hover:border-[var(--foreground)] text-[var(--foreground)] transition-all duration-300"
          >
            Sign In
          </a>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 relative z-10 my-20">
        <div className="flex flex-col items-center space-y-10 max-w-4xl mx-auto">
          
          <div className="inline-flex items-center border border-[var(--border-default)] bg-[var(--surface-primary)]/80 px-5 py-2 text-xs uppercase tracking-[0.2em] text-[var(--text-secondary)] backdrop-blur-md shadow-sm">
            <span className="flex h-1.5 w-1.5 rounded-full bg-[var(--accent-primary)] mr-3 animate-pulse" />
            Interview Intelligence Redefined
          </div>

          <h1 className="text-6xl sm:text-8xl font-serif text-[var(--text-primary)] leading-[1.05] tracking-tight">
            Elevate Your <br />
            <span className="italic text-[var(--text-secondary)]">Narrative.</span>
          </h1>

          <p className="text-xl text-[var(--text-secondary)] max-w-2xl leading-relaxed font-light">
            Sentinence analyzes micro-expressions, vocal cadence, and behavioral markers to provide rigorous, actionable insights into your professional presence.
          </p>

          <div className="pt-6 flex flex-col sm:flex-row gap-5 items-center w-full justify-center">
            <a
              href="http://localhost:8000/login"
              className="group relative flex h-14 w-full sm:w-auto items-center justify-center gap-3 overflow-hidden bg-[var(--foreground)] px-10 text-[var(--background)] font-medium transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-[var(--foreground)]/10 active:scale-[0.98]"
            >
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500 ease-out" />
              <span className="relative flex items-center gap-2">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="currentColor"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="currentColor"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="currentColor"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="currentColor"
                  />
                </svg>
                Continue with Google
              </span>
            </a>

            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-14 w-full sm:w-auto items-center justify-center gap-2 border border-[var(--border-default)] bg-[var(--surface-primary)] px-10 text-[var(--text-secondary)] font-medium transition-all hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]"
            >
              Examine the Architecture
            </a>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-8 text-center text-sm text-[var(--text-tertiary)] border-t border-[var(--border-default)] bg-[var(--surface-primary)]/50 backdrop-blur-sm z-50">
        <p className="tracking-widest uppercase text-xs">© {new Date().getFullYear()} Sentinence Group. All rights reserved.</p>
      </footer>
    </div>
  );
}
