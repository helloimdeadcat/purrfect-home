import Link from "next/link";

import { LoginForm } from "@/components/forms/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = {
  searchParams: Promise<{ invite?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const { invite } = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Link href="/" className="hover:opacity-80">
            Purrfect Home
          </Link>
        </CardTitle>
        <CardDescription>
          {invite ? "Sign in to accept your invitation" : "Sign in to your household"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm inviteToken={invite} />
      </CardContent>
    </Card>
  );
}
