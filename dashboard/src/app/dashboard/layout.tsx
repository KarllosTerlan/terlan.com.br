import AuthGuard from '@/components/auth-guard';
import { Sidebar } from '@/components/sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="min-h-screen px-4 py-5 md:px-6">
        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <Sidebar />
          <main className="space-y-5 min-w-0 animate-fade-in">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
