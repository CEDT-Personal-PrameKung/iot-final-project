"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { register } from "@/app/register/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const initialState = { error: null, success: null };

export function RegisterForm() {
  const [state, formAction, isPending] = useActionState(register, initialState);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  return (
    <Card className="w-full max-w-sm gap-6 py-6 shadow-sm">
      <CardHeader className="gap-2 px-6">
        <CardTitle className="type-heading-3">Create an account</CardTitle>
        <CardDescription className="type-paragraph-small">
          Register for a Smart Parking guest account.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-6">
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <label className="type-paragraph-small font-medium" htmlFor="email">
              Email
            </label>
            <Input
              autoComplete="email"
              id="email"
              name="email"
              placeholder="you@example.com"
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="type-paragraph-small font-medium" htmlFor="password">
              Password
            </label>
            <Input
              autoComplete="new-password"
              id="password"
              maxLength={128}
              minLength={8}
              name="password"
              placeholder="At least 8 characters"
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label
              className="type-paragraph-small font-medium"
              htmlFor="confirmPassword"
            >
              Confirm password
            </label>
            <Input
              autoComplete="new-password"
              id="confirmPassword"
              maxLength={128}
              minLength={8}
              name="confirmPassword"
              placeholder="Re-enter your password"
              required
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>
          {state.success && (
            <p className="type-paragraph-small text-primary" role="status">
              {state.success}
            </p>
          )}
          {state.error && (
            <p className="type-paragraph-small text-destructive" role="alert">
              {state.error}
            </p>
          )}
          <Button className="w-full" disabled={isPending || Boolean(state.success)} type="submit">
            {isPending ? "Creating account…" : "Create account"}
          </Button>
        </form>
        <p className="type-paragraph-small mt-4 text-center text-muted-foreground">
          Already have an account?{" "}
          <Link className="font-medium text-foreground underline-offset-4 hover:underline" href="/login">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
