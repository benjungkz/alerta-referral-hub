import Image from "next/image";
import { Poppins } from "next/font/google";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const shopifyHomeUrl =
  process.env.SHOPIFY_HOME_URL || "https://www.alertahome.com/";

const invalidReferralUrl = new URL(shopifyHomeUrl);
invalidReferralUrl.searchParams.set("utm_source", "referral");
invalidReferralUrl.searchParams.set("utm_medium", "invalid_link");
invalidReferralUrl.searchParams.set("utm_campaign", "invalid_referral");
invalidReferralUrl.searchParams.set("utm_content", "referral_invalid_page");

export default function ReferralInvalidPage() {
  return (
    <main
      className={`${poppins.className} min-h-screen bg-[#F8F9FC] px-6 py-10 text-slate-900 dark:bg-black dark:text-white`}
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
            <h1 className="text-2xl font-semibold">Invalid Referral Link</h1>
            <p className="mt-3 text-sm text-[#9E9E9A] dark:text-zinc-400">
              This referral link may be expired, incomplete, or mistyped.
            </p>
          </div>

          <div className="mt-4 w-full rounded-2xl bg-[#f2f4f8] px-5 py-4 text-center text-sm text-[#6b6b68] dark:bg-red-950/40 dark:text-red-200">
            You can still continue to Alerta Home and browse our latest
            products.
          </div>

          <a
            href={invalidReferralUrl.toString()}
            className="mt-2 rounded-full bg-[#3662c1] px-5 py-2 text-sm font-medium text-white transition dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Continue to Alerta Home
          </a>
        </div>
      </div>
    </main>
  );
}
