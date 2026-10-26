import Link from "next/link";

import { AcceptInvitePanel } from "@/components/invite/accept-invite-panel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSessionUser } from "@/lib/auth/session";

type Props = {
  searchParams: Promise<{ token?: string }>;
};

export default async function InvitePage({ searchParams }: Props) {
  const { token } = await searchParams;
  const { user } = await getSessionUser();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Link href="/" className="hover:opacity-80">
            Purrfect Home
          </Link>
        </CardTitle>
        <CardDescription>Household invitation</CardDescription>
      </CardHeader>
      <CardContent>
        {!token ? (
          <p className="text-sm text-muted-foreground">
            Missing invitation token. Ask your household owner for a new invite
            link, or{" "}
            <Link href="/login" className="underline underline-offset-4">
              sign in
            </Link>
            .
          </p>
        ) : (
          <AcceptInvitePanel
            token={token}
            isAuthenticated={Boolean(user)}
            userEmail={user?.email ?? null}
          />
        )}
      </CardContent>
    </Card>
  );
}
