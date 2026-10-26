import Link from "next/link";

import { RegisterForm } from "@/components/forms/register-form";
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

export default async function RegisterPage({ searchParams }: Props) {
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
          {invite
            ? "Create an account to join a household"
            : "Create your family household"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RegisterForm inviteToken={invite} />
      </CardContent>
    </Card>
  );
}
