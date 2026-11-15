"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { login } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const initialState = { error: null };

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(login, initialState);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <Card className="w-full max-w-sm gap-6 py-6 shadow-sm">
      <CardHeader className="gap-2 px-6">
        <CardTitle className="type-heading-3">Welcome back</CardTitle>
        <CardDescription className="type-paragraph-small">
          Sign in to your Smart Parking account.
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
              autoComplete="current-password"
              id="password"
              name="password"
              placeholder="Enter your password"
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {state.error && (
            <p className="type-paragraph-small text-destructive" role="alert">
              {state.error}
            </p>
          )}
          <Button className="w-full" disabled={isPending} type="submit">
            {isPending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="type-paragraph-small mt-4 text-center text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link className="font-medium text-foreground underline-offset-4 hover:underline" href="/register">
            Register
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
