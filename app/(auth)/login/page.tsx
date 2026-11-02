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
          {invite ? "Войди, чтобы принять приглашение" : "Войди в свою семью"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm inviteToken={invite} />
      </CardContent>
    </Card>
  );
}
