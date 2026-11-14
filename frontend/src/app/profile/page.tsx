import { AppShell } from "@/components/shared/app-shell";

export default function ProfilePage() {
  return (
    <AppShell activePath="/profile">
      <h1 className="type-heading-2">Profile</h1>
      <p className="type-paragraph mt-4 text-muted-foreground">Profile details are not available yet.</p>
    </AppShell>
  );
}
