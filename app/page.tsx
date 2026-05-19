import Image from "next/image";
import { Poppins } from "next/font/google";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export default function Home() {
  return (
    <div
      className={`${poppins.className} min-h-screen bg-[#F8F9FC] text-slate-900 px-6 py-10 dark:bg-black dark:text-white`}
    >
      <div className="mx-auto max-w-xl rounded-3xl border border-[#d6dfee] bg-white p-8 shadow-xl shadow-zinc-200/50 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-none">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-20 w-30 items-center justify-center">
            <Image
              src="/alerta-home-logo.png"
              alt="Alerta Home logo"
              width={200}
              height={150}
              priority
            />
          </div>
        </div>
        <div>
          <h1 className="text-lg font-medium text-center mt-4">
            Alerta Referral Hub
          </h1>
        </div>
      </div>
    </div>
  );
}
