"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Poppins } from "next/font/google";
import Image from "next/image";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const REFERRAL_REGEX = /^[A-Z]{2,20}-[A-Z0-9]{4}$/;

type ReferralStatus = "preparing" | "redirecting" | "error";

const referralUi = {
  preparing: {
    title: "Verifying your referral",
    description: "We are checking your referral link before continuing.",
    detail: "Preparing a secure redirect...",
    detailClass:
      "bg-[#f2f4f8] text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
  },
  redirecting: {
    title: "Redirecting",
    description: "Please wait while we take you to Alerta Home.",
    detail: "Taking you to Alerta Home...",
    detailClass:
      "bg-[#eef6ff] text-[#1d4f8f] dark:bg-blue-950/40 dark:text-blue-200",
  },
  error: {
    title: "Something went wrong",
    description: "We could not complete this redirect.",
    detail: "Please try again, or contact support if the issue continues.",
    detailClass:
      "bg-[#fff1f1] text-[#a33a3a] dark:bg-red-950/40 dark:text-red-200",
  },
} satisfies Record<
  ReferralStatus,
  {
    title: string;
    description: string;
    detail: string;
    detailClass: string;
  }
>;

interface ReferralPageProps {
  params: Promise<{
    referral: string;
  }>;
}

export default function ReferralPage({ params }: ReferralPageProps) {
  const router = useRouter();
  const { referral } = use(params);
  const [status, setStatus] = useState<ReferralStatus>("preparing");
  const [error, setError] = useState<string | null>(null);
  const ui = referralUi[status];

  useEffect(() => {
    const referralId = referral?.trim().toUpperCase();

    if (!referralId || !REFERRAL_REGEX.test(referralId)) {
      router.replace("/referral-invalid");
      return;
    }

    async function saveAndRedirect() {
      setStatus("redirecting");
      setError(null);

      try {
        const response = await fetch(
          `/api/referral-visit/${encodeURIComponent(referralId)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ referrer: document.referrer }),
          },
        );

        if (!response.ok) {
          if (response.status === 404) {
            router.replace("/referral-invalid");
            return;
          }

          const body = await response.json().catch(() => null);
          throw new Error(
            body?.error ||
              `An error occurred while preparing the redirect (${response.status})`,
          );
        }

        const data = await response.json();

        if (!data?.redirectUrl) {
          throw new Error("Unable to retrieve redirect URL.");
        }

        setStatus("redirecting");
        window.location.href = data.redirectUrl;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "An unknown error occurred.",
        );
        setStatus("error");
      }
    }

    saveAndRedirect();
  }, [referral, router]);

  return (
    <div
      className={`${poppins.className} min-h-screen bg-[#F8F9FC] text-slate-900 px-6 py-10 dark:bg-black dark:text-white`}
    >
      <div className="mx-auto max-w-2xl rounded-3xl border border-[#d6dfee] bg-white p-8 shadow-xl shadow-zinc-200/50 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-none">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-30 w-45 items-center justify-center">
            <Image
              src="/alerta-home-logo.png"
              alt="Alerta Home logo"
              width={200}
              height={150}
              priority
            />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">{ui.title}</h1>
            <p className="mt-3 text-sm text-[#9E9E9A] dark:text-zinc-400">
              {ui.description}
            </p>
          </div>

          <div
            className={`w-full mt-4 rounded-2xl px-5 py-4 text-center text-sm ${ui.detailClass}`}
          >
            {error || ui.detail}
          </div>

          {status === "error" && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-2 rounded-full bg-[#1f2937] px-5 py-2 text-sm font-medium text-white transition hover:bg-[#111827] dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
