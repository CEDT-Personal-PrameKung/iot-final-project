"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { login, register } from "@/features/auth/actions";
import {
  initialAuthFormState,
  type AuthFormState,
} from "@/features/auth/auth-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";

type AuthFormMode = "login" | "register";

const copy = {
  login: {
    title: "Welcome back",
    description: "Sign in to your Smart Parking account.",
    submit: "Sign in",
    footer: "New to Smart Parking?",
    link: "Create an account",
    href: "/register",
  },
  register: {
    title: "Create your account",
    description: "Get started with Smart Parking.",
    submit: "Create account",
    footer: "Already have an account?",
    link: "Sign in",
    href: "/login",
  },
} satisfies Record<AuthFormMode, Record<string, string>>;

export function AuthForm({ mode }: { mode: AuthFormMode }) {
  const isRegister = mode === "register";
  const content = copy[mode];
  const action = isRegister ? register : login;
  const [state, formAction, isPending] = useActionState<AuthFormState, FormData>(
    action,
    initialAuthFormState,
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="gap-2 px-6 pt-6">
          <CardTitle>
            <h1 className="text-xl font-semibold">{content.title}</h1>
          </CardTitle>
          <CardDescription>{content.description}</CardDescription>
        </CardHeader>

        <CardContent className="px-6">
          <form action={formAction} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <InputGroup>
                <InputGroupInput
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={isRegister ? 8 : 1}
                  maxLength={128}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    title={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((prev) => !prev)}
                  >
                    {showPassword ? (
                      <EyeOff aria-hidden="true" />
                    ) : (
                      <Eye aria-hidden="true" />
                    )}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </div>

            {isRegister && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <InputGroup>
                  <InputGroupInput
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                    minLength={8}
                    maxLength={128}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      size="icon-xs"
                      aria-label={
                        showConfirmPassword
                          ? "Hide confirm password"
                          : "Show confirm password"
                      }
                      aria-pressed={showConfirmPassword}
                      title={
                        showConfirmPassword
                          ? "Hide confirm password"
                          : "Show confirm password"
                      }
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                    >
                      {showConfirmPassword ? (
                        <EyeOff aria-hidden="true" />
                      ) : (
                        <Eye aria-hidden="true" />
                      )}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </div>
            )}

            {state.error && (
              <p className="text-sm text-destructive" role="alert">
                {state.error}
              </p>
            )}

            {state.success && (
              <p className="text-sm text-primary" role="status">
                {state.success}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isPending || Boolean(state.success)}
            >
              {isPending ? "Please wait…" : content.submit}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center gap-1 px-6 py-4 text-sm">
          <span className="text-muted-foreground">{content.footer}</span>
          <Link
            className="font-medium text-primary underline-offset-4 hover:underline"
            href={content.href}
          >
            {content.link}
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
